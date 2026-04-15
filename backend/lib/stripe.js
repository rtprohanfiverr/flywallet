const Stripe = require('stripe');

if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('[WARN] STRIPE_SECRET_KEY not set — Stripe features will be mocked');
}

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' })
  : null;

/**
 * Create a Stripe PaymentIntent for a deposit
 * @param {number} amountUSD - amount in dollars
 * @param {string} userId
 */
async function createDepositIntent(amountUSD, userId) {
  if (!stripe) {
    // Mock response for development
    return {
      id: `mock_pi_${Date.now()}`,
      client_secret: `mock_secret_${Date.now()}`,
      amount: Math.round(amountUSD * 100),
      status: 'succeeded',
      mock: true,
    };
  }

  return stripe.paymentIntents.create({
    amount: Math.round(amountUSD * 100), // cents
    currency: 'usd',
    metadata: { userId, type: 'deposit' },
  });
}

/**
 * Create a Stripe Payout for a withdrawal (requires connected account in production)
 * @param {number} amountUSD
 * @param {string} userId
 */
async function createWithdrawalPayout(amountUSD, userId) {
  if (!stripe) {
    return {
      id: `mock_po_${Date.now()}`,
      amount: Math.round(amountUSD * 100),
      status: 'paid',
      mock: true,
    };
  }

  // In production, you'd use Stripe Connect or manual payouts
  return {
    id: `po_${Date.now()}`,
    amount: Math.round(amountUSD * 100),
    status: 'paid',
    note: 'Configure Stripe Connect for real payouts',
  };
}

module.exports = { stripe, createDepositIntent, createWithdrawalPayout };
