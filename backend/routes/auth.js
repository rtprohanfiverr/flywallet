const express = require('express');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { signToken } = require('../lib/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── Validation schemas ────────────────────────────────────────────────────────
const signupSchema = z.object({
  name:     z.string().min(2).max(80),
  email:    z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/, 'Must contain uppercase')
                             .regex(/[0-9]/, 'Must contain a number'),
});

const loginSchema = z.object({
  email:    z.string().email(),
  password: z.string().min(1),
});

// ── POST /api/auth/signup ─────────────────────────────────────────────────────
router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password } = signupSchema.parse(req.body);

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) return res.status(409).json({ error: 'Email already registered' });

    const hashed = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashed,
        wallet: { create: { balance: 0 } },
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    res.status(201).json({ token, user });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.errors[0].message });
    }
    next(err);
  }
});

// ── Demo accounts bypass (works even if DB not seeded) ───────────────────────
const DEMO_ACCOUNTS = {
  'alice@example.com':       { password: 'Demo@123',  id: 'demo-alice', name: 'Alice Johnson', role: 'USER'  },
  'bob@example.com':         { password: 'Demo@123',  id: 'demo-bob',   name: 'Bob Smith',     role: 'USER'  },
  'admin@flywallet.com':     { password: 'Admin@123', id: 'demo-admin', name: 'FlyWallet Admin', role: 'ADMIN' },
};

// ── POST /api/auth/login ──────────────────────────────────────────────────────
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // Check demo bypass first
    const demo = DEMO_ACCOUNTS[email.toLowerCase()];
    if (demo && password === demo.password) {
      const token = signToken({ id: demo.id, email, role: demo.role });
      return res.json({
        token,
        user: { id: demo.id, email, name: demo.name, role: demo.role },
      });
    }

    // Normal DB login
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    if (user.isFrozen) return res.status(403).json({ error: 'Account is frozen. Contact support.' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = signToken({ id: user.id, email: user.email, role: user.role });

    res.json({
      token,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
  } catch (err) {
    if (err.name === 'ZodError') {
      return res.status(400).json({ error: err.errors[0].message });
    }
    next(err);
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, name: true, role: true, createdAt: true, isFrozen: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
