require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const authRoutes = require('./routes/auth');
const walletRoutes = require('./routes/wallet');
const flightRoutes = require('./routes/flights');
const adminRoutes = require('./routes/admin');
const { startBonusCron } = require('./jobs/bonusJob');

const app = express();
const PORT = process.env.PORT || 5000;

// ── Security middleware ──────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
const allowedOrigins = [
  process.env.FRONTEND_URL,
  'http://127.0.0.1:5500',
  'http://localhost:5500',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman)
    if (!origin) return cb(null, true);
    if (allowedOrigins.some(o => origin.startsWith(o))) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ────────────────────────────────────────────────────────────
const limiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 });
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/', limiter);
app.use('/api/auth/', authLimiter);

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/flights', flightRoutes);
app.use('/api/admin', adminRoutes);

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Internal server error' });
});

// ── Auto setup database on startup ───────────────────────────────────────────
async function setupDatabase() {
  const { execSync } = require('child_process');
  try {
    console.log('[DB] Running prisma db push...');
    execSync('npx prisma db push --accept-data-loss', { stdio: 'inherit' });
    console.log('[DB] Schema pushed successfully');

    // Seed only if no users exist
    const prisma = require('./lib/prisma');
    const userCount = await prisma.user.count();
    if (userCount === 0) {
      console.log('[DB] Seeding database...');
      execSync('node prisma/seed.js', { stdio: 'inherit' });
      console.log('[DB] Seed complete');
    } else {
      console.log('[DB] Database already has data — skipping seed');
    }
  } catch (err) {
    console.error('[DB] Setup error:', err.message);
  }
}

// ── Start server ─────────────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`✈  FlyWallet API running on http://localhost:${PORT}`);
  await setupDatabase();
  startBonusCron();
});
