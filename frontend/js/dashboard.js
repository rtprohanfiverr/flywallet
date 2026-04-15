// ── FlyWallet Dashboard ─────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  const user = getUser();
  if (!user) return;

  // Set user name
  const nameEl = document.getElementById('user-name');
  if (nameEl) nameEl.textContent = user.name.split(' ')[0];

  await Promise.all([loadWallet(), loadBookings()]);
});

async function loadWallet() {
  try {
    const data = await api.get('/wallet');
    renderWallet(data.wallet);
    renderTransactions(data.transactions);
    renderStats(data.transactions);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

function renderWallet(wallet) {
  // Main balance card
  setText('balance-amount',    fmt$$(wallet.balance));
  setText('available-balance', fmt$$(wallet.available));
  setText('locked-balance',    fmt$$(wallet.lockedBalance));
  setText('bonus-earned',      '+' + fmt$$(wallet.bonusEarned));

  // Sidebar mini wallet
  setText('sidebar-balance', fmt$$(wallet.available));
  setText('sidebar-bonus',   '+' + fmt$$(wallet.bonusEarned) + ' bonus');
}

function renderStats(transactions) {
  let deposited = 0, withdrawn = 0, bookingCount = 0, bonus = 0;

  for (const t of transactions) {
    if (t.type === 'DEPOSIT'    && t.status === 'COMPLETED') deposited   += Number(t.amount);
    if (t.type === 'WITHDRAWAL' && t.status === 'COMPLETED') withdrawn   += Number(t.amount);
    if (t.type === 'BOOKING'    && t.status === 'COMPLETED') bookingCount++;
    if (t.type === 'BONUS'      && t.status === 'COMPLETED') bonus       += Number(t.amount);
  }

  setText('stat-deposited', fmt$$(deposited));
  setText('stat-withdrawn',  fmt$$(withdrawn));
  setText('stat-bookings',   bookingCount);
  setText('stat-bonus',      fmt$$(bonus));
}

function renderTransactions(transactions) {
  const loadingEl = document.getElementById('txn-loading');
  const listEl    = document.getElementById('txn-list');
  const emptyEl   = document.getElementById('txn-empty');

  if (loadingEl) loadingEl.classList.add('hidden');

  if (!transactions || transactions.length === 0) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    return;
  }

  if (listEl) {
    listEl.classList.remove('hidden');
    listEl.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Type</th>
              <th>Description</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            ${transactions.map(t => `
              <tr>
                <td>${txnTypeBadge(t.type)}</td>
                <td style="color:var(--text-muted);font-size:0.85rem;">${t.description || '—'}</td>
                <td>${txnAmountColor(t.type, t.amount)}</td>
                <td>${statusBadge(t.status)}</td>
                <td style="color:var(--text-dim);font-size:0.82rem;">${fmtDateTime(t.createdAt)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  }
}

async function loadAllTransactions() {
  try {
    const data = await api.get('/wallet/transactions', { limit: 50 });
    renderTransactions(data.transactions);
  } catch (err) {
    showToast(err.message, 'error');
  }
}

async function loadBookings() {
  const container = document.getElementById('bookings-list');
  if (!container) return;

  try {
    const data = await api.get('/flights/bookings');
    const bookings = data.bookings;

    if (!bookings || bookings.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">✈️</div>
          <h4>No bookings yet</h4>
          <p><a href="flights.html" style="color:var(--primary-light);">Book your first flight →</a></p>
        </div>`;
      return;
    }

    container.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Route</th>
              <th>Date</th>
              <th>Passengers</th>
              <th>Amount</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${bookings.map(b => `
              <tr>
                <td>
                  <span style="font-weight:700;">${b.origin}</span>
                  <span style="color:var(--text-dim);margin:0 6px;">→</span>
                  <span style="font-weight:700;">${b.destination}</span>
                </td>
                <td style="color:var(--text-muted);font-size:0.85rem;">${fmtDate(b.departDate)}</td>
                <td style="color:var(--text-muted);">${b.passengers}</td>
                <td style="font-weight:700;color:var(--danger);">-${fmt$$(b.amount)}</td>
                <td>${statusBadge(b.status)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>`;
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error">Failed to load bookings: ${err.message}</div>`;
  }
}

// Helper
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}
