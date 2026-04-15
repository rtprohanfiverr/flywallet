// ── FlyWallet Admin Dashboard JS ────────────────────────────────────────────

let currentSection = 'overview';
let freezeTargetId = null;
let freezeAction   = false;
let usersPage      = 1;

document.addEventListener('DOMContentLoaded', async () => {
  // Update system clock
  updateClock();
  setInterval(updateClock, 1000);

  await loadStats();
});

function updateClock() {
  const el = document.getElementById('system-time');
  if (el) el.textContent = new Date().toLocaleString('en-US', { hour12: false });
}

function showSection(section) {
  // Hide all sections
  ['overview', 'users', 'withdrawals', 'bonus', 'transactions'].forEach(s => {
    const el = document.getElementById(`section-${s}`);
    if (el) el.classList.add('hidden');
  });

  // Remove active from all sidebar links
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  // Show target section
  const target = document.getElementById(`section-${section}`);
  if (target) target.classList.remove('hidden');

  // Mark active
  const link = document.querySelector(`.sidebar-link[onclick*="${section}"]`);
  if (link) link.classList.add('active');

  currentSection = section;

  // Load data for the section
  if (section === 'users')        loadUsers();
  if (section === 'withdrawals')  loadQueuedWithdrawals();
  if (section === 'bonus')        loadBonusConfig();
  if (section === 'transactions') loadAllTransactions();
}

// ── OVERVIEW ────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const data = await api.get('/admin/stats');
    const { users, financials, bonusRate, recentTransactions } = data;

    setText('stat-users',          users.total);
    setText('stat-frozen',         `${users.frozen} frozen`);
    setText('stat-deposited',      fmt$$(financials.totalDeposited));
    setText('stat-deposit-count',  `${financials.depositCount} deposits`);
    setText('stat-withdrawn',      fmt$$(financials.totalWithdrawn));
    setText('stat-withdraw-count', `${financials.withdrawalCount} withdrawals`);
    setText('stat-bookings',       fmt$$(financials.totalBookings));
    setText('stat-booking-count',  `${financials.bookingCount} bookings`);
    setText('stat-bonus-paid',     fmt$$(financials.totalBonusPaid));
    setText('stat-system-balance', fmt$$(financials.systemBalance));
    setText('stat-locked',         fmt$$(financials.lockedBalance));
    setText('total-bonus-display', fmt$$(financials.totalBonusPaid));

    // Store bonus rate for bonus section
    window._currentBonusRate = bonusRate;

    renderRecentTxns(recentTransactions);
  } catch (err) {
    showToast('Failed to load stats: ' + err.message, 'error');
  }
}

function renderRecentTxns(txns) {
  const tbody = document.getElementById('recent-txns');
  if (!tbody) return;

  if (!txns || txns.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:var(--text-dim);">No transactions yet</td></tr>`;
    return;
  }

  tbody.innerHTML = txns.map(t => `
    <tr>
      <td>
        <div style="font-weight:600;font-size:0.88rem;">${t.user?.name || '—'}</div>
        <div style="color:var(--text-dim);font-size:0.75rem;">${t.user?.email || ''}</div>
      </td>
      <td>${txnTypeBadge(t.type)}</td>
      <td>${txnAmountColor(t.type, t.amount)}</td>
      <td>${statusBadge(t.status)}</td>
      <td style="color:var(--text-dim);font-size:0.8rem;">${fmtDateTime(t.createdAt)}</td>
    </tr>
  `).join('');
}

// ── USERS ────────────────────────────────────────────────────────────────────
async function loadUsers(page = 1) {
  usersPage = page;
  const tbody = document.getElementById('users-table');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:30px;"><span class="spinner" style="width:20px;height:20px;border-width:2px;"></span></td></tr>`;

  try {
    const data = await api.get('/admin/users', { page, limit: 15 });

    if (!data.users || data.users.length === 0) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:24px;color:var(--text-dim);">No users found</td></tr>`;
      return;
    }

    tbody.innerHTML = data.users.map(u => `
      <tr>
        <td style="font-weight:600;">${u.name}</td>
        <td style="color:var(--text-muted);font-size:0.85rem;">${u.email}</td>
        <td style="font-weight:700;">${fmt$$(u.wallet?.balance || 0)}</td>
        <td style="color:var(--warning);">+${fmt$$(u.wallet?.bonusEarned || 0)}</td>
        <td>${u.isFrozen
          ? '<span class="badge badge-danger">❄ Frozen</span>'
          : '<span class="badge badge-success">● Active</span>'}</td>
        <td style="color:var(--text-dim);font-size:0.8rem;">${fmtDate(u.createdAt)}</td>
        <td>
          <button
            class="btn btn-sm ${u.isFrozen ? 'btn-success' : 'btn-danger'}"
            onclick="showFreezeModal('${u.id}', '${u.name}', ${!u.isFrozen})"
          >
            ${u.isFrozen ? '✓ Unfreeze' : '❄ Freeze'}
          </button>
        </td>
      </tr>
    `).join('');

    // Pagination
    const pagDiv = document.getElementById('users-pagination');
    if (pagDiv && data.pages > 1) {
      pagDiv.innerHTML = Array.from({ length: data.pages }, (_, i) => i + 1).map(p => `
        <button class="btn btn-sm ${p === page ? 'btn-primary' : 'btn-ghost'}" onclick="loadUsers(${p})">${p}</button>
      `).join('');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7"><div class="alert alert-error">${err.message}</div></td></tr>`;
  }
}

function showFreezeModal(userId, name, freeze) {
  freezeTargetId = userId;
  freezeAction   = freeze;

  setText('freeze-modal-title', freeze ? '❄ Freeze Account' : '✓ Unfreeze Account');
  setText('freeze-modal-body',
    freeze
      ? `Are you sure you want to freeze ${name}'s account? They will not be able to deposit, withdraw, or book flights.`
      : `Are you sure you want to unfreeze ${name}'s account? They will regain full access.`
  );

  const confirmBtn = document.getElementById('freeze-confirm-btn');
  confirmBtn.className = `btn w-full ${freeze ? 'btn-danger' : 'btn-success'}`;
  confirmBtn.textContent = freeze ? '❄ Freeze Account' : '✓ Unfreeze Account';

  document.getElementById('freeze-modal').classList.remove('hidden');
}

async function executeFreezeAction() {
  if (!freezeTargetId) return;

  try {
    const data = await api.post('/admin/freeze', { userId: freezeTargetId, freeze: freezeAction });
    showToast(`Account ${freezeAction ? 'frozen' : 'unfrozen'}: ${data.user.name}`, 'success');
    document.getElementById('freeze-modal').classList.add('hidden');
    await loadUsers(usersPage);
    await loadStats();
  } catch (err) {
    showToast(err.message, 'error');
  }
}

// ── WITHDRAWALS ──────────────────────────────────────────────────────────────
async function loadQueuedWithdrawals() {
  const tbody = document.getElementById('queued-withdrawals');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:30px;"><span class="spinner" style="width:20px;height:20px;border-width:2px;"></span></td></tr>`;

  try {
    const data = await api.get('/admin/withdrawals/queued');

    if (!data.queued || data.queued.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;padding:24px;color:var(--success);">✓ No queued withdrawals — all clear!</td></tr>`;
      return;
    }

    tbody.innerHTML = data.queued.map(w => `
      <tr>
        <td>
          <div style="font-weight:600;">${w.user?.name || '—'}</div>
          <div style="color:var(--text-dim);font-size:0.75rem;">${w.user?.email || ''}</div>
        </td>
        <td style="font-weight:700;color:var(--danger);">-${fmt$$(w.amount)}</td>
        <td>${statusBadge(w.status)}</td>
        <td style="color:var(--text-dim);font-size:0.8rem;">${fmtDateTime(w.createdAt)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4"><div class="alert alert-error">${err.message}</div></td></tr>`;
  }
}

// ── BONUS ENGINE ─────────────────────────────────────────────────────────────
async function loadBonusConfig() {
  const rate = window._currentBonusRate ?? 0.001;
  const pct  = (rate * 100).toFixed(3);
  setText('current-rate-display', pct + '%');

  const input = document.getElementById('new-rate');
  if (input) input.value = pct;

  const form = document.getElementById('rate-form');
  if (form && !form.dataset.bound) {
    form.dataset.bound = '1';
    form.addEventListener('submit', handleRateUpdate);
  }
}

async function handleRateUpdate(e) {
  e.preventDefault();
  const alert = document.getElementById('rate-alert');
  const rateInput = parseFloat(document.getElementById('new-rate').value);

  if (isNaN(rateInput) || rateInput < 0 || rateInput > 1) {
    alert.innerHTML = `<div class="alert alert-error">⚠️ Rate must be between 0% and 1%.</div>`;
    return;
  }

  const rateDecimal = rateInput / 100;

  try {
    const data = await api.put('/admin/bonus-rate', { rate: rateDecimal });
    window._currentBonusRate = data.bonusRate;
    setText('current-rate-display', (data.bonusRate * 100).toFixed(3) + '%');
    alert.innerHTML = `<div class="alert alert-success">✓ Bonus rate updated to ${(data.bonusRate * 100).toFixed(3)}%</div>`;
    showToast('Bonus rate updated successfully', 'success');
  } catch (err) {
    alert.innerHTML = `<div class="alert alert-error">⚠️ ${err.message}</div>`;
  }
}

async function runBonus() {
  const btn     = document.getElementById('run-bonus-btn');
  const btnText = document.getElementById('run-btn-text');
  const spinner = document.getElementById('run-spinner');
  const result  = document.getElementById('run-result');

  btn.disabled = true;
  btnText.textContent = 'Running…';
  spinner.classList.remove('hidden');
  result.innerHTML = '';

  try {
    const data = await api.post('/admin/bonus/run');
    result.innerHTML = `
      <div class="alert alert-success">
        ✓ Bonus distributed!<br>
        <strong>${data.usersProcessed}</strong> users · <strong>${fmt$$(data.totalBonusPaid)}</strong> total · Rate: ${(data.bonusRate * 100).toFixed(3)}%
      </div>`;
    showToast(`Bonus distributed to ${data.usersProcessed} users`, 'success');
    await loadStats();
  } catch (err) {
    result.innerHTML = `<div class="alert alert-error">⚠️ ${err.message}</div>`;
  } finally {
    btn.disabled = false;
    btnText.textContent = '▶ Run Bonus Now';
    spinner.classList.add('hidden');
  }
}

// ── ALL TRANSACTIONS ─────────────────────────────────────────────────────────
async function loadAllTransactions() {
  const tbody = document.getElementById('all-txns-table');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:30px;"><span class="spinner" style="width:20px;height:20px;border-width:2px;"></span></td></tr>`;

  try {
    const data = await api.get('/admin/stats');
    const txns = data.recentTransactions || [];

    if (txns.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--text-dim);">No transactions</td></tr>`;
      return;
    }

    tbody.innerHTML = txns.map(t => `
      <tr>
        <td>
          <div style="font-weight:600;font-size:0.88rem;">${t.user?.name || '—'}</div>
          <div style="color:var(--text-dim);font-size:0.75rem;">${t.user?.email || ''}</div>
        </td>
        <td>${txnTypeBadge(t.type)}</td>
        <td>${txnAmountColor(t.type, t.amount)}</td>
        <td>${statusBadge(t.status)}</td>
        <td style="color:var(--text-muted);font-size:0.82rem;max-width:180px;" class="truncate">${t.description || '—'}</td>
        <td style="color:var(--text-dim);font-size:0.8rem;">${fmtDateTime(t.createdAt)}</td>
      </tr>
    `).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6"><div class="alert alert-error">${err.message}</div></td></tr>`;
  }
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
