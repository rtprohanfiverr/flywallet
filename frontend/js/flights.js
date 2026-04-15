// ── FlyWallet Flights JS ────────────────────────────────────────────────────

let walletBalance  = 0;
let selectedFlight = null;
let selectedPassengers = 1;

document.addEventListener('DOMContentLoaded', async () => {
  // Set default date to tomorrow
  const dateInput = document.getElementById('date');
  if (dateInput) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    dateInput.value = tomorrow.toISOString().slice(0, 10);
  }

  await loadWalletBalance();
  await loadPopularFlights();

  const form = document.getElementById('search-form');
  if (form) form.addEventListener('submit', handleSearch);
});

async function loadWalletBalance() {
  try {
    const data = await api.get('/wallet');
    walletBalance = data.wallet.available;
    setText('sidebar-balance',    fmt$$(data.wallet.available));
    setText('wallet-balance-bar', fmt$$(data.wallet.available));
  } catch (err) {
    console.error('Failed to load wallet:', err.message);
  }
}

async function loadPopularFlights() {
  const container = document.getElementById('popular-flights');
  if (!container) return;

  try {
    const data = await api.get('/flights/popular');
    container.innerHTML = data.flights.map(f => renderFlightCard(f)).join('');
  } catch (err) {
    container.innerHTML = `<div class="alert alert-error" style="grid-column:1/-1;">${err.message}</div>`;
  }
}

async function handleSearch(e) {
  e.preventDefault();

  const origin      = document.getElementById('origin').value.trim().toUpperCase();
  const destination = document.getElementById('destination').value.trim().toUpperCase();
  const passengers  = parseInt(document.getElementById('passengers').value) || 1;

  selectedPassengers = passengers;

  const loading   = document.getElementById('search-loading');
  const results   = document.getElementById('flight-results');
  const noResults = document.getElementById('no-results');
  const popular   = document.getElementById('popular-section');
  const btnText   = document.getElementById('search-btn-text');
  const spinner   = document.getElementById('search-spinner');

  loading.classList.remove('hidden');
  results.innerHTML = '';
  noResults.classList.add('hidden');
  popular.classList.add('hidden');
  btnText.classList.add('hidden');
  spinner.classList.remove('hidden');

  try {
    const data = await api.get('/flights/search', { origin, destination, passengers });

    loading.classList.add('hidden');
    btnText.classList.remove('hidden');
    spinner.classList.add('hidden');

    if (!data.flights || data.flights.length === 0) {
      noResults.classList.remove('hidden');
      return;
    }

    results.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
        <h3>${data.count} flight${data.count !== 1 ? 's' : ''} found</h3>
        <span class="text-muted text-sm">${passengers} passenger${passengers > 1 ? 's' : ''}</span>
      </div>
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">
        ${data.flights.map(f => renderFlightCard(f, true)).join('')}
      </div>`;
  } catch (err) {
    loading.classList.add('hidden');
    btnText.classList.remove('hidden');
    spinner.classList.add('hidden');
    results.innerHTML = `<div class="alert alert-error">⚠️ ${err.message}</div>`;
  }
}

function renderFlightCard(flight, showPassengerPrice = false) {
  const price    = showPassengerPrice ? flight.totalPrice : flight.price;
  const canAfford = walletBalance >= price;
  const stopText  = flight.stops === 0 ? 'Non-stop' : `${flight.stops} stop`;

  return `
    <div class="flight-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
        <span style="font-weight:700;font-size:0.9rem;">${flight.airline}</span>
        <span class="badge badge-muted">${stopText}</span>
      </div>

      <div class="flight-route">
        <div style="text-align:left;">
          <div class="flight-city">${flight.origin}</div>
          <div class="flight-code">${flight.departTime}</div>
        </div>

        <div class="flight-line">
          <div class="flight-line-bar"></div>
          <div style="font-size:0.7rem;color:var(--text-dim);margin-top:4px;">${flight.duration}</div>
        </div>

        <div style="text-align:right;">
          <div class="flight-city">${flight.destination}</div>
          <div class="flight-code">${flight.arrivalTime}</div>
        </div>
      </div>

      <div class="flight-meta">
        <div>
          <div class="flight-price">${fmt$$(price)}</div>
          <div class="text-xs text-muted">${showPassengerPrice && flight.passengers > 1 ? `${flight.passengers} passengers` : 'per person'}</div>
        </div>
        <button
          class="btn ${canAfford ? 'btn-primary' : 'btn-ghost'} btn-sm"
          onclick="openBookModal(${JSON.stringify(JSON.stringify(flight))}, ${showPassengerPrice ? (flight.passengers || 1) : 1})"
          ${!canAfford && walletBalance > 0 ? 'title="Insufficient wallet balance"' : ''}
        >
          ${canAfford ? '✈ Book Now' : (walletBalance === 0 ? 'Add Funds' : '💳 Low Balance')}
        </button>
      </div>

      ${!canAfford && walletBalance > 0 ? `
        <div style="margin-top:8px;font-size:0.75rem;color:var(--warning);">
          Need ${fmt$$(price - walletBalance)} more · <a href="add-funds.html" style="color:var(--warning);">Add funds →</a>
        </div>` : ''}
    </div>`;
}

function openBookModal(flightJson, passengers) {
  selectedFlight     = JSON.parse(flightJson);
  selectedPassengers = passengers;

  const price = selectedFlight.totalPrice || (selectedFlight.price * passengers);
  const balanceAfter = walletBalance - price;

  document.getElementById('modal-flight-details').innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <span class="text-muted text-sm">Flight</span>
      <span style="font-weight:600;">${selectedFlight.airline}</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <span class="text-muted text-sm">Route</span>
      <span style="font-weight:600;">${selectedFlight.origin} → ${selectedFlight.destination}</span>
    </div>
    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
      <span class="text-muted text-sm">Departure</span>
      <span style="font-weight:600;">${selectedFlight.departTime}</span>
    </div>
    <div style="display:flex;justify-content:space-between;">
      <span class="text-muted text-sm">Passengers</span>
      <span style="font-weight:600;">${passengers}</span>
    </div>`;

  document.getElementById('modal-total').textContent        = fmt$$(price);
  document.getElementById('modal-balance-after').textContent = balanceAfter >= 0
    ? fmt$$(balanceAfter)
    : '⚠ Insufficient';
  document.getElementById('modal-balance-after').style.color = balanceAfter >= 0
    ? 'var(--success)' : 'var(--danger)';

  document.getElementById('modal-alert').innerHTML = '';
  document.getElementById('book-modal').classList.remove('hidden');
}

function closeModal() {
  document.getElementById('book-modal').classList.add('hidden');
  selectedFlight = null;
}

async function confirmBooking() {
  if (!selectedFlight) return;

  const btn     = document.getElementById('confirm-btn');
  const btnText = document.getElementById('confirm-btn-text');
  const spinner = document.getElementById('confirm-spinner');
  const alert   = document.getElementById('modal-alert');

  btn.disabled = true;
  btnText.textContent = 'Booking…';
  spinner.classList.remove('hidden');
  alert.innerHTML = '';

  try {
    const data = await api.post('/flights/book', {
      flightId:   selectedFlight.id,
      passengers: selectedPassengers,
    });

    closeModal();
    walletBalance = data.balance;
    setText('sidebar-balance',    fmt$$(data.balance));
    setText('wallet-balance-bar', fmt$$(data.balance));

    showToast(`✈ Flight booked! ${selectedFlight.origin} → ${selectedFlight.destination}`, 'success');

    // Refresh popular flights to update affordability
    await loadPopularFlights();
  } catch (err) {
    alert.innerHTML = `<div class="alert alert-error" style="margin-bottom:0;">⚠️ ${err.message}</div>`;
    btn.disabled = false;
    btnText.textContent = '✈ Confirm & Pay';
    spinner.classList.add('hidden');
  }
}

function setRoute(origin, destination) {
  document.getElementById('origin').value      = origin;
  document.getElementById('destination').value = destination;
}

function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

// Close modal on overlay click
document.getElementById('book-modal')?.addEventListener('click', (e) => {
  if (e.target === document.getElementById('book-modal')) closeModal();
});
