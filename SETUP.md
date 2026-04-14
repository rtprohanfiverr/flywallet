# FlyWallet — Setup Guide

## Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis (optional — for withdrawal queue)

---

## 1. Clone & Install

```bash
cd backend
npm install
```

---

## 2. Configure Environment

```bash
cd backend
cp .env.example .env
```

Edit `.env` and fill in:

| Variable | Description |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | Random 64-byte hex string |
| `STRIPE_SECRET_KEY` | Stripe test/live secret key |
| `REDIS_URL` | Redis URL (optional) |
| `FRONTEND_URL` | Where your frontend is served from |

Generate a JWT secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

---

## 3. Set Up Database

```bash
cd backend
npm run db:generate   # Generate Prisma client
npm run db:push       # Push schema to PostgreSQL
npm run db:seed       # Seed demo users & data
```

---

## 4. Start Backend

```bash
cd backend
npm run dev           # Development (nodemon)
# or
npm start             # Production
```

Backend runs at: `http://localhost:5000`

---

## 5. Serve Frontend

Use any static file server. With VS Code **Live Server**:
- Right-click `frontend/index.html` → Open with Live Server

Or with Node:
```bash
npx serve frontend
```

Frontend default: `http://127.0.0.1:5500`

---

## 6. Demo Credentials

| Role  | Email | Password |
|---|---|---|
| Admin | admin@flywallet.com | Admin@123 |
| User  | alice@example.com   | Demo@123  |
| User  | bob@example.com     | Demo@123  |

---

## Project Structure

```
Flywallet/
├── backend/
│   ├── server.js              # Express app entry point
│   ├── routes/
│   │   ├── auth.js            # POST /signup, /login, GET /me
│   │   ├── wallet.js          # GET /wallet, POST /deposit, /withdraw
│   │   ├── flights.js         # GET /search, /popular, /bookings; POST /book
│   │   └── admin.js           # Stats, users, freeze, bonus rate
│   ├── middleware/
│   │   └── auth.js            # requireAuth, requireAdmin, checkNotFrozen
│   ├── lib/
│   │   ├── prisma.js          # Prisma singleton
│   │   ├── jwt.js             # signToken / verifyToken
│   │   ├── stripe.js          # Stripe deposit / withdrawal helpers
│   │   └── queue.js           # BullMQ withdrawal queue
│   ├── jobs/
│   │   └── bonusJob.js        # Daily bonus cron (00:05)
│   └── prisma/
│       ├── schema.prisma      # DB schema
│       └── seed.js            # Demo data
│
└── frontend/
    ├── index.html             # Landing page
    ├── login.html             # Login
    ├── signup.html            # Sign up
    ├── dashboard.html         # User dashboard
    ├── add-funds.html         # Deposit page
    ├── withdraw.html          # Withdrawal page
    ├── flights.html           # Flight search & booking
    ├── admin.html             # Admin dashboard
    ├── css/style.css          # Global styles
    └── js/
        ├── api.js             # API client + helpers
        ├── auth.js            # Auth guard + logout
        ├── dashboard.js       # Dashboard logic
        ├── wallet.js          # Deposit/withdraw logic
        ├── flights.js         # Flight search/booking
        └── admin.js           # Admin panel logic
```

---

## API Endpoints

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/signup` | Register new user |
| POST | `/api/auth/login`  | Login, returns JWT |
| GET  | `/api/auth/me`     | Get current user (auth required) |

### Wallet
| Method | Endpoint | Description |
|---|---|---|
| GET  | `/api/wallet`              | Get balance + last 20 transactions |
| POST | `/api/wallet/deposit`      | Deposit funds |
| POST | `/api/wallet/withdraw`     | Request withdrawal |
| GET  | `/api/wallet/transactions` | Paginated transaction history |

### Flights
| Method | Endpoint | Description |
|---|---|---|
| GET  | `/api/flights/search`   | Search flights by route |
| GET  | `/api/flights/popular`  | Get popular routes |
| POST | `/api/flights/book`     | Book a flight (deducts wallet) |
| GET  | `/api/flights/bookings` | User's booking history |

### Admin (admin role required)
| Method | Endpoint | Description |
|---|---|---|
| GET  | `/api/admin/stats`              | Platform-wide metrics |
| GET  | `/api/admin/users`              | All users (paginated) |
| POST | `/api/admin/freeze`             | Freeze/unfreeze account |
| PUT  | `/api/admin/bonus-rate`         | Update daily bonus rate |
| POST | `/api/admin/bonus/run`          | Manually trigger bonus |
| GET  | `/api/admin/withdrawals/queued` | View queued withdrawals |

---

## Compliance Notes

- No guaranteed returns or ROI promises anywhere
- Bonus credits are variable and may be zero
- FlyWallet is a **travel wallet**, not an investment product
- Disclaimer banner shown on all authenticated pages
- Funds can be withdrawn anytime (subject to liquidity)
