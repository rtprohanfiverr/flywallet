const { Queue, Worker } = require('bullmq');
const prisma = require('./prisma');
const { createWithdrawalPayout } = require('./stripe');

let withdrawalQueue = null;
let withdrawalWorker = null;

function getRedisConnection() {
  if (!process.env.REDIS_URL) {
    console.warn('[QUEUE] REDIS_URL not set — withdrawal queue disabled');
    return null;
  }
  return {
    host: new URL(process.env.REDIS_URL).hostname,
    port: parseInt(new URL(process.env.REDIS_URL).port) || 6379,
    password: new URL(process.env.REDIS_URL).password || undefined,
  };
}

function initQueue() {
  const connection = getRedisConnection();
  if (!connection) return;

  withdrawalQueue = new Queue('withdrawals', { connection });

  withdrawalWorker = new Worker('withdrawals', async (job) => {
    const { transactionId, userId, amount } = job.data;
    console.log(`[QUEUE] Processing withdrawal ${transactionId} for $${amount}`);

    try {
      // Create payout via Stripe
      await createWithdrawalPayout(amount, userId);

      // Update transaction + wallet atomically
      await prisma.$transaction(async (tx) => {
        await tx.transaction.update({
          where: { id: transactionId },
          data: { status: 'COMPLETED' },
        });

        await tx.wallet.update({
          where: { userId },
          data: {
            lockedBalance: { decrement: amount },
          },
        });
      });

      console.log(`[QUEUE] Withdrawal ${transactionId} completed`);
    } catch (err) {
      console.error(`[QUEUE] Withdrawal ${transactionId} failed:`, err.message);
      await prisma.transaction.update({
        where: { id: transactionId },
        data: { status: 'FAILED' },
      });
      throw err;
    }
  }, { connection });

  withdrawalWorker.on('failed', (job, err) => {
    console.error(`[QUEUE] Job ${job.id} failed:`, err.message);
  });

  console.log('[QUEUE] Withdrawal queue initialized');
}

/**
 * Add a withdrawal job to the queue
 * @param {{ transactionId: string, userId: string, amount: number }} data
 */
async function enqueueWithdrawal(data) {
  if (!withdrawalQueue) {
    throw new Error('Withdrawal queue not available (Redis not configured)');
  }
  return withdrawalQueue.add('process-withdrawal', data, {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5000 },
  });
}

module.exports = { initQueue, enqueueWithdrawal, getWithdrawalQueue: () => withdrawalQueue };
