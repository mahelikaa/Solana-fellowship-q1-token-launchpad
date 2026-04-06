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
  - `tiers`: optional array of `{ minAmount, maxAmount, pricePerToken }` — for tiered pricing
  - `vesting`: optional `{ cliffDays, vestingDays, tgePercent }` — for token vesting schedule
  - Response `201`: launch object with `id`, `creatorId`, computed `status` — Response `400`: missing fields
- **GET /api/launches** — List launches (public) — Query: `?page=1&limit=10&status=ACTIVE`
  - Response `200`: `{ launches, total, page, limit }`
  - Each launch includes a computed `status` field
  - Optional `status` filter: only return launches matching that status
- **GET /api/launches/:id** — Get launch (public) with computed status — Response `200` or `404`
- **PUT /api/launches/:id** — Update launch (auth, creator only)
  - Response `200` / `401` / `403` / `404`

**Computed Status** — every launch response must include a `status` field:
- `SOLD_OUT`: total purchased >= totalSupply
- `UPCOMING`: current time < startsAt
- `ENDED`: current time > endsAt
- `ACTIVE`: between startsAt and endsAt, not sold out

### Whitelist Management (auth, creator only)
- **POST /api/launches/:id/whitelist** — Add addresses
  - Body: `{ addresses: string[] }` — Response `200`: `{ added, total }` (skip duplicates)
- **GET /api/launches/:id/whitelist** — Response `200`: `{ addresses, total }` — `403` for non-creator
- **DELETE /api/launches/:id/whitelist/:address** — Response `200`: `{ removed: true }` / `404`

### Referral Codes (auth, creator only)
- **POST /api/launches/:id/referrals** — Create a referral code
  - Body: `{ code, discountPercent, maxUses }`
  - Response `201`: `{ id, code, discountPercent, maxUses, usedCount: 0 }`
  - Response `409`: duplicate code for this launch
- **GET /api/launches/:id/referrals** — List referral codes with `usedCount`

### Token Purchases (auth required)
- **POST /api/launches/:id/purchase** — Record purchase
  - Body: `{ walletAddress, amount, txSignature, referralCode? }`
  - Response `201`: purchase object with computed `totalCost`
  - **Pricing**: If launch has `tiers`, calculate cost by filling tiers in order (each tier has capacity = maxAmount - minAmount). Overflow beyond all tiers uses flat `pricePerToken`. Without tiers: `totalCost = amount * pricePerToken`.
  - **Referral discount**: If `referralCode` provided, apply `discountPercent` to totalCost. Increment `usedCount`. Return `400` if code invalid or exhausted (`usedCount >= maxUses`).
  - **Sybil protection**: `maxPerWallet` is enforced per **user** (across ALL wallets), not per wallet address. Sum all purchases by the same userId for the launch.
  - Response `400`: launch not ACTIVE (reject UPCOMING, ENDED, SOLD_OUT), not whitelisted (when whitelist exists), exceeds maxPerWallet per user, exceeds totalSupply, duplicate txSignature, invalid referral
  - Response `404`: launch not found
  - If whitelist is empty, any wallet can purchase
- **GET /api/launches/:id/purchases** — Creator sees all purchases; other authenticated users see only their own purchases — `401` without auth
  - Response `200`: `{ purchases: Array<{ id, userId, walletAddress, amount, totalCost, txSignature, ... }>, total }`
  - Each purchase object must include `userId` so ownership can be verified

### Vesting Schedule
- **GET /api/launches/:id/vesting?walletAddress=ADDR** — Calculate vesting for a wallet
  - Response `200`: `{ totalPurchased, tgeAmount, cliffEndsAt, vestedAmount, lockedAmount, claimableAmount }`
  - `tgeAmount` = floor(totalPurchased * tgePercent / 100)
  - After cliff: linear vesting over `vestingDays`
  - Without vesting config: all tokens claimable immediately (`claimableAmount = totalPurchased`)
  - Response `400`: missing walletAddress — Response `404`: launch not found

## Tech Stack
Express.js, PostgreSQL + Prisma, JWT + bcryptjs

## Environment Variables
`DATABASE_URL`, `JWT_SECRET` — pre-configured in `.env`

## Start Command
```bash
npm install && source .env && npx prisma generate && npx prisma db push && npm start
```

Server must listen on port **3000**.

---

## 📊 Score

**78 / 83 test cases passed**
