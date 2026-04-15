// ── FlyWallet Wallet JS (Add Funds + Withdraw pages) ───────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  await loadWalletBalance();

  // Wire up deposit form
  const depositForm = document.getElementById('deposit-form');
  if (depositForm) {
    depositForm.addEventListener('submit', handleDeposit);
    await loadDepositHistory();
  }

  // Wire up withdraw form
  const withdrawForm = document.getElementById('withdraw-form');
  if (withdrawForm) {
    withdrawForm.addEventListener('submit', handleWithdraw);
    await loadWithdrawHistory();
  }
});

async function loadWalletBalance() {
  try {
    const data = await api.get('/wallet');
    const w = data.wallet;

    setText('balance-amount',    fmt$$(w.balance));
    setText('available-balance', fmt$$(w.available));
    setText('locked-balance',    fmt$$(w.lockedBalance));
    setText('bonus-earned',      '+' + fmt$$(w.bonusEarned));
    setText('sidebar-balance',   fmt$$(w.available));

    // Expose available balance for max button
    window._walletAvailable = w.available;
    if (typeof availableBalance !== 'undefined') {
      // eslint-disable-next-line no-global-assign
      availableBalance = w.available;
    }
    // For withdraw page max button
    window.availableBalance = w.available;
  } catch (err) {
    console.error('Failed to load wallet:', err.message);
  }
}

async function handleDeposit(e) {
  e.preventDefault();
  const btn     = document.getElementById('submit-btn');
  const btnText = document.getElementById('btn-text');
  const spinner = document.getElementById('btn-spinner');
  const alert   = document.getElementById('alert-box');

  const amount = parseFloat(document.getElementById('amount').value);

  if (!amount || amount < 10) {
    alert.innerHTML = `<div class="alert alert-error">⚠️ Minimum deposit is $10.</div>`;
    return;
  }
  if (amount > 50000) {
    alert.innerHTML = `<div class="alert alert-error">⚠️ Maximum deposit is $50,000.</div>`;
    return;
  }

  alert.innerHTML  = '';
  btn.disabled     = true;
  btnText.textContent = 'Processing…';
  spinner.classList.remove('hidden');

  try {
    const data = await api.post('/wallet/deposit', { amount });

    showToast(`✓ $${amount.toFixed(2)} deposited successfully!`, 'success');

    // Update balance display
    await loadWalletBalance();
    await loadDepositHistory();

    // Show success alert
    alert.innerHTML = `
      <div class="alert alert-success">
        ✓ Deposit of ${fmt$$(amount)} successful! New balance: ${fmt$$(data.balance)}
      </div>`;

    document.getElementById('amount').value = '';
  } catch (err) {
    alert.innerHTML = `<div class="alert alert-error">⚠️ ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btnText.textContent = '💳 Deposit Funds';
    spinner.classList.add('hidden');
  }
}

async function handleWithdraw(e) {
  e.preventDefault();
  const btn     = document.getElementById('submit-btn');
  const btnText = document.getElementById('btn-text');
  const spinner = document.getElementById('btn-spinner');
  const alert   = document.getElementById('alert-box');

  const amount = parseFloat(document.getElementById('amount').value);

  if (!amount || amount < 10) {
    alert.innerHTML = `<div class="alert alert-error">⚠️ Minimum withdrawal is $10.</div>`;
    return;
  }

  const available = window.availableBalance || 0;
  if (amount > available) {
    alert.innerHTML = `<div class="alert alert-error">⚠️ Insufficient balance. Available: ${fmt$$(available)}</div>`;
    return;
  }

  alert.innerHTML  = '';
  btn.disabled     = true;
  btnText.textContent = 'Processing…';
  spinner.classList.remove('hidden');

  try {
    const data = await api.post('/wallet/withdraw', { amount });

    const msg = data.status === 'QUEUED'
      ? `Withdrawal of ${fmt$$(amount)} queued — processing within 24h`
      : `Withdrawal of ${fmt$$(amount)} initiated successfully`;

    showToast(msg, 'success');
    alert.innerHTML = `<div class="alert alert-success">✓ ${msg}</div>`;

    await loadWalletBalance();
    await loadWithdrawHistory();
    document.getElementById('amount').value = '';

    // Hide preview
    const preview = document.getElementById('withdraw-preview');
    if (preview) preview.classList.add('hidden');
  } catch (err) {
    alert.innerHTML = `<div class="alert alert-error">⚠️ ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btnText.textContent = '💸 Request Withdrawal';
    spinner.classList.add('hidden');
  }
}

async function loadDepositHistory() {
  const container = document.getElementById('deposit-history');
  if (!container) return;

  try {
    const data = await api.get('/wallet/transactions', { limit: 5 });
    const deposits = data.transactions.filter(t => t.type === 'DEPOSIT');

    if (deposits.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:30px;"><div class="empty-icon" style="font-size:2rem;">💳</div><p>No deposits yet</p></div>`;
      return;
    }

    container.innerHTML = renderTxnTable(deposits);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

async function loadWithdrawHistory() {
  const container = document.getElementById('withdrawal-history');
  if (!container) return;

  try {
    const data = await api.get('/wallet/transactions', { limit: 10 });
    const withdrawals = data.transactions.filter(t => t.type === 'WITHDRAWAL');

    if (withdrawals.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:30px;"><div class="empty-icon" style="font-size:2rem;">💸</div><p>No withdrawals yet</p></div>`;
      return;
    }

    container.innerHTML = renderTxnTable(withdrawals);
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">${err.message}</div>`;
  }
}

function renderTxnTable(transactions) {
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Amount</th><th>Status</th><th>Description</th><th>Date</th></tr>
        </thead>
        <tbody>
          ${transactions.map(t => `
            <tr>
              <td>${txnAmountColor(t.type, t.amount)}</td>
              <td>${statusBadge(t.status)}</td>
              <td style="color:var(--text-muted);font-size:0.85rem;">${t.description || '—'}</td>
              <td style="color:var(--text-dim);font-size:0.82rem;">${fmtDateTime(t.createdAt)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>`;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
