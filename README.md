# PayProof

PayProof is a payment incident and merchant protection desk with a fictional storefront and a Braintree Sandbox checkout.

> **Sandbox notice:** Configured checkout transactions run through Braintree Sandbox. No real money moves. When Braintree Sandbox credentials are absent, the storefront labels its fallback as simulated. Do not use real customer or payment data.

## Run locally

Requirements: Node.js 21.0 or newer.

```sh
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Braintree Sandbox credentials enable card checkout; without them, the clearly labeled simulated fallback remains available.

## Implemented

- Six fictional products, searchable catalog, quantity-managed cart.
- Server route recomputes the total from the product catalog; client-provided prices are never accepted.
- Braintree Sandbox card checkout using Braintree Hosted Fields and server-side transaction creation.
- Clearly labeled simulated success, decline, and duplicate-payment outcomes when Braintree Sandbox credentials are unavailable.
- Server-side cart validation and idempotency key handling for repeated order-creation requests.
- Stock reservations; successful capture commits the reservation, failed capture releases it when protection is on, and leaves it held when protection is off.
- Simulated case creation and incident desk counters for payment events, failures, released stock, and stuck stock.
- Merchant console at `/admin` with case queue, incident details, evidence readiness, inventory, order history, and protection controls.
- Protection toggle and demo reset.
- Motion-first checkout button with click ripple, loading/success/error feedback, and reduced-motion support.
- GSAP-powered admin entrance, live metric/chart transitions, elastic protection toggle, case selection, refresh, and reset feedback; reduced-motion preferences are respected.
- Optional Neon Postgres persistence through Prisma for products, owners, orders, order items, reservations, payment events, cases, evidence items, AI drafts, protection settings, and demo runs.

## Current limitations

Without `DATABASE_URL`, the demo ledger remains process-memory only and resets when the server restarts. To enable Neon persistence, put your Neon connection string in `.env.local`, then run:

```sh
npm run db:push
npm run db:seed
```

With `DATABASE_URL` configured, the API uses Prisma transactions for order creation, idempotency, stock reservations, capture results, incident records, protection settings, and reset. The seed script fills each table with repeatable fictional demo data. Braintree Sandbox is the only connected payment provider; its merchant ID, public key, and private key stay server-side, while a short-lived client token configures Hosted Fields in the browser. Simulated checkout is used only when Sandbox credentials are unavailable.

The Prisma schema lives in `prisma/schema.prisma`. For rapid prototyping use `npm run db:push`; for versioned schema changes use `npm run db:migrate` and commit the generated Prisma migration.

See [PAYPROOF_DEV_README.md](./PAYPROOF_DEV_README.md) for the complete build spec and phase order.
