# PayProof Masterplan and Agent Handoff (M1–M8)

This is the canonical project handoff and milestone file. Read it before resuming work. It records decisions made in chat, current implementation status, relevant code paths, and what remains open. Update this file when the user approves a decision or a milestone changes state.

## Resume instructions

- M1–M8 are implemented locally; M1–M4 are hosted on the existing Vercel project. M6 includes a judge-demo email/chatbox handoff but no connected delivery provider. M7 adds merchant case health and an auditable agent action log. M8 refines the admin dashboard hierarchy and removes misleading/redundant views.
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
- M5 merchant analytics and four Braintree Sandbox transaction simulations are implemented and locally verified.
- M6 incident detection, owner actions, dashboard UI, and judge-demo notification handoff are implemented locally; see the verification notes below.
- M7 merchant case health, per-merchant case breakdown, case-threshold incident, recent-order attribution, failure-rate context, and agent action log are implemented locally; see the verification notes below.
- M8 admin dashboard cleanup, Network Overview/Demo Tools split, collapsed incident drafts, ledger-metric cleanup, and the restored Agent Actions activity rail are implemented locally; see the verification notes below.
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

## M5 — Merchant dashboard and transaction simulations — COMPLETE LOCALLY

### Merchant dashboard

- [x] Show merchant-level dashboard analytics using existing ledger data.
- [x] Group payment events, failures, released/stuck stock, recovered orders/revenue, and order counts by merchant.
- [x] Add deterministic failure classification, merchant health badges, case-derived AI Assist counts (no Groq call), product names and origin badges for recent orders, and remove the Inventory Snapshot panel. Preserve payment-event polling while removing its redundant refresh label.
- [x] Explain event-count differences: a payment event for an order containing products from multiple merchants is attributed to each merchant row, while the global total counts unique ledger events. The view now shows merchant attributions, unique events, and overlap.
- [x] Verify the dashboard changes in the authenticated local browser.

### Transaction simulations

- [x] Use actual Braintree Sandbox transactions, as specified by the user. Current official test values were checked before implementation: `fake-valid-nonce` for successes and `fake-processor-declined-visa-nonce` for failures. The fixed product carts are server-selected and totals come from existing catalog/order logic.
- [x] Add owner-authenticated `GET` and `POST /api/demo/simulations`; each deliberate run gets a new server-generated idempotency key. No client-supplied amount, nonce, or cart is accepted.
- [x] Reuse existing order creation/capture/payment/inventory/case logic. Human failed simulations respect the protection toggle; agent failures release stock regardless of the toggle and create a case requiring human review. No win-back or customer message is sent.
- [x] Add the four requested scenarios (HUMAN/AGENT × success/failure) and the owner dashboard selector, result card, Sandbox label, and AG Grid Community simulation history.
- [x] Run all four scenario types against the local Braintree Sandbox and confirm their payment outcome, transaction ID, origin, case creation, and inventory behavior in the local dashboard and state. One additional human-failure run was used while correcting a background reservation-sweeper interaction; the test order was repaired to match the protection-off behavior.
- [x] Verify local dashboard rendering and simulation history.
- [ ] Automated typecheck/build remains blocked by existing TypeScript errors in the already-modified `components/BraintreePaymentForm.tsx` (`HostedFieldsInstance.getState` and `field` typed as `unknown`); no errors were reported in the files changed for this work.
- [ ] Runtime edge cases (reset behavior, empty/low stock, and forced provider/database errors) were inspected in the code paths but not separately exercised.

Relevant paths:

- `components/admin/Overview.tsx`, `components/admin/PaymentEvents.tsx`, `components/admin/MerchantAnalytics.tsx`, `components/admin/OrderManagement.tsx`, and `app/admin/admin.css` — dashboard.
- `components/admin/TransactionSimulations.tsx` — simulation controls, result, and AG Grid Community history.
- `app/api/demo/simulations/route.ts` — owner-authenticated simulation API and fresh run keys.
- `lib/demo-store.ts`, `lib/database-demo-store.ts` — shared checkout capture and inventory/case behavior; failed human simulation reservation policy is explicit and default checkout behavior remains intact.
- `package.json` — `ag-grid-react` and `ag-grid-community` dependencies.

## M6 — Active incidents — IMPLEMENTED LOCALLY

- [x] Add server-only detection from existing payment events, cases, and product-to-merchant ownership; no schema or table changes.
- [x] Detect 15-minute failure spikes and five-minute repeated failed orders from `CAPTURE_RESULT` events, plus open agent cases with `humanReviewRequired` and `agentHandled` flags.
- [x] Add owner-authenticated GET/POST `/api/admin/incidents` actions. Merchant notification drafts use Groq and are returned for owner review; no email is sent. Monitoring flags are logged; dismissals are session-local and do not write to the database.
- [x] Add the active-incidents UI inside the Overview snap section, with 15-second polling, merchant-specific cards, draft/mailto/copy affordances, flagging, and dismissal. The section renders nothing when no incidents remain visible.
- [x] Add a per-incident delivery selector for an email draft or chatbox copy. Email recipient defaults to `raox58@gmail.com` (provided by the user for the judge demo) and can be edited with email validation.
- [x] Mark notification drafts as judge-demo content in the subject and body, and show “DEMO FOR JUDGES · NOTHING IS SENT AUTOMATICALLY” in the panel. Email opens a prefilled `mailto:` draft; chatbox mode copies the demo text for manual paste. No email or chat provider is connected, and neither action sends a message automatically.
- [x] Local verification: five recent HUMAN failure simulations produced Northstar Goods failure-spike and carding incidents; an existing open Field & Form agent-failure case produced an agent-review incident. Groq returned a subject/body draft, flagging disabled the flag button, and dismissing cards hid them from the page.
- [ ] A completely quiet baseline could not be observed because the existing Neon ledger already contained an open AGENT case marked for human review. That existing case was not modified; failure-spike and carding incidents were absent before the new failure simulations. The empty UI was confirmed after dismissing all visible incidents.
- [x] Verify in the running local dashboard that the demo recipient defaults to `raox58@gmail.com`, the generated `mailto:` href encodes the recipient/subject/body, Email draft and Chatbox copy switch the relevant controls, the chatbox handoff explains that no chat service is connected, and the copy action reaches its “Copied” state. Opening an external mail client and reading back the system clipboard were not independently verified in this browser session.
- [ ] `npm run typecheck` still reports the four existing errors in `components/BraintreePaymentForm.tsx`; the incident files introduced no reported type errors.

Relevant paths:

- `lib/incident-detector.ts` — server-only incident queries and deterministic classification.
- `lib/incident-notifications.ts` — Groq merchant-email draft generation.
- `app/api/admin/incidents/route.ts` — owner-authenticated incident API and actions.
- `components/admin/Incidents.tsx`, `components/admin/Overview.tsx`, `app/admin/admin.css` — polling UI, card actions, and styling.

## M7 — Merchant case health and agent action audit — COMPLETE LOCALLY

- [x] Replace the Order Safety card in the payment-events section with a dark Merchant Health Summary. It shows each merchant's open case count, failure rate from the existing merchant analytics, the established Low data / Critical / Watch / Healthy thresholds, and a case-board link with that merchant preselected. No protection state or stock counts are shown in this panel.
- [x] Replace AI Assist's global case counters with Northstar Goods and Field & Form case breakdowns. Each merchant name links to its prefiltered case board; each row shows open cases, human failure cases needing action, and the `X need action` line. The existing Review open cases link remains.
- [x] Add `CASE_THRESHOLD_EXCEEDED` at five or more open cases per merchant. It reports count and oldest case age, uses only Notify Merchant and Dismiss, and the Groq draft explicitly states the open-case count and age and recommends signing into the case desk. Local data produced a Northstar incident at 8 open cases, with the oldest case 285.9 hours old; the draft rendered in the dashboard.
- [x] Update recent orders to show product name, merchant and origin checkout type, and a muted transaction ID below it.
- [x] Show the reset-context note below failure classification only when the failure proportion exceeds 60%. Verified at 83% in the local dashboard.
- [x] Add the read-only Agent Actions panel below Incidents and above Store overview. It polls every 15 seconds, shows the requested empty state, and renders the three allowed types with green/blue/amber borders.
- [x] Add the `AgentActionLog` Prisma model/table and owner-authenticated GET `/api/admin/agent-actions`. Agent failure logging is written inside the same database transaction as the case and reservation changes, with merchant and product facts taken from the order.
- [x] Run one AGENT_FAILURE simulation in the local Braintree Sandbox. It completed as FAILED, transaction ID `gqd29b2k`, created case `CASE-C40C7BFC`, and showed all three actions: reservation released for Field notes journal, case escalated, and win-back suppressed.
- [x] Verify the merchant preselection link in the case board (Field & Form selected, four matching cases), the Merchant Health values, case-breakdown links, order attribution, failure context note, threshold incident and draft, and all three action rows in the running local dashboard.
- [x] `AgentActionLog` migration was applied successfully and its records were read through the owner API after the simulation. `prisma migrate dev --name add_agent_action_log` itself is blocked by an earlier shadow replay failure in the already-applied merchant migration (`order_items` seed references a product absent from the shadow DB). To avoid changing an applied migration/checksum, the additive M7 migration was applied with `prisma migrate deploy` instead.
- [ ] `npm run typecheck` still reports the four existing Hosted Fields errors in `components/BraintreePaymentForm.tsx` (`getState` missing and `field` typed as unknown); it reported no errors in the M7 files.

Known M7 data limitation: the current recovery-link endpoint generates a link on request but does not persist that a link was sent. `Cases needing action` therefore counts open HUMAN payment-failure cases; PayProof does not send recovery links automatically. Persisting link-sent state would be a separate data-model change.

Relevant paths:

- `components/admin/MerchantHealthSummary.tsx`, `components/admin/MerchantCaseBreakdown.tsx`, `components/admin/AgentActions.tsx` — the three new dashboard views.
- `app/api/demo/merchant-analytics/route.ts`, `app/owner/cases/CasesListClient.tsx` — per-merchant case data and query-string preselection.
- `lib/incident-detector.ts`, `lib/incident-notifications.ts`, `components/admin/Incidents.tsx`, `app/api/admin/incidents/route.ts` — threshold detection, draft handling, and available incident actions.
- `lib/agent-action-log.ts`, `app/api/admin/agent-actions/route.ts`, `prisma/schema.prisma`, `prisma/migrations/20261107120000_agent_action_log/migration.sql` — durable action log model, migration, and API.
- `lib/database-demo-store.ts` — transaction-bound agent action logging for failed agent orders.
- `components/admin/PaymentEvents.tsx`, `components/admin/OrderManagement.tsx`, `components/admin/Overview.tsx`, `app/admin/admin.css`, and `app/admin/page.tsx` — panel replacements, presentation, and positioning.

## M8 — Admin dashboard hierarchy and demo/operations split — COMPLETE LOCALLY

- [x] Remove the Latest activity panel from the admin dashboard and remove `LiveDataStream` from `app/admin/page.tsx`. Repository search confirmed it was only used by the removed activity surface; the component source file remains unused and available, with no other runtime consumer.
- [x] Remove the Store overview hero/date and payment events, failed payments, stock protected, still reserved, and recovered sales counter row.
- [x] Restructure the dashboard into **Network Overview** followed by **Demo Tools**, separated by a horizontal divider while retaining the existing dashboard palette, cards, and typography. Network Overview order is Incidents, Merchant Health Summary, Payment events, Case activity by merchant, and Recent orders. Agent Actions occupies the restored right activity rail. Demo Tools contains transaction simulations/history, the reset control (with the existing refresh icon/button styling), and **Demo ledger metrics**.
- [x] Move Reset demo from the top navigation into Demo Tools; the reset API/handler remains unchanged. Sign-out remains in the top navigation.
- [x] Collapse generated incident drafts by default to a single “Draft ready — [subject]” disclosure line. Expand/collapse reveals or hides the existing subject/body, delivery selector, mailto, and copy controls. Local browser verification generated a draft, confirmed the collapsed subject line, expanded it to inspect the content, and confirmed the toggle state.
- [x] Remove “Stock released” and “Still reserved” from the demo ledger table. Remaining columns are Merchant, Events, Failed, Recovered sales, and Health. The footnote now explains event-attribution overlap only.
- [x] Change the Payment events subtitle to “Recent checkout outcomes across connected merchants.”
- [x] Verify in the authenticated local dashboard that the removed activity/counter sections are absent; Network Overview and Demo Tools appear in the requested order; the reset and simulation controls plus five-column table are under Demo Tools; the six requested operational panels are under Network Overview; the email draft collapses and expands; and the new subtitle and table columns are visible.
- [ ] `npm run typecheck` remains blocked by the same four existing `components/BraintreePaymentForm.tsx` errors (`HostedFieldsInstance.getState` and `field` typed as `unknown`); no M8 files were reported in the errors. `git diff --check` passes.
- [x] No database schema/migration or payment/case/agent-action behavior changed in M8. Existing palette and M1–M7 behavior were preserved; the demo reset handler and 15-second polling remain in place.
- [x] Follow-up visual correction: restored the prior `.pp-hero` / `.pp-title` section-heading treatment and original two-column case-activity/recent-orders layout where the existing responsive breakpoint allows it. Removed the new tinted Demo Tools background and custom heading treatment; the Demo Tools divider and content labels remain. The moved reset control uses the original button styling and icon.
- [x] Restore the right-side activity rail using the existing Agent Actions data, 15-second polling, and empty state. The rail title is “Agent Actions” with the subheading “Automatic responses taken by PayProof”; payment events are not placed in the rail. At the existing responsive breakpoint (1120px and below), the rail stacks beneath the main content, matching the prior activity-rail behavior. Verified at a 1280px desktop viewport and restored the browser to its default viewport afterward.
- [x] Follow-up visual refinement: removed the empty viewport-height gap below Network Overview, set a deliberate 22px separation between Active Incidents and Merchant Health Summary, and restored the original near-black panel surfaces in place of the navy overrides. Agent Actions rail rows now use the existing activity-feed typography/layout with subdued action-color icons. Verified incident-to-health spacing, dark surfaces, and readable action rows in the local browser.

Relevant paths:

- `app/admin/page.tsx`, `app/admin/admin.css`, `components/admin/Overview.tsx`, and `components/admin/DashboardHeader.tsx` — section hierarchy, styling, Agent Actions rail, and reset-control placement.
- `components/admin/PaymentEvents.tsx`, `components/admin/OrderManagement.tsx`, `components/admin/MerchantAnalytics.tsx`, and `components/admin/Incidents.tsx` — operational copy/order, demo ledger fields, and collapsible email drafts.

## Next work

- M1–M8 are implemented locally; M1–M4 remain user-confirmed as hosted. M5–M8 are not deployed. Do not create another Vercel project.
- The next product area is the **merchant portal**. Its exact scope and access model are open for the user to define before implementation.
- Other open items: resolve the existing Braintree Hosted Fields typecheck errors; decide whether merchant contact and recovery-link sent state should become persisted data; and decide when to deploy M5–M8 to the existing Vercel project.
- Real incident notifications remain draft/copy only. A future direct email/chat delivery feature needs a chosen provider and authorized sender/account. The judge-demo recipient remains `raox58@gmail.com`, editable per incident and not a verified merchant contact record.

## Deployment and verification status

- The existing Vercel project hosts M2, M3, and M4. The user confirmed M3 and M4 are live there; do not repeat deployment setup or create another project.
- Verify Vercel Production environment variables and that it points to the intended Neon database. If using Vercel Preview with writes, use a separate Neon branch to avoid modifying production data during testing.
- The current `npm run build` generates Prisma Client before `next build`; Vercel's install/build also generates it through `postinstall`/build script.
- The user ran the merchant migration against their Neon database and confirmed M3/M4 are hosted. If diagnosing a production data/schema issue, verify the migration against the exact Vercel Production `DATABASE_URL`; Preview and Production may point to different Neon branches.
- Local functional behavior has been confirmed by the user. The current hosted status is user-confirmed; recheck the deployment and Git state if asked to diagnose or change production.
- Existing paid checkout verification is separate from M5 simulations. Successful agent checkout against the deployed endpoint remains deferred.

## Completion rule

Keep checkboxes grounded in implementation and user-confirmed verification. Mark only completed work. Preserve unresolved decisions as open and stop for the user's direction after completing M7.
