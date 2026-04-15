const express = require('express');
const { z } = require('zod');
const prisma = require('../lib/prisma');
const { requireAuth, checkNotFrozen } = require('../middleware/auth');

const router = express.Router();

// ── Mock flight data ──────────────────────────────────────────────────────────
const MOCK_FLIGHTS = [
  { id: 'FL001', airline: 'Emirates',        origin: 'DXB', destination: 'LHR', departTime: '08:00', arrivalTime: '13:30', duration: '7h 30m', price: 420, stops: 0,  class: 'Economy' },
  { id: 'FL002', airline: 'British Airways', origin: 'LHR', destination: 'JFK', departTime: '10:00', arrivalTime: '13:00', duration: '8h 00m', price: 580, stops: 0,  class: 'Economy' },
  { id: 'FL003', airline: 'Qatar Airways',   origin: 'DOH', destination: 'SIN', departTime: '14:30', arrivalTime: '03:00', duration: '7h 30m', price: 510, stops: 0,  class: 'Economy' },
  { id: 'FL004', airline: 'Singapore Air',   origin: 'SIN', destination: 'SYD', departTime: '22:00', arrivalTime: '07:30', duration: '7h 30m', price: 380, stops: 0,  class: 'Economy' },
  { id: 'FL005', airline: 'Lufthansa',       origin: 'FRA', destination: 'NYC', departTime: '11:15', arrivalTime: '14:00', duration: '9h 45m', price: 620, stops: 0,  class: 'Economy' },
  { id: 'FL006', airline: 'Air France',      origin: 'CDG', destination: 'DXB', departTime: '07:00', arrivalTime: '15:30', duration: '6h 30m', price: 390, stops: 0,  class: 'Economy' },
  { id: 'FL007', airline: 'Emirates',        origin: 'DXB', destination: 'BOM', departTime: '09:00', arrivalTime: '11:45', duration: '2h 45m', price: 160, stops: 0,  class: 'Economy' },
  { id: 'FL008', airline: 'IndiGo',          origin: 'BOM', destination: 'DEL', departTime: '06:00', arrivalTime: '08:00', duration: '2h 00m', price:  75, stops: 0,  class: 'Economy' },
  { id: 'FL009', airline: 'United',          origin: 'JFK', destination: 'LAX', departTime: '15:00', arrivalTime: '18:20', duration: '5h 20m', price: 220, stops: 1,  class: 'Economy' },
  { id: 'FL010', airline: 'Etihad',          origin: 'AUH', destination: 'LHR', departTime: '03:00', arrivalTime: '07:30', duration: '7h 30m', price: 450, stops: 0,  class: 'Economy' },
];

const searchSchema = z.object({
  origin:      z.string().min(2).max(4).optional(),
  destination: z.string().min(2).max(4).optional(),
  date:        z.string().optional(),
  passengers:  z.coerce.number().int().positive().max(9).default(1),
});

const bookSchema = z.object({
  flightId:   z.string(),
  passengers: z.number().int().positive().max(9).default(1),
});

// ── GET /api/flights/search ───────────────────────────────────────────────────
router.get('/search', requireAuth, async (req, res, next) => {
  try {
    const { origin, destination, passengers } = searchSchema.parse(req.query);

    let results = [...MOCK_FLIGHTS];

    if (origin)      results = results.filter(f => f.origin.toUpperCase()      === origin.toUpperCase());
    if (destination) results = results.filter(f => f.destination.toUpperCase() === destination.toUpperCase());

    // Apply passenger multiplier
    results = results.map(f => ({
      ...f,
      totalPrice: parseFloat((f.price * passengers).toFixed(2)),
      passengers,
    }));

    // Simulate API delay
    await new Promise(r => setTimeout(r, 300));

    res.json({ flights: results, count: results.length });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
});

// ── GET /api/flights/popular ──────────────────────────────────────────────────
router.get('/popular', requireAuth, async (req, res) => {
  const popular = MOCK_FLIGHTS.slice(0, 6).map(f => ({
    ...f,
    totalPrice: f.price,
    passengers: 1,
  }));
  res.json({ flights: popular });
});

// ── POST /api/flights/book ────────────────────────────────────────────────────
router.post('/book', requireAuth, checkNotFrozen, async (req, res, next) => {
  try {
    const { flightId, passengers } = bookSchema.parse(req.body);

    const flight = MOCK_FLIGHTS.find(f => f.id === flightId);
    if (!flight) return res.status(404).json({ error: 'Flight not found' });

    const totalAmount = parseFloat((flight.price * passengers).toFixed(2));

    // Atomic: check balance → deduct → create booking + transaction
    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: req.userId } });
      if (!wallet) throw Object.assign(new Error('Wallet not found'), { status: 404 });

      const available = Number(wallet.balance) - Number(wallet.lockedBalance);
      if (available < totalAmount) {
        throw Object.assign(
          new Error(`Insufficient wallet balance. Need $${totalAmount.toFixed(2)}, have $${available.toFixed(2)}`),
          { status: 400 }
        );
      }

      // Deduct balance
      const updatedWallet = await tx.wallet.update({
        where: { userId: req.userId },
        data:  { balance: { decrement: totalAmount } },
      });

      // Create transaction ledger entry
      const txn = await tx.transaction.create({
        data: {
          userId:      req.userId,
          type:        'BOOKING',
          amount:      totalAmount,
          status:      'COMPLETED',
          description: `Flight ${flight.origin} → ${flight.destination} (${flight.airline})`,
          metadata:    { flightId, passengers, airline: flight.airline },
        },
      });

      // Create booking record
      const booking = await tx.booking.create({
        data: {
          userId:      req.userId,
          flightId,
          origin:      flight.origin,
          destination: flight.destination,
          departDate:  new Date().toISOString().slice(0, 10),
          passengers,
          amount:      totalAmount,
        },
      });

      return { txn, booking, wallet: updatedWallet };
    });

    res.status(201).json({
      message:  'Flight booked successfully!',
      booking:  result.booking,
      balance:  Number(result.wallet.balance),
      flight,
    });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// ── GET /api/flights/bookings ─────────────────────────────────────────────────
router.get('/bookings', requireAuth, async (req, res, next) => {
  try {
    const bookings = await prisma.booking.findMany({
      where:   { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ bookings });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
