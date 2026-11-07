# PayProof Network

PayProof is a payment intelligence layer for commerce platforms. It interprets checkout outcomes, explains likely causes in plain language, helps recover eligible human checkouts, and surfaces patterns that need operator attention. It distinguishes human, agent, and unknown checkout origins so failures can follow the appropriate recovery path.

> **Sandbox notice:** Configured transactions use Braintree Sandbox. No real money moves. Without Sandbox credentials, the storefront labels its fallback as simulated. Do not use real customer or payment data.

## Run locally

Requirements: Node.js 21.0 or newer.

```sh
cp .env.example .env.local
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Braintree Sandbox credentials enable Hosted Fields checkout; without them, the clearly labeled simulated fallback remains available.

## Implemented capabilities

- Braintree Sandbox checkout with server-side cart validation, catalog pricing, and idempotency.
- Authenticated agent checkout with structured failure guidance and human-review cases.
- Plain-language payment diagnostics, merchant-scoped analytics, and cross-merchant incident detection.
- Single-use recovery links for eligible failed human checkouts.
- Case review with transaction evidence, citations, customer reply drafts, and case-scoped assistance.
- Merchant portal with store-scoped authentication and payment, case, and incident summaries.
- Configurable Sandbox diagnostic simulations with Groq analysis grounded in the resulting transaction records.
- Admin review of incident notification drafts and agent actions.
- Optional Neon Postgres persistence through Prisma.

AI output is advisory. PayProof does not move money autonomously or send notifications without human approval. All demo and Sandbox records are fictional.

## Persistence and migrations

Without `DATABASE_URL`, the demo ledger uses process memory and resets when the server restarts. To use Neon locally, configure the project-root `.env` and use the documented Prisma commands in `package.json`. Apply reviewed migrations only to the intended database.

The Prisma schema is in `prisma/schema.prisma`. A pending forward migration removes the legacy stock reservation and protection schema; apply it deliberately before deploying this code.

## Agent checkout

`POST /api/connector/checkout` accepts an authenticated request using `Authorization: Bearer $CONNECTOR_SHARED_SECRET` and JSON containing `idempotencyKey`, catalog `items`, and a Braintree `paymentMethodNonce`. It requires persistent storage and configured Braintree Sandbox credentials. Failed agent payments create a case requiring human review and return machine-readable alternate-payment guidance. Storefront checkouts are marked `HUMAN` only after explicit confirmation; otherwise their origin is `UNKNOWN`.

See [MILESTONE_PLAN.md](./MILESTONE_PLAN.md) for implementation status and remaining work.
