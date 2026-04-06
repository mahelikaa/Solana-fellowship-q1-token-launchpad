# Solana Token Launchpad Backend (Medium)

This project was built as part of the **Solana India Fellowship selection process (Question 1)**.

Build a database-backed REST API for a Solana token launchpad platform. Users can register, create token launches, manage whitelists, purchase tokens with tiered pricing, use referral codes, and track vesting schedules.

## Requirements

### Health Check
- **GET /api/health** — Returns `{ status: "ok" }` — Status: `200`

### Authentication
- **POST /api/auth/register** — Register a new user
  - Body: `{ email, password, name }`
  - Response `201`: `{ token, user: { id, email, name } }`
  - Response `400`: missing fields — Response `409`: duplicate email
- **POST /api/auth/login** — Login
  - Body: `{ email, password }`
  - Response `200`: `{ token, user: { id, email, name } }`
  - Response `401`: invalid credentials or non-existent user

All routes below require JWT in `Authorization: Bearer <token>` header unless stated. Return `401` for missing/invalid tokens.

### Token Launches (with Computed Status)
- **POST /api/launches** — Create launch (auth required)
  - Body: `{ name, symbol, totalSupply, pricePerToken, startsAt, endsAt, maxPerWallet, description, tiers?, vesting? }`
  - `tiers`: optional array of `{ minAmount, maxAmount, pricePerToken }`
  - `vesting`: optional `{ cliffDays, vestingDays, tgePercent }`
  - Response `201`: launch object with `id`, `creatorId`, computed `status` — Response `400`: missing fields
- **GET /api/launches** — List launches (public) — Query: `?page=1&limit=10&status=ACTIVE`
  - Response `200`: `{ launches, total, page, limit }`
  - Each launch includes a computed `status` field
  - Optional `status` filter
- **GET /api/launches/:id** — Get launch (public) with computed status — Response `200` or `404`
- **PUT /api/launches/:id** — Update launch (auth, creator only)
  - Response `200` / `401` / `403` / `404`

**Computed Status**
- `SOLD_OUT`: total purchased >= totalSupply
- `UPCOMING`: current time < startsAt
- `ENDED`: current time > endsAt
- `ACTIVE`: between startsAt and endsAt, not sold out

### Whitelist Management (auth, creator only)
- **POST /api/launches/:id/whitelist**
  - Body: `{ addresses: string[] }` — Response `200`: `{ added, total }`
- **GET /api/launches/:id/whitelist** — Response `200`: `{ addresses, total }` — `403` for non-creator
- **DELETE /api/launches/:id/whitelist/:address** — Response `200`: `{ removed: true }` / `404`

### Referral Codes (auth, creator only)
- **POST /api/launches/:id/referrals**
  - Body: `{ code, discountPercent, maxUses }`
  - Response `201`: `{ id, code, discountPercent, maxUses, usedCount: 0 }`
  - Response `409`: duplicate code
- **GET /api/launches/:id/referrals**

### Token Purchases (auth required)
- **POST /api/launches/:id/purchase**
  - Body: `{ walletAddress, amount, txSignature, referralCode? }`
  - Response `201`: purchase object with computed `totalCost`
  - Tiered pricing supported
  - Referral discounts applied
  - `maxPerWallet` enforced per user
  - Response `400` / `404` for invalid cases
- **GET /api/launches/:id/purchases**
  - Creator sees all, users see their own

### Vesting Schedule
- **GET /api/launches/:id/vesting?walletAddress=ADDR**
  - Response includes vesting breakdown
  - Without vesting: fully claimable

---
