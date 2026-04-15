// ── FlyWallet Auth Utilities ────────────────────────────────────────────────

function getUser() {
  try {
    return JSON.parse(localStorage.getItem('fw_user') || 'null');
  } catch {
    return null;
  }
}

function getToken() {
  return localStorage.getItem('fw_token');
}

function logout() {
  localStorage.removeItem('fw_token');
  localStorage.removeItem('fw_user');
  window.location.href = 'login.html';
}

// Redirect to login if not authenticated
function requireAuth() {
  if (!getToken()) {
    window.location.href = 'login.html';
    return false;
  }
  return true;
}

// Redirect to login if not admin
function requireAdmin() {
  const user = getUser();
  if (!getToken() || !user) {
    window.location.href = 'login.html';
    return false;
  }
  if (user.role !== 'ADMIN') {
    window.location.href = 'dashboard.html';
    return false;
  }
  return true;
}

// Set user name in navbar
function setNavUser() {
  const user = getUser();
  const el   = document.getElementById('nav-user');
  if (el && user) el.textContent = user.name;

  const adminEl = document.getElementById('nav-admin-name');
  if (adminEl && user) adminEl.textContent = user.name;
}

// Run on all protected pages
document.addEventListener('DOMContentLoaded', () => {
  // Pages that require login
  const protectedPages = ['dashboard.html', 'add-funds.html', 'withdraw.html', 'flights.html'];
  const adminPages     = ['admin.html'];
  const currentPage    = window.location.pathname.split('/').pop();

  if (protectedPages.includes(currentPage)) {
    if (!requireAuth()) return;
  }
  if (adminPages.includes(currentPage)) {
    if (!requireAdmin()) return;
  }

  setNavUser();
});
