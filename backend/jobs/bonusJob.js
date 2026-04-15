const cron = require('node-cron');
const prisma = require('../lib/prisma');

/**
 * Distribute daily travel savings bonuses to all active wallets.
 * Bonus rate is configurable from SystemConfig (default 0.1% daily max).
 * No guaranteed returns — bonus can vary or be zero.
 */
async function distributeBonuses() {
  console.log('[BONUS] Starting daily bonus distribution...');

  try {
    // Fetch current bonus rate from config
    const config = await prisma.systemConfig.findUnique({ where: { key: 'bonus_rate' } });
    const bonusRate = config ? parseFloat(config.value) : 0.001; // 0.1%

    if (bonusRate <= 0) {
      console.log('[BONUS] Bonus rate is 0 — skipping distribution');
      return { skipped: true, reason: 'rate_zero', usersProcessed: 0, totalBonusPaid: 0 };
    }

    // Fetch all active users with wallets (balance > 0, not frozen)
    const wallets = await prisma.wallet.findMany({
      where: {
        balance: { gt: 0 },
        user:    { isFrozen: false },
      },
      include: { user: { select: { id: true, email: true, isFrozen: true } } },
    });

    let usersProcessed = 0;
    let totalBonusPaid = 0;

    for (const wallet of wallets) {
      const balance = Number(wallet.balance);
      // Small random variance: 50–100% of rate to simulate real-world variability
      const varianceFactor = 0.5 + Math.random() * 0.5;
      const bonusAmount = parseFloat((balance * bonusRate * varianceFactor).toFixed(4));

      if (bonusAmount < 0.01) continue; // Skip negligible amounts

      await prisma.$transaction([
        prisma.wallet.update({
          where: { id: wallet.id },
          data:  {
            balance:     { increment: bonusAmount },
            bonusEarned: { increment: bonusAmount },
          },
        }),
        prisma.transaction.create({
          data: {
            userId:      wallet.userId,
            type:        'BONUS',
            amount:      bonusAmount,
            status:      'COMPLETED',
            description: 'Daily travel savings bonus',
            metadata:    { rate: bonusRate, varianceFactor: parseFloat(varianceFactor.toFixed(4)) },
          },
        }),
      ]);

      usersProcessed++;
      totalBonusPaid += bonusAmount;
    }

    const summary = {
      usersProcessed,
      totalBonusPaid: parseFloat(totalBonusPaid.toFixed(4)),
      bonusRate,
      runAt: new Date().toISOString(),
    };

    console.log(`[BONUS] Done — ${usersProcessed} users, $${summary.totalBonusPaid} total bonus`);
    return summary;
  } catch (err) {
    console.error('[BONUS] Distribution failed:', err.message);
    throw err;
  }
}

/**
 * Start the daily cron job (runs at 00:05 every day)
 */
function startBonusCron() {
  // Run at 00:05 daily
  cron.schedule('5 0 * * *', async () => {
    try {
      await distributeBonuses();
    } catch (err) {
      console.error('[BONUS CRON] Error:', err.message);
    }
  });

  console.log('[BONUS CRON] Scheduled — runs daily at 00:05');
}

module.exports = { startBonusCron, distributeBonuses };
