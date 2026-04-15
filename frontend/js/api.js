// ── FlyWallet API Client ────────────────────────────────────────────────────
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  ? 'http://localhost:5000/api'
  : 'https://flywallet-api.onrender.com/api'; // ← replace with YOUR actual Render backend URL

const api = {
  _getToken() {
    return localStorage.getItem('fw_token');
  },

  _headers(extra = {}) {
    const h = { 'Content-Type': 'application/json', ...extra };
    const token = this._getToken();
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
  },

  async _handle(res) {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Request failed (${res.status})`);
    }
    return data;
  },

  async get(path, params = {}) {
    const url = new URL(API_BASE + path);
    Object.entries(params).forEach(([k, v]) => v !== undefined && v !== '' && url.searchParams.set(k, v));
    const res = await fetch(url.toString(), { headers: this._headers() });
    return this._handle(res);
  },

  async post(path, body = {}) {
    const res = await fetch(API_BASE + path, {
      method:  'POST',
      headers: this._headers(),
      body:    JSON.stringify(body),
    });
    return this._handle(res);
  },

  async put(path, body = {}) {
    const res = await fetch(API_BASE + path, {
      method:  'PUT',
      headers: this._headers(),
      body:    JSON.stringify(body),
    });
    return this._handle(res);
  },

  async del(path) {
    const res = await fetch(API_BASE + path, {
      method:  'DELETE',
      headers: this._headers(),
    });
    return this._handle(res);
  },
};

// ── Toast notifications ──────────────────────────────────────────────────────
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span style="font-size:1.1rem;">${icons[type] || 'ℹ'}</span><span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ── Formatting helpers ───────────────────────────────────────────────────────
function fmt$$(amount) {
  return '$' + Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

function fmtDateTime(dateStr) {
  return new Date(dateStr).toLocaleString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function txnTypeBadge(type) {
  const map = {
    DEPOSIT:    { cls: 'badge-success', icon: '↓', label: 'Deposit'    },
    WITHDRAWAL: { cls: 'badge-danger',  icon: '↑', label: 'Withdrawal' },
    BOOKING:    { cls: 'badge-primary', icon: '✈', label: 'Booking'    },
    BONUS:      { cls: 'badge-warning', icon: '🎁', label: 'Bonus'      },
    REFUND:     { cls: 'badge-success', icon: '↩', label: 'Refund'     },
  };
  const m = map[type] || { cls: 'badge-muted', icon: '·', label: type };
  return `<span class="badge ${m.cls}">${m.icon} ${m.label}</span>`;
}

function statusBadge(status) {
  const map = {
    COMPLETED: 'badge-success',
    PENDING:   'badge-primary',
    QUEUED:    'badge-warning',
    FAILED:    'badge-danger',
  };
  return `<span class="badge ${map[status] || 'badge-muted'}">${status}</span>`;
}

function txnAmountColor(type, amount) {
  const positive = ['DEPOSIT', 'BONUS', 'REFUND'];
  const color = positive.includes(type) ? 'var(--success)' : 'var(--danger)';
  const sign  = positive.includes(type) ? '+' : '-';
  return `<span style="font-weight:700;color:${color};">${sign}${fmt$$(Math.abs(amount))}</span>`;
}
