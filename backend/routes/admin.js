const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// All admin routes require ADMIN role
router.use(requireAdmin);

// ── GET /api/admin/stats ──────────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalUsers,
      frozenUsers,
      depositStats,
      withdrawalStats,
      bookingStats,
      bonusStats,
      walletTotals,
      recentTxns,
    ] = await prisma.$transaction([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.user.count({ where: { isFrozen: true } }),
      prisma.transaction.aggregate({ where: { type: 'DEPOSIT',    status: 'COMPLETED' }, _sum: { amount: true }, _count: true }),
      prisma.transaction.aggregate({ where: { type: 'WITHDRAWAL', status: { in: ['COMPLETED', 'QUEUED', 'PENDING'] } }, _sum: { amount: true }, _count: true }),
      prisma.transaction.aggregate({ where: { type: 'BOOKING',    status: 'COMPLETED' }, _sum: { amount: true }, _count: true }),
      prisma.transaction.aggregate({ where: { type: 'BONUS',      status: 'COMPLETED' }, _sum: { amount: true }, _count: true }),
      prisma.wallet.aggregate({ _sum: { balance: true, lockedBalance: true } }),
      prisma.transaction.findMany({ orderBy: { createdAt: 'desc' }, take: 10, include: { user: { select: { name: true, email: true } } } }),
    ]);

    const bonusRateConfig = await prisma.systemConfig.findUnique({ where: { key: 'bonus_rate' } });

    res.json({
      users: { total: totalUsers, frozen: frozenUsers },
      financials: {
        totalDeposited:   Number(depositStats._sum.amount    ?? 0),
        totalWithdrawn:   Number(withdrawalStats._sum.amount ?? 0),
        totalBookings:    Number(bookingStats._sum.amount    ?? 0),
        totalBonusPaid:   Number(bonusStats._sum.amount      ?? 0),
        systemBalance:    Number(walletTotals._sum.balance   ?? 0),
        lockedBalance:    Number(walletTotals._sum.lockedBalance ?? 0),
        depositCount:     depositStats._count,
        withdrawalCount:  withdrawalStats._count,
        bookingCount:     bookingStats._count,
      },
      bonusRate: bonusRateConfig ? parseFloat(bonusRateConfig.value) : 0.001,
      recentTransactions: recentTxns,
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res, next) => {
  try {
    const page  = parseInt(req.query.page)  || 1;
    const limit = parseInt(req.query.limit) || 20;

    const [total, users] = await prisma.$transaction([
      prisma.user.count({ where: { role: 'USER' } }),
      prisma.user.findMany({
        where:   { role: 'USER' },
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * limit,
        take:    limit,
        select: {
          id: true, email: true, name: true, isFrozen: true, createdAt: true,
          wallet: { select: { balance: true, lockedBalance: true, bonusEarned: true } },
        },
      }),
    ]);

    res.json({ users, total, page, pages: Math.ceil(total / limit) });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/admin/freeze ────────────────────────────────────────────────────
router.post('/freeze', async (req, res, next) => {
  try {
    const { userId, freeze } = z.object({
      userId: z.string(),
      freeze: z.boolean(),
    }).parse(req.body);

    const user = await prisma.user.update({
      where:  { id: userId },
      data:   { isFrozen: freeze },
      select: { id: true, email: true, name: true, isFrozen: true },
    });

    res.json({ message: `Account ${freeze ? 'frozen' : 'unfrozen'} successfully`, user });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
});

// ── PUT /api/admin/bonus-rate ─────────────────────────────────────────────────
router.put('/bonus-rate', async (req, res, next) => {
  try {
    const { rate } = z.object({
      rate: z.number().min(0).max(0.01), // max 1% daily
    }).parse(req.body);

    const config = await prisma.systemConfig.upsert({
      where:  { key: 'bonus_rate' },
      update: { value: String(rate) },
      create: { key: 'bonus_rate', value: String(rate) },
    });

    res.json({ message: 'Bonus rate updated', bonusRate: parseFloat(config.value) });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
});

// ── POST /api/admin/bonus/run ─────────────────────────────────────────────────
// Manually trigger bonus distribution
router.post('/bonus/run', async (req, res, next) => {
  try {
    const { distributeBonuses } = require('../jobs/bonusJob');
    const result = await distributeBonuses();
    res.json({ message: 'Bonus distribution completed', ...result });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/admin/withdrawals/queued ─────────────────────────────────────────
router.get('/withdrawals/queued', async (req, res, next) => {
  try {
    const queued = await prisma.transaction.findMany({
      where:   { type: 'WITHDRAWAL', status: 'QUEUED' },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { name: true, email: true } } },
    });
    res.json({ queued, count: queued.length });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
