const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding FlyWallet database...');

  // ── Admin user ────────────────────────────────────────────────────────────
  const adminPassword = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@flywallet.com' },
    update: {},
    create: {
      email: 'admin@flywallet.com',
      password: adminPassword,
      name: 'FlyWallet Admin',
      role: 'ADMIN',
      wallet: {
        create: { balance: 0 },
      },
    },
  });

  // ── Demo user 1 ───────────────────────────────────────────────────────────
  const user1Password = await bcrypt.hash('Demo@123', 12);
  const user1 = await prisma.user.upsert({
    where: { email: 'alice@example.com' },
    update: {},
    create: {
      email: 'alice@example.com',
      password: user1Password,
      name: 'Alice Johnson',
      role: 'USER',
      wallet: {
        create: { balance: 1500.00, bonusEarned: 12.50 },
      },
    },
  });

  // ── Demo user 2 ───────────────────────────────────────────────────────────
  const user2Password = await bcrypt.hash('Demo@123', 12);
  const user2 = await prisma.user.upsert({
    where: { email: 'bob@example.com' },
    update: {},
    create: {
      email: 'bob@example.com',
      password: user2Password,
      name: 'Bob Smith',
      role: 'USER',
      wallet: {
        create: { balance: 800.00, bonusEarned: 4.20 },
      },
    },
  });

  // ── Seed transactions for Alice ───────────────────────────────────────────
  await prisma.transaction.createMany({
    data: [
      { userId: user1.id, type: 'DEPOSIT',    amount: 1000.00, status: 'COMPLETED', description: 'Initial deposit via Stripe' },
      { userId: user1.id, type: 'DEPOSIT',    amount: 600.00,  status: 'COMPLETED', description: 'Top-up via Stripe' },
      { userId: user1.id, type: 'BONUS',      amount: 12.50,   status: 'COMPLETED', description: 'Daily travel savings bonus' },
      { userId: user1.id, type: 'BOOKING',    amount: 112.50,  status: 'COMPLETED', description: 'Flight DXB → LHR' },
    ],
    skipDuplicates: true,
  });

  // ── Seed transactions for Bob ─────────────────────────────────────────────
  await prisma.transaction.createMany({
    data: [
      { userId: user2.id, type: 'DEPOSIT',    amount: 800.00, status: 'COMPLETED', description: 'Initial deposit via Stripe' },
      { userId: user2.id, type: 'BONUS',      amount: 4.20,   status: 'COMPLETED', description: 'Daily travel savings bonus' },
    ],
    skipDuplicates: true,
  });

  // ── System config ─────────────────────────────────────────────────────────
  await prisma.systemConfig.upsert({
    where: { key: 'bonus_rate' },
    update: {},
    create: { key: 'bonus_rate', value: '0.001' }, // 0.1% daily max
  });

  await prisma.systemConfig.upsert({
    where: { key: 'withdrawal_threshold' },
    update: {},
    create: { key: 'withdrawal_threshold', value: '50000' }, // queue if total > $50k/day
  });

  await prisma.systemConfig.upsert({
    where: { key: 'min_withdrawal' },
    update: {},
    create: { key: 'min_withdrawal', value: '10' },
  });

  console.log('✅ Seed complete!');
  console.log('');
  console.log('Demo credentials:');
  console.log('  Admin  → admin@flywallet.com  / Admin@123');
  console.log('  User 1 → alice@example.com    / Demo@123');
  console.log('  User 2 → bob@example.com      / Demo@123');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
