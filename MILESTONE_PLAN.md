# PayProof Masterplan and Agent Handoff (M1–M5)

This is the canonical project handoff and milestone file. Read it before resuming work. It records decisions made in chat, current implementation status, relevant code paths, and what remains open. Update this file when the user approves a decision or a milestone changes state.

## Resume instructions

- M1–M4 are complete and hosted on the existing Vercel project. M5 merchant analytics is complete locally; M5 transaction simulations are the next open implementation area.
- Do not start implementing the simulations until the user chooses the simulation source: deterministic demo-ledger events or actual Braintree Sandbox transactions. A Sandbox nonce-based option has been discussed but not approved.
- After each milestone, stop and wait for the user's direction before starting another milestone.
- Preserve the current color palette and existing merchant/case behavior unless the user asks to change it.
- The user already has all 12 local environment variables configured and uses an existing Neon cloud database. Do not ask for their secret values; never read or print `.env` values or commit local secrets.
- The existing Vercel project now hosts M2, M3, and M4. The user confirmed M3 and M4 are deployed. Do not create or import a second Vercel project.
- `MILESTONES.md` was deleted at the user's request. Do not recreate it. This file, `MILESTONE_PLAN.md`, is the masterplan.
- The user has confirmed that M3/M4 are hosted and that M3/M4 and merchant analytics work locally. No independent automated test suite was run in this handoff.

## Current checkpoint (2026-11-07)

- M1 and M2 are complete. A successful agent checkout against the deployed endpoint remains explicitly deferred.
- M3 (merchant-aware cases) is complete and hosted.
- M4 (case Kanban and full modal workspace) is complete and hosted.
- M5 merchant analytics is implemented and locally verified.
- M5's four transaction simulations and their underlying payment source are unresolved and not implemented.
- The current local Git branch was `main` when this file was expanded. Recheck `git status` before making a commit; deployed code may already be ahead of or differ from the current working tree.
- The existing Vercel project hosts M2, M3, and M4. Do not create a second Vercel project. If a deployment issue comes up, inspect the deployment's commit and environment before changing configuration.
- The user ran `npm run db:migrate` against their existing Neon database and reported that local M3 works. The migration `prisma/migrations/20261107100000_merchants/migration.sql` should be included in a Git commit. Before any future production database change, confirm the target database and migration status; do not rerun `migrate dev` against production just by habit.

## Product and implementation context

PayProof is a fictional merchant incident and trust desk. It records checkout origins, payment outcomes, stock reservations, cases, evidence, and merchant responses. The current provider is **Braintree Sandbox**, not PayPal. Transactions are Sandbox or explicitly simulated; never use live credentials or imply that real money moved. The AI may summarize supplied records but must not initiate transactions, change inventory/prices, send customer messages, or make payment-dispute decisions.

Current stack: Next.js App Router, TypeScript, Prisma 6, Neon Postgres, Braintree Sandbox, and Groq for optional case explanations/drafts. The project `README.md` and older sections in `PAYPROOF_DEV_README.md` contain some historical PayPal wording; use the current Braintree code and the M1/M2 decisions in this file as the source of truth.

### Environment and commands

The local `.env` is already configured. The variable names are documented in `.env.example`:

`DATABASE_URL`, `OWNER_EMAIL`, `OWNER_PASSWORD_HASH`, `SESSION_SECRET`, `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FALLBACK_MODEL`, `CONNECTOR_SHARED_SECRET`, `BRAINTREE_ENVIRONMENT`, `BRAINTREE_MERCHANT_ID`, `BRAINTREE_PUBLIC_KEY`, `BRAINTREE_PRIVATE_KEY`.

- `npm run dev` starts Next.js locally.
- `npm run build` runs `prisma generate && next build`; `postinstall` also runs `prisma generate`.
- `npm run db:migrate` is `prisma migrate dev`, intended for development. Production deployments should use reviewed migration files and `prisma migrate deploy` if a migration is pending.
- Current merchant migration creates fictional merchants, assigns product ownership, and seeds a Field & Form failed order/case. The user says this is already applied to their Neon database.
- Do not put `DATABASE_URL`, `CONNECTOR_SHARED_SECRET`, Braintree private credentials, or owner auth values in client code or logs. `.env*` is gitignored.

### Merchant data mapping

- `northstar` / Northstar Goods owns `mug`, `tote`, and `candle`.
- `fieldform` / Field & Form owns `journal`, `bottle`, and `socks`.
- Product ownership is persisted with `Product.merchantId`; case merchant scope is derived through the case's order items and product ownership.
- The case-board merchant selection uses browser `localStorage` key `payproof-owner-cases-merchant`. It persists across refreshes and is read/written only by `/owner/cases`; do not apply it globally to `/admin` or other endpoints.

## M1 — Braintree Sandbox checkout — COMPLETE

- [x] Replace PayPal with Braintree as the payment provider.
- [x] Use Braintree Hosted Fields/client token to tokenize card entry and send the resulting payment method nonce to the server.
- [x] Create the order on the server, validate product IDs/quantities, derive totals from the catalog, process Braintree Sandbox success/failure, and update payment/inventory state.
- [x] Keep the simulated fallback explicitly labeled when Sandbox credentials are unavailable.
- [x] Deploy and verify the regular checkout on the hosted M2 app, including Sandbox success/failure and order/inventory state (as recorded in the plan before M3).

## M2 — Origin-aware checkout and recovery — COMPLETE, WITH ONE DEFERRED CHECK

- [x] Persist checkout origin as `AGENT`, `HUMAN`, or `UNKNOWN`. Mark `HUMAN` only after explicit human confirmation; otherwise preserve `UNKNOWN`.
- [x] Support authenticated agent checkout via `POST /api/connector/checkout` using `Authorization: Bearer <CONNECTOR_SHARED_SECRET>`.
- [x] Validate cart items and quantities server-side; compute the amount from the product catalog; use an idempotency key; require a Braintree payment method nonce for a real Sandbox transaction.
- [x] On agent payment failure, release reserved inventory, create a case that requires human review, and return structured alternate-payment guidance. Do not send a customer message automatically.
- [x] Handle human/unknown failure through the existing checkout and protection behavior.
- [x] Provide an owner-approved simulated recovery checkout for failed eligible orders.
- [x] Verify origin labels and local agent checkout behavior.
- [ ] Verify a successful agent checkout against the deployed endpoint — **deferred per user instruction; not part of M5 unless the user reopens it.**

Relevant paths:

- `app/api/connector/checkout/route.ts` — authenticated, persistent, Braintree Sandbox agent checkout.
- `app/api/dev/agent-checkout/route.ts` — local-development-only proxy; returns 404 outside development and keeps connector secret server-side.
- `app/dev/agent-checkout/AgentCheckoutClient.tsx` — local test UI that uses Hosted Fields to obtain a nonce and calls the development proxy.
- `components/BraintreePaymentForm.tsx` — client Hosted Fields tokenization; calls `tokenize()` and passes the nonce to its submit callback.
- `lib/payment-provider.ts`, `lib/braintree.ts`, `lib/demo-store.ts`, `lib/database-demo-store.ts` — provider and order/payment/inventory paths.

## M3 — Merchant-aware cases — COMPLETE AND HOSTED

- [x] Associate persisted fictional demo merchants with catalog products.
- [x] Display the merchant name on each case; derive it from the case order's product ownership.
- [x] Add a merchant filter to the case board.
- [x] Remember the selection across refreshes in local storage, scoped only to `/owner/cases`.
- [x] Verify merchant assignment/filtering locally, including existing cases.
- [x] Add merchant-level dashboard analytics based on the existing ledger metrics; this was brought into the current M3 brief in chat and implemented with the later M5 dashboard work.

Relevant paths:

- `prisma/schema.prisma` — `Merchant` model and `Product.merchantId` relation.
- `prisma/migrations/20261107100000_merchants/migration.sql` — merchants, product assignment, and Field & Form seed data.
- `lib/database-demo-store.ts` — merchant-aware product seeding.
- `lib/customer-case-store.ts` — merchant ownership derived from order lines.
- `app/owner/cases/CasesListClient.tsx` — merchant selector, persistence, filtering, Kanban board.
- `components/admin/MerchantAnalytics.tsx` and `app/api/demo/merchant-analytics/route.ts` — merchant metrics view/API.

## M4 — Kanban board and full case-review modal — COMPLETE AND HOSTED

- [x] Replace the scan list at `/owner/cases` with **Open → In review → Closed** Kanban columns. The current label is **Open** (not “Pending” from an older plan draft); preserve this unless asked.
- [x] Support native drag and drop between columns and persist the status through the owner case status API.
- [x] Clicking an Open ticket moves it to In review and opens the modal. The background blurs while the modal is open; do not delay the blur until the case data request completes.
- [x] Embed the full case workspace in a modal: case/order details at the top, evidence/timeline on the left, assistant chat on the right. Preserve the separate data/chat APIs while keeping the old `/owner/cases/[caseId]` page route removed.
- [x] Preserve case workspace capabilities in the modal: chat/questions and citations, evidence selection and timeline, packet download, customer reply drafting/editing/saving/copying, merchant notes, merchant-response draft preparation/save/copy/download, and eligible failed-order recovery link creation/copy/preview.
- [x] Keep “Recover this sale” below the chat/evidence panels and keep the three collapsibles the same full width.
- [x] Remove the repeated order-status/origin line, the review status bar, and the case modal footer (“Private owner workspace” / “Back to case board”).
- [x] Add one circular close-review control beside the ticket title. Disable it until a customer reply draft is saved; the server also enforces this requirement. On click, close the review and move the case to Closed.
- [x] Show board update errors in a fixed toast so they do not push/reflow the board.
- [x] Persist merchant choice only on `/owner/cases`; persist case statuses through APIs/database.
- [x] User confirmed the case-board/modal experience works locally, including database-backed persistence.

Current modal geometry in `app/owner/cases/[caseId]/case-detail.css` is intentional and was tuned in chat: desktop width `min(1200px, 80vw)`, height `min(82.5dvh, 968px)`; mobile remains full-screen; 14px panel-to-panel gap; title-to-panel body top padding 6px desktop / 7px mobile. Do not “simplify” these values without checking the live UI with the user.

Relevant paths:

- `app/owner/cases/CasesListClient.tsx` and `app/owner/cases/owner-cases.css` — board, merchant filter, errors, card interaction.
- `app/owner/cases/[caseId]/CaseDetailClient.tsx` and `app/owner/cases/[caseId]/case-detail.css` — modal workspace and styling. `CaseDetailClient.tsx` is reused inside the modal; it is not a route page.
- `app/owner/cases/[caseId]/page.tsx` — intentionally deleted. Do not restore the separate page.
- `app/api/owner/cases/route.ts`, `app/api/owner/cases/[caseId]/route.ts`, `/status`, `/close`, `/notes`, `/recovery-link` — API routes remain.
- `lib/customer-case-store.ts`, `lib/case-assistant.ts` — case records, merchant derivation, draft gating, evidence and assistant behavior.

## M5 — Merchant dashboard and transaction simulations — IN PROGRESS

### Complete

- [x] Show merchant-level dashboard analytics using existing ledger data.
- [x] Group payment events, failures, released/stuck stock, recovered orders/revenue, and order counts by merchant.
- [x] User confirmed the analytics works locally against the configured Neon database.

### Still open

- [ ] Add four dashboard transaction simulations:
  - [ ] Human success.
  - [ ] Human failure.
  - [ ] Agent success.
  - [ ] Agent failure.
- [ ] Decide whether dashboard runs create deterministic `simulated` ledger records or actual Braintree Sandbox transactions.
- [ ] Verify each scenario updates payment/order status, stock reservations, checkout origin, case creation/human-review flags, and merchant analytics as appropriate.
- [ ] Verify repeated runs, idempotency, reset behavior, empty/low-stock conditions, loading/errors, and no duplicate or inconsistent ledger rows.

### Transaction/nonce discussion — NOT YET APPROVED

The user remembered a Braintree nonce. The current regular checkout uses Hosted Fields to produce a `paymentMethodNonce`; `/api/connector/checkout` requires it and sends it to Braintree. A nonce is a secure single-use reference to payment details, not raw card data or a reusable customer credential. Braintree also documents static test nonces such as `fake-valid-nonce` for Sandbox server-side testing. Sandbox test transaction outcome can be selected by the **server-calculated amount** (for example, normal sub-$2,000 amounts authorize; `$2,000–$2,999.99` processor-decline; `$3,000–$3,000.99` failure response). Verify the exact current Braintree Sandbox reference before coding against those thresholds.

Sources for the next agent:

- [Braintree payment method nonces](https://developer.paypal.com/braintree/docs/guides/payment-method-nonces)
- [Braintree Sandbox testing values](https://developer.paypal.com/braintree/docs/reference/general/testing/node)
- [Braintree transaction sale](https://developer.paypal.com/braintree/docs/reference/request/transaction/sale/node)

Two directions remain under discussion:

1. **Deterministic demo ledger:** use the app's simulated provider/business logic, mark every row simulated, avoid Braintree calls, and make outcomes repeatable. This is easiest to demo and avoids consuming Sandbox transaction runs.
2. **Actual Sandbox transaction:** a server-side owner-only simulation route can use a documented Sandbox test nonce and a server-chosen amount/cart. This creates real Braintree Sandbox transactions (no real money) and exercises the provider integration. Keep the nonce/server credentials server-side; do not expose `CONNECTOR_SHARED_SECRET` in browser code. Standard agent checkout should continue to accept a nonce produced by the client authorization flow.

The user has **not** chosen between these. Do not build both automatically and do not treat the assistant's suggested Sandbox approach as approval. Ask which direction they want before implementation. Also settle whether dashboard controls are four separate buttons or a scenario selector, and whether each run should create a fresh order (recommended) while duplicate submissions with the same idempotency key return the existing result.

### M5 behavior requirements

- Keep human, agent, and unknown origin semantics intact. Never mark a transaction `HUMAN` unless the human has confirmed it.
- Calculate totals from server-side product data; ignore client-supplied amounts. Use unique server-issued idempotency keys per deliberate run.
- Reuse the existing order/payment/inventory/case business logic rather than writing a parallel “demo-only” state machine.
- Human success: completed payment, committed inventory, correct HUMAN origin, and no failure case unless existing rules require one.
- Human failure: failed payment, case/evidence as current human flow dictates, and inventory behavior respects the existing protection toggle.
- Agent success: completed payment, committed inventory, AGENT origin, and no failure case.
- Agent failure: failed payment, release reserved inventory per M2 agent-failure behavior, create human-review case, and provide alternate-payment guidance; never send a customer message automatically.
- Clearly label whether a run is `SIMULATED` or `BRAINTREE SANDBOX`; never claim a real charge or customer notification.
- Dashboard simulation endpoints must require owner authorization. Do not make an owner-only simulation callable through an unprotected public route. Keep live connector authentication separate from dashboard UI.
- In the Sandbox direction, verify the fixed cart total against available stock and current item quantity limits. The existing local agent test uses a `$28` success cart and a `$2,200` decline cart; inspect `app/dev/agent-checkout/AgentCheckoutClient.tsx` and server validation before reusing that pattern.

Relevant paths:

- `components/admin/Overview.tsx`, `components/admin/MerchantAnalytics.tsx`, `app/api/demo/merchant-analytics/route.ts` — analytics and admin view.
- `app/api/checkout/create/route.ts`, `app/api/checkout/capture/route.ts` — human/storefront checkout APIs.
- `app/api/connector/checkout/route.ts` — real authenticated agent checkout; requires database, Braintree Sandbox credentials, idempotency key, items, and payment nonce.
- `app/api/dev/agent-checkout/route.ts` and `app/dev/agent-checkout/AgentCheckoutClient.tsx` — development-only agent test surface; do not expose as production dashboard logic.
- `lib/payment-provider.ts`, `lib/braintree.ts`, `lib/demo-store.ts`, `lib/database-demo-store.ts` — common provider and ledger implementation.
- `app/admin/admin.css` — current admin visual system. Preserve the existing palette.

## Deployment and verification status

- The existing Vercel project hosts M2, M3, and M4. The user confirmed M3 and M4 are live there; do not repeat deployment setup or create another project.
- Verify Vercel Production environment variables and that it points to the intended Neon database. If using Vercel Preview with writes, use a separate Neon branch to avoid modifying production data during testing.
- The current `npm run build` generates Prisma Client before `next build`; Vercel's install/build also generates it through `postinstall`/build script.
- The user ran the merchant migration against their Neon database and confirmed M3/M4 are hosted. If diagnosing a production data/schema issue, verify the migration against the exact Vercel Production `DATABASE_URL`; Preview and Production may point to different Neon branches.
- Local functional behavior has been confirmed by the user. The current hosted status is user-confirmed; recheck the deployment and Git state if asked to diagnose or change production.
- Existing paid checkout verification is separate from M5 simulations. Successful agent checkout against the deployed endpoint remains deferred.

## Completion rule

Keep checkboxes grounded in implementation and user-confirmed verification. Mark only completed work. Preserve unresolved decisions as open and stop for the user's direction after completing M5.
