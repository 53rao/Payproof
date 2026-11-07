# PayProof Network — Developer Notes

The pasted PayProof Network description is the source of truth for product scope. See [MILESTONE_PLAN.md](./MILESTONE_PLAN.md) for implementation status and remaining work.

## Product

PayProof is a payment intelligence layer between merchant storefronts and Braintree. It interprets checkout outcomes, explains likely causes from transaction signals, selects recovery behavior by checkout origin, detects cross-merchant patterns, and gives platform operators evidence for human review.

Human checkouts may receive single-use recovery links. Agent checkout failures receive structured retry guidance and can open a human-review case. Admin notification content is drafted for review; PayProof does not send it automatically. Agent-channel controls are explicit human actions. AI outputs are advisory hypotheses grounded in payment records.

PayProof does not manage stock or inventory, autonomously move money, or make payment dispute decisions. The connected processor is Braintree Sandbox. All sample records are fictional.

## Current implementation

- Next.js App Router and TypeScript.
- Prisma with optional Neon Postgres persistence.
- Braintree Sandbox checkout and authenticated connector checkout.
- Groq for case-scoped assistance and simulation diagnosis, with structured fallbacks.
- Owner admin Network Overview, merchant portal, payment activity, incidents, and case workspace.

## Local development

```sh
npm install
npm run dev
```

Use `.env.example` to see required variable names. Keep secrets in local environment files; do not include credentials in client code or logs. Sandbox transactions are not real payments.

## Important paths

- `app/api/checkout/` — storefront checkout.
- `app/api/connector/checkout/` — authenticated agent checkout.
- `app/api/admin/` — admin incident, action, activity, and diagnosis endpoints.
- `app/api/merchant/` — merchant authentication and scoped dashboard.
- `app/owner/cases/` — case review workspace.
- `lib/incident-detector.ts` — payment and case pattern detection.
- `lib/case-assistant.ts` — evidence-grounded case analysis and reply drafts.
- `lib/database-demo-store.ts` — persisted orders, payment events, cases, and diagnostics.
- `prisma/schema.prisma` — current data model.

Apply reviewed Prisma migrations only to the intended database. The pending migration `20261107180000_remove_inventory` removes the legacy stock reservation and protection schema; do not apply it to a database until the target is confirmed.
