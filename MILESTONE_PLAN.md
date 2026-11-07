# PayProof Masterplan and Agent Handoff (M1–M12)

This is the canonical project handoff and milestone file. Read it before resuming work. It records decisions made in chat, current implementation status, relevant code paths, and what remains open. Update this file when the user approves a decision or a milestone changes state.

## Resume instructions

- M1–M9 are implemented locally; M1–M4 are hosted on the existing Vercel project. M5–M9 are not deployed. M6 includes a judge-demo email/chatbox handoff but no connected delivery provider. M7 adds merchant case health and an auditable agent action log. M8 refines the admin dashboard hierarchy and removes misleading/redundant views. M9 adds the merchant portal and isolated merchant authentication.
- M10–M12 (admin diagnostic simulation redesign, Groq post-simulation analysis, and dashboard diagnostic insight) are **planned** from the user-approved spec captured below. They were requested as "M9–M11" in chat; this plan renumbers them to **M10–M12** to preserve the existing completed M9 merchant portal milestone. Implement in order M10 → M11 → M12 unless the user directs otherwise.
- After each milestone, stop and wait for the user's direction before starting another milestone.
- Preserve the current color palette and existing merchant/case behavior unless the user asks to change it. M10–M12 are **admin-facing only** — no changes to storefront, customer portal, merchant portal, or case desk.
- The user already has local environment variables configured and uses an existing Neon cloud database. Do not ask for their secret values; never read or print `.env` values or commit local secrets.
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
- M9 merchant portal and isolated merchant authentication are implemented locally; see the verification notes below.
- **M10–M12 are planned (not started):** diagnostic simulation redesign, Groq post-simulation pattern analysis, and latest diagnostic insight on the main dashboard. Specs captured below as provided by the user.
- The current local Git branch may have changed since this checkpoint. Recheck `git status` before making a commit; deployed code may already be ahead of or differ from the current working tree.
- The existing Vercel project hosts M2, M3, and M4. Do not create a second Vercel project. If a deployment issue comes up, inspect the deployment's commit and environment before changing configuration.
- The user ran `npm run db:migrate` against their existing Neon database and reported that local M3 works. The migration `prisma/migrations/20261107100000_merchants/migration.sql` should be included in a Git commit. Before any future production database change, confirm the target database and migration status; do not rerun `migrate dev` against production just by habit. The existing shadow-DB replay issue (merchant migration referencing `order_items` seed data absent from shadow DB) means `prisma migrate dev` may fail on replay; follow the M7 pattern (`prisma migrate deploy` for additive migrations, or a reviewed alternative) without changing applied migration checksums.

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
- [x] **Deployment readiness (2026-11-07, current working tree):** `npm run typecheck` passes. `npm run build` (`prisma generate && next build`) passes after a clean `.next` rebuild, compiling the admin routes including M8 dashboard surfaces (transient `_not-found` collection invariant cleared by removing stale `.next`). No M8 schema migration required. Production deployment to the existing Vercel project still requires confirming Production env vars/target Neon DB and deploying from the intended commit; M5–M9 remain not deployed.
- [x] No database schema/migration or payment/case/agent-action behavior changed in M8. Existing palette and M1–M7 behavior were preserved; the demo reset handler and 15-second polling remain in place.
- [x] Follow-up visual correction: restored the prior `.pp-hero` / `.pp-title` section-heading treatment and original two-column case-activity/recent-orders layout where the existing responsive breakpoint allows it. Removed the new tinted Demo Tools background and custom heading treatment; the Demo Tools divider and content labels remain. The moved reset control uses the original button styling and icon.
- [x] Restore the right-side activity rail using the existing Agent Actions data, 15-second polling, and empty state. The rail title is “Agent Actions” with the subheading “Automatic responses taken by PayProof”; payment events are not placed in the rail. At the existing responsive breakpoint (1120px and below), the rail stacks beneath the main content, matching the prior activity-rail behavior. Verified at a 1280px desktop viewport and restored the browser to its default viewport afterward.
- [x] Follow-up visual refinement: removed the empty viewport-height gap below Network Overview, set a deliberate 22px separation between Active Incidents and Merchant Health Summary, and restored the original near-black panel surfaces in place of the navy overrides. Agent Actions rail rows now use the existing activity-feed typography/layout with subdued action-color icons. Verified incident-to-health spacing, dark surfaces, and readable action rows in the local browser.

### M8 follow-up — responsive admin review and PayProof activity (2026-11-07)

- [x] Preserve the M8 information architecture and existing palette while tightening the first screen: **Network Overview**, unique platform event count, active incidents, Merchant Health Summary, then supporting checkout analytics and case/order detail; **Demo Tools** remains separate below. The header now identifies **Platform Admin** and **Braintree Sandbox**. Signal coverage copy states that the dashboard reads payment events and case records only, with no traffic analysis or automatic blocking. The unique event count appears once in the overview; Payment events now links to order activity without repeating it.
- [x] Fix the underlying layout constraints that could clip changing content. Merchant Health Summary reused the former Order Safety `.pp-safety` card, which carried `overflow: hidden` and a fixed minimum height; the M7 `min-height: 0` override did not remove the hidden overflow. It now has natural height and visible overflow. Its desktop rows retain a readable table layout; narrow screens use labeled two-column merchant rows. Incident cards use two columns only when there is room, and the merchant case link sits beside the affected merchant. The 22px separation between incidents and merchant health remains. On 1280×720 and 1366×768 both merchant rows now fit in the opening view.
- [x] Remove nested/fixed activity-rail clipping: Agent Actions keeps its right-rail placement on desktop but has natural content height and uses the page scroll. At tablet/mobile breakpoints it flows below the main content. The AG Grid history is horizontally scrollable inside its own table viewport at narrow widths; the page itself does not widen to fit the table.
- [x] Make **Agent Actions** a PayProof activity stream by combining the owner-authenticated persisted action feed (`/api/admin/agent-actions`) with current signals from `/api/admin/incidents`, on the existing 15-second polling interval. Rows show the merchant, action/signal, concise evidence/rule, local timestamp, truthful state/source, and a merchant case or incident detail link. Persisted action times use their recorded timestamp. Incident times are explicitly shown as **Last checked** because the detector does not persist signal onset/history. Loading, partial refresh errors, and last successful refresh are shown; existing no-actions empty copy remains.
- [x] Keep raw recent-order rows secondary and collapsed under a disclosure, while transaction IDs remain searchable. Selecting an order search result opens the record disclosure and scrolls to the matching row. Payment events show their last successful update time; a failed refresh states that the prior data is being shown.
- [x] Correct copy that overstated capabilities: carding incidents and generated drafts use cautious “possible carding-like failure pattern” language and explicitly say the rule uses failed payment records, not traffic or card-identity evidence. The incident controls now say **Create message draft** and **Log for review**; a logged review note explains that it is a server-console record only and does not start active monitoring or block checkout. Merchant health uses **High failures** with the threshold available as a tooltip instead of an undefined **Critical** label. Sandbox/demo context remains visible.
- [x] Search verification: searching for transaction ID `gqd29b2k` returned the matching failed Field & Form agent checkout, opened the collapsed record section, and made the matching order row visible.
- [x] Visual/browser verification at 100% browser zoom (viewport checks): 1280×720, 1366×768, 1440×900, 1728×1117, 390×844, and 320×700. Also checked 1024×900 and 853×900 as viewport-width equivalents for 125% and 150% zoom on a 1280px display; browser zoom itself was not changed. At all tested widths `documentElement.scrollWidth` equaled the viewport width; Merchant Health rows fit their container; the simulation grid scrolls inside its wrapper on narrow screens. Screenshots were inspected at the requested desktop sizes and narrow mobile size.
- [x] `git diff --check` passes. Final `npm run typecheck` reports only the same pre-existing errors in `components/BraintreePaymentForm.tsx`: `HostedFieldsInstance.getState` missing at line 105 and `field` typed as `unknown` at lines 113, 115, and 117. `npm run build` compiled the application, then stopped on that existing type error at line 105. No type errors were reported in the M8 follow-up files. No dedicated test script is defined in `package.json`.
- [x] No database schema/migration, payment/case flow, credentials, or deployment configuration was changed. M8 remains **implemented locally**; M5–M8 are not deployed. The existing dev server on port 3000 was restarted after the production build replaced the shared `.next` artifacts; the final browser checks ran against the restored local server.

Files changed in this follow-up:

- `app/admin/page.tsx`, `app/admin/admin.css`
- `components/admin/AgentActions.tsx`, `DashboardHeader.tsx`, `Incidents.tsx`, `MerchantAnalytics.tsx`, `MerchantHealthSummary.tsx`, `OrderManagement.tsx`, `Overview.tsx`, `PaymentEvents.tsx`, `TransactionSimulations.tsx`
- `lib/incident-detector.ts`, `lib/incident-notifications.ts`
- `MILESTONE_PLAN.md`

Relevant paths:

- `app/admin/page.tsx`, `app/admin/admin.css`, `components/admin/Overview.tsx`, and `components/admin/DashboardHeader.tsx` — section hierarchy, styling, Agent Actions rail, and reset-control placement.
- `components/admin/PaymentEvents.tsx`, `components/admin/OrderManagement.tsx`, `components/admin/MerchantAnalytics.tsx`, and `components/admin/Incidents.tsx` — operational copy/order, demo ledger fields, and collapsible email drafts.

### M8 follow-up — admin alignment, contrast fix, and dedicated order activity (2026-11-07)

- [x] **Centered and aligned admin dashboard (Part 1)**:
  - Root causes identified and resolved:
    1. `.pp-workspace` had `max-width: 1920px` stretching unconstrained within `.pp-app`, causing the main dashboard to hug the right sidebar unevenly on wide Mac displays (1440px, 1728px).
    2. Specificity bug: `.pp-panel { background: #ffffff; }` declared after `.pp-merchant-health` in `app/admin/admin.css` stripped the dark background and caused white text on a white background, cutting off Merchant Health Summary.
    3. Asymmetric grid: `.pp-secondary-grid` used `minmax(0, 1.05fr) minmax(280px, 0.95fr)`, creating mismatched card widths.
  - Layout fixes:
    - Constrained `.pp-workspace` to `max-width: 1420px; margin: 0 auto; width: 100%; padding: 0 clamp(16px, 2.2vw, 32px); gap: 28px; grid-template-columns: minmax(0, 1fr) 340px;` centered within the available region to the right of the 72px left rail.
    - Updated `.pp-panel.pp-merchant-health` with `background: var(--pp-dark-bg) !important; color: #ffffff !important;` to restore crisp contrast and complete visibility.
    - Standardized `.pp-feed` (Agent Actions) into a matching rounded card (`border: 1px solid var(--pp-line); border-radius: 14px; background: #ffffff;`) with sticky positioning (`top: 84px; max-height: calc(100dvh - 104px); overflow-y: auto;`).
    - At screens `<= 1060px`, `.pp-feed` cleanly reflows beneath `.pp-content` into a single column, preventing any squeezing or horizontal clipping.
    - Symmetrized `.pp-secondary-grid` to `repeat(2, minmax(0, 1fr)); gap: 20px;`.
    - Made `.pp-incidents-list` responsive: `repeat(auto-fit, minmax(300px, 1fr))`.

- [x] **Dedicated order activity view (Part 2)**:
  - Updated `components/admin/PaymentEvents.tsx`: changed `<a href="#orders">` to `<Link href="/admin/activity">View order activity <Icon name="arrow"/></Link>`.
  - Created dedicated route `/admin/activity` with server session authentication (`app/admin/activity/page.tsx` redirecting unauthenticated requests to `/login?next=%2Fadmin%2Factivity`).
  - Created `/api/admin/activity` with `getOrderActivityList()` supporting both in-memory ledger and Neon PostgreSQL database.
  - Implemented `OrderActivityClient.tsx` and `activity.css`:
    - Clearly labeled environment: `Braintree Sandbox (Simulated)`.
    - Metric overview stats: Total orders, Successful (Paid), Failed, and Pending.
    - Filters & Search: text search (Order ID, transaction ID, product name, issue), Merchant filter (All, Northstar Goods, Field & Form), Outcome filter (All, Paid, Failed, Pending), Origin filter (All, Human, Agent, Unknown), and Sort order (Newest, Oldest, Amount).
    - Table columns: Timestamp, Merchant, Order & Transaction ID (truncated with interactive 1-click clipboard copy), Product/Order summary, Origin badge, Outcome/status tag with failure issue notes, Amount, and Case status link (`/owner/cases?caseId=...`).
    - Pagination, loading states with animated dots, and empty search results with reset filter controls.
    - Back navigation to `/admin` ("← Back to Dashboard").

- [x] **Build & Typecheck Verification**:
  - `npm run typecheck`: Passed with 0 errors.
  - `npm run build`: Compiled all 26 routes (including `/admin/activity` and `/api/admin/activity`) with exit code 0.

Files changed in this follow-up:
- `app/admin/admin.css`
- `components/admin/PaymentEvents.tsx`
- `lib/demo-store.ts`
- `lib/database-demo-store.ts`
- `app/api/admin/activity/route.ts`
- `app/admin/activity/page.tsx`
- `app/admin/activity/OrderActivityClient.tsx`
- `app/admin/activity/activity.css`
- `MILESTONE_PLAN.md`

## M9 — Merchant portal and isolated merchant authentication — COMPLETE LOCALLY

- [x] **Database Schema & Migrations (Step 1)**:
  - Added `email` (`String? @unique`) and `passwordHash` (`String? @map("password_hash")`) fields to the `Merchant` model in `prisma/schema.prisma`.
  - Created migration `prisma/migrations/20261107140000_merchant_auth/migration.sql` and applied it to the Neon database via `npx prisma migrate deploy`.
  - Implemented `hashPassword()` in `lib/auth.ts` using `scrypt_v1` with 16-byte random salts and 64-byte derived keys (128-hex chars), matching owner auth.
  - Seeded demo merchant credentials dynamically via `scripts/seed-merchant-auth.ts` and automated runtime check in `lib/database-demo-store.ts`:
    - Northstar Goods: `northstar@payproof.demo` (hashed `northstar123`, merchantId: `northstar`)
    - Field & Form: `fieldform@payproof.demo` (hashed `fieldform123`, merchantId: `fieldform`)
    - Zero plaintext passwords stored in database or codebase.

- [x] **Merchant Authentication & Sessions (Step 2)**:
  - Created `app/merchant/login/page.tsx` styled with the matching dark palette, typography, and form structure from `app/login/page.tsx`.
  - Created `app/api/merchant/auth/route.ts` with:
    - `POST`: looks up merchant by email, verifies password using timing-safe comparison (`verifyPassword`), issues signed HMAC cookie (`payproof_merchant_session`), returns `{ merchantId, merchantName }`.
    - `DELETE`: signs out and clears `payproof_merchant_session` cookie.
    - `GET`: returns authenticated merchant identity.
  - Separate cookie name (`payproof_merchant_session`) ensures zero conflict with owner session (`payproof_owner_session`); both sessions can coexist simultaneously.
  - Added middleware protection in `middleware.ts`: protects `/merchant/*` and `/api/merchant/*` routes, redirecting unauthenticated requests to `/merchant/login` while preserving existing `/admin` and `/owner/*` rules.

- [x] **Merchant Portal Pages & Data Isolation (Step 3)**:
  - Created `app/merchant/page.tsx`, `app/merchant/layout.tsx`, and `app/merchant/merchant.css`.
  - Created `GET /api/merchant/dashboard` returning strictly scoped data for the authenticated merchant:
    1. **Merchant Header**: displays merchant name, merchant ID badge, sign-out button, and "Powered by PayProof Network" subtitle.
    2. **Payment Summary**: Total orders, failed checkouts, and failure rate scoped strictly to the merchant's catalog products.
    3. **Open Cases**: list of the merchant's open cases with product name, origin badge (Human/Agent), amount, date, and link opening the existing modal at `/owner/cases?caseId=...&merchantId=...`. Includes "X cases need action" callout when human payment failures without recovery links exist.
    4. **Incident Alerts**: active incident alerts detected for this merchant with "Your platform administrator has been notified" indicator (read-only; no dismiss or notify action for merchants).
  - Cross-merchant access is strictly prevented: Northstar Goods cannot view Field & Form orders, cases, or incidents, and vice versa.

- [x] **Merchant Email Notifications (Step 4)**:
  - Updated `lib/incident-notifications.ts` and `components/admin/Incidents.tsx`:
    - Looks up merchant email from the database by `merchantId`.
    - Removed hardcoded `raox58@gmail.com` default.
    - Pre-fills `northstar@payproof.demo` or `fieldform@payproof.demo` as the default `mailto:` recipient while keeping the input editable for demo overrides.

- [x] **Demo Notice (Step 5)**:
  - Added footer notice on `/merchant`:
    `“This is a PayProof Network demo merchant account. Data is fictional. Merchant email: [merchant email from database]”`

- [x] **Verification**:
  - `scripts/verify-merchant.ts`: Verified database scrypt_v1 hashes, timing-safe authentication, HMAC token verification, and data isolation (Northstar: 26 orders, 9 cases; Field & Form: 12 orders, 4 cases).
  - `npm run typecheck`: Passed with 0 errors.
  - `npm run build`: Compiled all routes with exit code 0 (`prisma generate && next build`).
  - **Deployment readiness (2026-11-07, current working tree):** Fixed a schema-mismatch TypeScript error in `scripts/seed-merchant-auth.ts` (added required `Case.uncertainty`, switched to `paymentEvents` relation with valid `PaymentEvent` fields) so `tsc --noEmit`/build are clean. `prisma validate` passes. Migration `prisma/migrations/20261107140000_merchant_auth/migration.sql` is present for M9 auth fields. `npm run typecheck` and `npm run build` pass (clean `.next`). **Before production deploy on the existing Vercel project:** apply reviewed migrations to the target Neon DB (at minimum `20261107140000_merchant_auth` if not already applied there), confirm Vercel Production env vars (`DATABASE_URL`, session secrets, Braintree/Groq/owner config as used) point to the intended environment, and do not create a second Vercel project. M5–M9 remain not deployed until the user deploys.

Files changed in M9:
- `prisma/schema.prisma`
- `prisma/migrations/20261107140000_merchant_auth/migration.sql`
- `lib/auth.ts`
- `lib/auth-constants.ts`
- `middleware.ts`
- `lib/database-demo-store.ts`
- `lib/incident-notifications.ts`
- `components/admin/Incidents.tsx`
- `app/api/owner/cases/route.ts`
- `app/owner/cases/page.tsx`
- `app/api/merchant/auth/route.ts`
- `app/api/merchant/dashboard/route.ts`
- `app/merchant/layout.tsx`
- `app/merchant/page.tsx`
- `app/merchant/login/page.tsx`
- `app/merchant/merchant.css`
- `scripts/seed-merchant-auth.ts`
- `scripts/verify-merchant.ts`
- `MILESTONE_PLAN.md`

## M10 — Simulation panel redesign — PLANNED (user spec; requested as M9)

> Renumbered to M10 to preserve completed M9 (merchant portal). Admin-facing only — no changes to storefront, customer portal, merchant portal, or case desk. Preserve all existing behavior, color palette, and M1–M9 work.

Replace the current scenario dropdown and Run button in `components/admin/TransactionSimulations.tsx` with a configuration form. UI and simulation API only for this milestone — no new endpoints beyond updating the simulation route, no Groq, no analysis. Just make the simulation configurable and purposeful.

### Configuration inputs to add

- **Failure count** — number input, min 1 max 20, default 3. Label: “Number of failures.”
- **Failure type** — single select:
  - `Processor decline` — uses `fake-processor-declined-visa-nonce`
  - `Instrument expired` — uses `fake-processor-declined-visa-nonce`, records `instrument_expired` in ledger note
  - `Duplicate invoice` — triggers duplicate idempotency key behavior
  - `Network timeout` — uses `fake-processor-declined-visa-nonce`, records `network_timeout` in ledger note
- **Merchant** — single select: Northstar Goods (`northstar`), Field & Form (`fieldform`)
- **Origin** — single select: Human, Agent, Mixed (alternates human and agent across the sequence)
- **Time compression** — single select:
  - `Compressed` — all fire immediately back to back
  - `Spread` — 2 second delay between each transaction

Replace “Run simulation” button label with **“Run diagnostic.”** Keep the same POST call to `/api/demo/simulations` (current route: `app/api/demo/simulations/route.ts`) but update the endpoint to accept the new configuration parameters instead of a single scenario string.

### Update `app/api/demo/simulations/route.ts`

Accept new POST body:

```json
{
  "failureCount": 5,
  "failureType": "processor_decline | instrument_expired | duplicate_invoice | network_timeout",
  "merchantId": "northstar | fieldform",
  "origin": "HUMAN | AGENT | MIXED",
  "timeCompression": "compressed | spread"
}
```

For each failure in the sequence:

- Determine origin for this iteration — `MIXED` alternates `HUMAN` and `AGENT`
- Select product by merchant — Northstar uses **Daybreak mug** (`mug`) at $28, Field & Form uses **Field notes journal** (`journal`) at $18 (confirm IDs/prices against `lib/products.ts` / catalog; preserve existing catalog totals)
- Call existing `createDemoOrder` and `captureDemoOrder` — do not rewrite business logic
- Use `fake-processor-declined-visa-nonce` for all failure types — record the failure type label in the ledger note field
- If `timeCompression` is `spread` await 2000ms between iterations
- Generate a fresh idempotency key per transaction

Return full sequence result including all transaction IDs, case IDs, and a `simulationId` UUID generated at the start of the run.

Require owner auth. Remove the old four hardcoded scenario handlers — replace entirely with the configurable handler.

**Implementation notes (from codebase analysis):** The current GET history reads from `listDatabaseDashboardSimulations()` in `lib/database-demo-store.ts`, which filters orders by `idempotencyKey` prefix `SIMDASH-` and derives scenario from key parts. M10 will need a compatible key scheme and/or updated history mapping so diagnostic runs (and their failure type / `simulationId`) remain visible. Keep AG Grid community edition setup; no new dependencies.

### Update AG Grid history table

Add one new column: **“Failure type”** — shows the configured failure type for each run. Keep all existing columns. Rename “Simulation history N runs” header context to **“Diagnostic history.”**

### Verify M10 before stopping

- [ ] Configuration form renders with all five inputs and correct options
- [ ] Failure count of 5 fires exactly 5 Braintree transactions
- [ ] Northstar Goods selection uses Daybreak mug at $28 for all transactions in the sequence
- [ ] Field & Form selection uses Field notes journal at $18 for all transactions in the sequence
- [ ] `MIXED` origin alternates `HUMAN` and `AGENT` correctly across the sequence
- [ ] Spread compression adds visible delay between transactions — check timestamps in AG Grid
- [ ] AG Grid Diagnostic history shows one row per transaction with the new Failure type column
- [ ] Incidents panel fires correctly after a sequence — `CARDING_PATTERN` should appear after 5 rapid failures for the same merchant
- [ ] Agent Actions log populates correctly for `AGENT` origin transactions in the sequence
- [ ] Old four-scenario dropdown is completely gone
- [ ] `MILESTONE_PLAN.md` updated with M10 marked complete before stopping

---

## M11 — Post-simulation Groq pattern analysis — PLANNED (user spec; requested as M10)

> Admin-facing only. Preserve all existing behavior, color palette, and M1–M10 work.

Add a Groq analysis step that runs automatically after every diagnostic simulation completes. Groq reads the actual ledger records created during the simulation and produces a specific diagnosis. Groq must read real data and produce a non-templated output.

### New endpoint: `app/api/admin/simulate/analyze/route.ts`

POST — owner auth required.

Accepts:

```json
{
  "simulationId": "string",
  "merchantId": "string",
  "failureCount": 0,
  "failureType": "string",
  "origin": "string",
  "transactionIds": ["string"],
  "caseIds": ["string"]
}
```

The endpoint does the following in order:

1. Reads actual payment event records from the database using the provided `transactionIds` — do not use the simulation config as a substitute for real data
2. Reads case records using the provided `caseIds`
3. Reads `AgentActionLog` entries created during this simulation window
4. Builds a structured context object:

```json
{
  "merchantName": "string",
  "failureCount": 0,
  "failureType": "string",
  "originBreakdown": { "human": 0, "agent": 0, "unknown": 0 },
  "timestampRange": { "start": "string", "end": "string" },
  "processorResponseCodes": ["string"],
  "avsResults": ["string"],
  "cvvResults": ["string"],
  "caseTypesCreated": ["string"],
  "agentActionsTaken": ["string"]
}
```

5. Calls Groq with this context using the following system prompt — **do not change the prompt structure**:

```text
You are PayProof's diagnostic engine. You have received real payment event records from a merchant's checkout system. Analyze the pattern and produce a specific actionable diagnosis.

Rules:
- Base every claim on the actual records provided — do not generalize
- Identify the specific signal combination that characterizes this pattern
- Produce a testable hypothesis the merchant can act on
- Never say "it appears" or "it seems" — be direct
- If the pattern is consistent with a carding attack say so explicitly with the evidence
- If the pattern suggests a checkout configuration issue identify which configuration
- If the pattern is consistent with normal agent commerce failure say so
- If confidence is low say so and explain why

Return JSON only with no markdown fences:
{
  "pattern_detected": "one line describing the exact pattern seen in the records",
  "likely_cause": "specific cause based on the signal combination in the records",
  "evidence": ["specific evidence item from the records", "specific evidence item from the records"],
  "hypothesis": "specific testable statement the merchant can verify against their own system",
  "recommended_action": "one specific thing the merchant or admin should do next",
  "confidence": "high | medium | low",
  "confidence_reason": "why this confidence level given the available records"
}
```

6. Parses the JSON response — handle parse errors gracefully, return a fallback if Groq is unreachable
7. Returns the structured diagnosis

**Implementation notes:** Reuse existing Groq patterns/config (`GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FALLBACK_MODEL`) consistent with `lib/incident-notifications.ts` / `lib/case-assistant.ts`, but keep this diagnostic prompt/contract isolated for the simulation analysis path.

### Wire analysis into simulation flow in `components/admin/TransactionSimulations.tsx`

After the simulation POST returns successfully:

- Immediately call `POST /api/admin/simulate/analyze` with the returned `simulationId`, `transactionIds`, and `caseIds`
- While analysis is in flight show a loading indicator below the AG Grid — `Analyzing pattern across [N] transactions...`
- When analysis returns render a diagnosis card below the AG Grid

### Diagnosis card layout

- Header: `Diagnostic result — [merchant name] — [timestamp]`
- Pattern detected in large text
- Likely cause in regular text
- Evidence as a bulleted list — each bullet is one item from the `evidence` array
- Hypothesis in a visually distinct highlighted box — use a subtle left border in the existing accent color
- Recommended action as a clear labeled section
- Confidence badge — green for high, amber for medium, red for low
- Confidence reason in small muted text below the badge
- “Save to dashboard” button — placeholder for M12; M12 removes it and saves automatically

The diagnosis card replaces any previous diagnosis card — only the most recent run’s diagnosis is shown in the simulation panel. Previous diagnoses are accessible via the AG Grid row expansion.

### AG Grid update

Add **“Diagnosis”** column to the existing grid. Shows `Pending` until analysis completes, then shows the one-line `pattern_detected` summary. Clicking a row expands it inline to show the full diagnosis card for that run. Use AG Grid’s master-detail or row expansion feature — do not open a modal.

### Verify M11 before stopping

- [ ] After a simulation run completes the analyze endpoint is called automatically
- [ ] Loading indicator appears while Groq is processing
- [ ] Diagnosis card renders with all seven fields — pattern detected, likely cause, evidence bullets, hypothesis box, recommended action, confidence badge, confidence reason
- [ ] Run processor decline x5 for Northstar Goods — verify diagnosis references processor decline specifically, not a generic message
- [ ] Run agent failure x3 for Field & Form — verify diagnosis references agent origin and differs from the processor decline diagnosis
- [ ] Run mixed origin x4 — verify diagnosis acknowledges the mixed origin breakdown
- [ ] AG Grid Diagnosis column shows one-line summary after analysis completes
- [ ] Clicking a completed AG Grid row expands the full diagnosis inline
- [ ] Groq fallback renders gracefully when model is unreachable — no unhandled errors
- [ ] Two different configurations produce meaningfully different diagnoses — confirm explicitly by running two back to back and comparing
- [ ] `MILESTONE_PLAN.md` updated with M11 marked complete before stopping

---

## M12 — Latest diagnostic insight on main dashboard — PLANNED (user spec; requested as M11)

> Admin-facing only. Preserve all existing behavior, color palette, and M1–M11 work.

Persist diagnoses to the database and surface the most recent one on the main admin dashboard in the Network Overview section.

### Database change

Add `SimulationDiagnosis` model to `prisma/schema.prisma`:

```prisma
model SimulationDiagnosis {
  id                String   @id @default(cuid())
  simulationId      String   @unique
  merchantId        String
  patternDetected   String
  likelyCause       String
  evidence          Json
  hypothesis        String
  recommendedAction String
  confidence        String
  confidenceReason  String
  createdAt         DateTime @default(now())
}
```

Run `prisma migrate dev` for this table (respecting the existing migration/shadow-DB caveat documented in the checkpoint — prefer a reviewed additive migration path if `migrate dev` replay fails; do not change applied migration checksums).

### Update `app/api/admin/simulate/analyze/route.ts`

After Groq returns the diagnosis, write it to the `SimulationDiagnosis` table using the `simulationId` as the unique key. If a diagnosis for this `simulationId` already exists update it. Use upsert. Remove the M11 placeholder “Save to dashboard” button behavior — **always save every diagnosis automatically on completion**. Remove the “Save to dashboard” button entirely.

### New endpoint: `app/api/admin/simulate/latest-diagnosis/route.ts`

GET — owner auth required. Returns the most recent `SimulationDiagnosis` record ordered by `createdAt` descending. Returns `null` if no diagnosis exists yet.

### New component: `components/admin/LatestDiagnosis.tsx`

Renders the latest diagnostic insight panel. Polls every 15 seconds using the same pattern as the rest of the dashboard.

Panel layout:

- Section heading: `Latest diagnostic insight` with a timestamp showing when it was generated
- Merchant name as a subheading
- Pattern detected in large text — this is the most prominent element
- Likely cause in regular text
- Hypothesis in the same highlighted box style used in M11
- Recommended action as a labeled section
- Confidence badge
- “Run new diagnostic” link — scrolls to the Demo Tools section simulation panel using a page anchor
- “View full analysis” link — scrolls to the Demo Tools section and expands the matching AG Grid row

Empty state:

> `No diagnostic run yet. Configure a failure pattern in Demo Tools below to generate your first insight.`

Do not show a skeleton or placeholder card — render nothing until a diagnosis exists, then render the panel (and handle the explicit empty-state copy as specified in the component behavior; reconcile with existing dashboard patterns during implementation).

### Place panel in `app/admin/page.tsx`

Insert `LatestDiagnosis` between the **Agent Actions** panel and the **Merchant Health Summary** in the Network Overview section (verify current M8 layout before editing — Agent Actions is currently the right rail; place the diagnostic insight as a natural part of the intelligence feed in the main content flow, not a demo tool and not labeled as simulation output. Label it simply `Latest diagnostic insight`).

### Verify M12 before stopping

- [ ] `SimulationDiagnosis` table exists in the database after migration
- [ ] After a simulation and analysis completes the diagnosis is written to the database automatically
- [ ] Latest diagnostic insight panel appears in Network Overview between Agent Actions context and Merchant Health Summary (per final layout decision)
- [ ] Panel shows the most recent diagnosis with all fields
- [ ] Empty state renders correctly before any simulation has been run — reset demo and verify
- [ ] Running a new simulation updates the panel on the next 15-second poll cycle
- [ ] “Run new diagnostic” link scrolls to the Demo Tools simulation panel
- [ ] “View full analysis” link scrolls to Demo Tools and the correct AG Grid row is visible
- [ ] Panel does not appear on the merchant portal or case desk — admin only
- [ ] Two diagnoses in the database — panel shows the most recent one correctly
- [ ] `MILESTONE_PLAN.md` updated with M12 marked complete and M10–M12 summarized before stopping

---

## Next work

- M1–M9 are implemented locally; M1–M4 remain user-confirmed as hosted. M5–M9 are not deployed. Do not create another Vercel project.
- **Implement M10 → M11 → M12** (diagnostic simulations, Groq analysis, dashboard insight) per the specs above, stopping for user direction after each milestone. These are admin-facing only.
- Open items: resolve the existing Braintree Hosted Fields typecheck errors in `components/BraintreePaymentForm.tsx`; decide whether merchant contact and recovery-link sent state should become persisted data; decide when to deploy M5–M9/M10–M12 to the existing Vercel project.
- Real incident notifications remain draft/copy only. A future direct email/chat delivery feature needs a chosen provider and authorized sender/account.

## Deployment and verification status

- The existing Vercel project hosts M2, M3, and M4. The user confirmed M3 and M4 are live there; do not repeat deployment setup or create another project.
- Verify Vercel Production environment variables and that it points to the intended Neon database. If using Vercel Preview with writes, use a separate Neon branch to avoid modifying production data during testing.
- The current `npm run build` generates Prisma Client before `next build`; Vercel's install/build also generates it through `postinstall`/build script.
- The user ran the merchant migration against their Neon database and confirmed M3/M4 are hosted. If diagnosing a production data/schema issue, verify the migration against the exact Vercel Production `DATABASE_URL`; Preview and Production may point to different Neon branches.
- Local functional behavior has been confirmed by the user for M1–M9 scope as recorded above. Recheck the deployment and Git state if asked to diagnose or change production.
- Existing paid checkout verification is separate from simulations. Successful agent checkout against the deployed endpoint remains deferred.

## Completion rule

Keep checkboxes grounded in implementation and user-confirmed verification. Mark only completed work. Preserve unresolved decisions as open and stop for the user's direction after completing each milestone (including M10–M12).
