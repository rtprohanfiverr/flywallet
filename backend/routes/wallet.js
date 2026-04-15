const express = require('express');
const { z } = require('zod');
const { Decimal } = require('@prisma/client/runtime/library');
const prisma = require('../lib/prisma');
const { requireAuth, checkNotFrozen } = require('../middleware/auth');
const { createDepositIntent } = require('../lib/stripe');
const { enqueueWithdrawal, getWithdrawalQueue } = require('../lib/queue');

const router = express.Router();

const depositSchema = z.object({
  amount: z.number().positive().min(10).max(50000),
  stripePaymentIntentId: z.string().optional(),
});

const withdrawSchema = z.object({
  amount: z.number().positive().min(10),
});

// ── GET /api/wallet ───────────────────────────────────────────────────────────
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.userId },
    });
    if (!wallet) return res.status(404).json({ error: 'Wallet not found' });

    const transactions = await prisma.transaction.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      wallet: {
        balance:       Number(wallet.balance),
        lockedBalance: Number(wallet.lockedBalance),
        bonusEarned:   Number(wallet.bonusEarned),
        available:     Number(wallet.balance) - Number(wallet.lockedBalance),
      },
      transactions,
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/wallet/deposit ──────────────────────────────────────────────────
router.post('/deposit', requireAuth, checkNotFrozen, async (req, res, next) => {
  try {
    const { amount, stripePaymentIntentId } = depositSchema.parse(req.body);

    // Create Stripe PaymentIntent (or mock)
    const intent = await createDepositIntent(amount, req.userId);

    // In production: verify intent.status === 'succeeded' before crediting
    // For demo: we credit immediately
    const result = await prisma.$transaction(async (tx) => {
      const txn = await tx.transaction.create({
        data: {
          userId:      req.userId,
          type:        'DEPOSIT',
          amount,
          status:      'COMPLETED',
          description: 'Deposit via Stripe',
          stripeId:    intent.id,
          metadata:    { intentStatus: intent.status },
        },
      });

      const wallet = await tx.wallet.update({
        where:  { userId: req.userId },
        data:   { balance: { increment: amount } },
      });

      return { txn, wallet };
    });

    res.status(201).json({
      message:     'Deposit successful',
      transaction: result.txn,
      balance:     Number(result.wallet.balance),
      clientSecret: intent.client_secret ?? null,
    });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
});

// ── POST /api/wallet/withdraw ─────────────────────────────────────────────────
router.post('/withdraw', requireAuth, checkNotFrozen, async (req, res, next) => {
  try {
    const { amount } = withdrawSchema.parse(req.body);

    // Fetch config
    const config = await prisma.systemConfig.findUnique({ where: { key: 'withdrawal_threshold' } });
    const threshold = config ? parseFloat(config.value) : 50000;

    // Fetch today's total withdrawals for liquidity check
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayWithdrawals = await prisma.transaction.aggregate({
      where: {
        type:      'WITHDRAWAL',
        status:    { in: ['COMPLETED', 'QUEUED', 'PENDING'] },
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    });

    const totalToday = Number(todayWithdrawals._sum.amount ?? 0);
    const shouldQueue = totalToday + amount > threshold;

    // Check user balance atomically
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.userId } });
      if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });

      const available = Number(wallet.balance) - Number(wallet.lockedBalance);
      if (available < amount) {
        throw Object.assign(
          new Error(`Insufficient balance. Available: $${available.toFixed(2)}`),
          { status: 400 }
        );
      }

      const status = shouldQueue ? 'QUEUED' : 'PENDING';

      const txn = await tx.transaction.create({
        data: {
          userId:      req.userId,
          type:        'WITHDRAWAL',
          amount,
          status,
          description: shouldQueue ? 'Withdrawal queued (processing)' : 'Withdrawal initiated',
        },
      });

      // Lock the balance
      const updated = await tx.wallet.update({
        where: { userId: req.userId },
        data:  { lockedBalance: { increment: amount } },
      });

      return { txn, wallet: updated, shouldQueue };
    });

    // If not queued, process immediately via BullMQ (or direct)
    if (!shouldQueue) {
      try {
        await enqueueWithdrawal({
          transactionId: result.txn.id,
          userId:        req.userId,
          amount,
        });
      } catch {
        // Redis not available — process inline
        await prisma.$transaction([
          prisma.transaction.update({
            where: { id: result.txn.id },
            data:  { status: 'COMPLETED' },
          }),
          prisma.wallet.update({
            where: { userId: req.userId },
            data:  {
              balance:       { decrement: amount },
              lockedBalance: { decrement: amount },
            },
          }),
        ]);
      }
    }

    res.status(201).json({
      message:    shouldQueue ? 'Withdrawal queued — processing within 24h' : 'Withdrawal initiated',
      status:     shouldQueue ? 'QUEUED' : 'PENDING',
      transaction: result.txn,
    });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ── GET /api/wallet/transactions ──────────────────────────────────────────────
router.get('/transactions', requireAuth, async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip  = (page - 1) * limit;

    const [total, transactions] = await prisma.$transaction([
      prisma.transaction.count({ where: { userId: req.userId } }),
      prisma.transaction.findMany({
        where:   { userId: req.userId },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    res.json({ transactions, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
