# PayProof Milestones: Revised M10 onward
 
Replace everything from `## M10` to the end of the original file with this content. M1-M9 stay untouched. Status stays honest: nothing below is checked until it is runtime-verified against Braintree Sandbox + Neon.
 
## Handoff block (replace the existing one)
 
> LAST ACHIEVED MILESTONE: M9 (implemented locally).
> M10–M13 compile but are unverified against Braintree Sandbox + Neon. M13A, M15A, M15B, M16 not started. M14 exists but wrong architecture (synchronous, no Groq, not surfaced on cases or merchant portal).
> New milestones added: M13-N (auto notifications) and M13-O (agent actions in live feed).
> Order of work: M10 → M11 → M12 → M13 → M13-N → M13-O → M13A → M14 → M15A → M15B → M16 → M17.
 
Verification standard for every milestone below: "done" means (a) code merged, (b) run against configured Sandbox + Neon with owner auth, (c) the specific rows/records listed in its acceptance checks were inspected, (d) the result is written under the milestone as a dated note. M5-M9 are "implemented locally" and get a light re-check at the end of M13.

## M1–M4

## M1 — Braintree Sandbox checkout

- [ ] Replace PayPal with Braintree as the payment provider.
- [ ] Use Braintree Hosted Fields/client token to tokenize card entry and send the resulting payment method nonce to the server.
- [ ] Create the order on the server, validate product IDs/quantities, derive totals from the catalog, process Braintree Sandbox success/failure, and update payment/inventory state.
- [ ] Keep the simulated fallback explicitly labeled when Sandbox credentials are unavailable.
- [ ] Deploy and verify the regular checkout on the hosted M2 app, including Sandbox success/failure and order/inventory state (as recorded in the plan before M3).

## M2 — Origin-aware checkout and recovery

- [ ] Persist checkout origin as `AGENT`, `HUMAN`, or `UNKNOWN`. Mark `HUMAN` only after explicit human confirmation; otherwise preserve `UNKNOWN`.
- [ ] Support authenticated agent checkout via `POST /api/connector/checkout` using `Authorization: Bearer <CONNECTOR_SHARED_SECRET>`.
- [ ] Validate cart items and quantities server-side; compute the amount from the product catalog; use an idempotency key; require a Braintree payment method nonce for a real Sandbox transaction.
- [ ] On agent payment failure, release reserved inventory, create a case that requires human review, and return structured alternate-payment guidance. Do not send a customer message automatically.
- [ ] Handle human/unknown failure through the existing checkout and protection behavior.
- [ ] Provide an owner-approved simulated recovery checkout for failed eligible orders.
- [ ] Verify origin labels and local agent checkout behavior.
- [ ] Verify a successful agent checkout against the deployed endpoint — **deferred per user instruction; not part of M5 unless the user reopens it.**

Relevant paths:

- `app/api/connector/checkout/route.ts` — authenticated, persistent, Braintree Sandbox agent checkout.
- `app/api/dev/agent-checkout/route.ts` — local-development-only proxy; returns 404 outside development and keeps connector secret server-side.
- `app/dev/agent-checkout/AgentCheckoutClient.tsx` — local test UI that uses Hosted Fields to obtain a nonce and calls the development proxy.
- `components/BraintreePaymentForm.tsx` — client Hosted Fields tokenization; calls `tokenize()` and passes the nonce to its submit callback.
- `lib/payment-provider.ts`, `lib/braintree.ts`, `lib/demo-store.ts`, `lib/database-demo-store.ts` — provider and order/payment/inventory paths.

## M3 — Merchant-aware cases

- [ ] Associate persisted fictional demo merchants with catalog products.
- [ ] Display the merchant name on each case; derive it from the case order's product ownership.
- [ ] Add a merchant filter to the case board.
- [ ] Remember the selection across refreshes in local storage, scoped only to `/owner/cases`.
- [ ] Verify merchant assignment/filtering locally, including existing cases.
- [ ] Add merchant-level dashboard analytics based on the existing ledger metrics; this was brought into the current M3 brief in chat and implemented with the later M5 dashboard work.

Relevant paths:

- `prisma/schema.prisma` — `Merchant` model and `Product.merchantId` relation.
- `prisma/migrations/20261107100000_merchants/migration.sql` — merchants, product assignment, and Field & Form seed data.
- `lib/database-demo-store.ts` — merchant-aware product seeding.
- `lib/customer-case-store.ts` — merchant ownership derived from order lines.
- `app/owner/cases/CasesListClient.tsx` — merchant selector, persistence, filtering, Kanban board.
- `components/admin/MerchantAnalytics.tsx` and `app/api/demo/merchant-analytics/route.ts` — merchant metrics view/API.

## M4 — Kanban board and full case-review modal

- [ ] Replace the scan list at `/owner/cases` with **Open → In review → Closed** Kanban columns. The current label is **Open** (not “Pending” from an older plan draft); preserve this unless asked.
- [ ] Support native drag and drop between columns and persist the status through the owner case status API.
- [ ] Clicking an Open ticket moves it to In review and opens the modal. The background blurs while the modal is open; do not delay the blur until the case data request completes.
- [ ] Embed the full case workspace in a modal: case/order details at the top, evidence/timeline on the left, assistant chat on the right. Preserve the separate data/chat APIs while keeping the old `/owner/cases/[caseId]` page route removed.
- [ ] Preserve case workspace capabilities in the modal: chat/questions and citations, evidence selection and timeline, packet download, customer reply drafting/editing/saving/copying, merchant notes, merchant-response draft preparation/save/copy/download, and eligible failed-order recovery link creation/copy/preview.
- [ ] Keep “Recover this sale” below the chat/evidence panels and keep the three collapsibles the same full width.
- [ ] Remove the repeated order-status/origin line, the review status bar, and the case modal footer (“Private owner workspace” / “Back to case board”).
- [ ] Add one circular close-review control beside the ticket title. Disable it until a customer reply draft is saved; the server also enforces this requirement. On click, close the review and move the case to Closed.
- [ ] Show board update errors in a fixed toast so they do not push/reflow the board.
- [ ] Persist merchant choice only on `/owner/cases`; persist case statuses through APIs/database.
- [ ] User confirmed the case-board/modal experience works locally, including database-backed persistence.

Current modal geometry in `app/owner/cases/[caseId]/case-detail.css` is intentional and was tuned in chat: desktop width `min(1200px, 80vw)`, height `min(82.5dvh, 968px)`; mobile remains full-screen; 14px panel-to-panel gap; title-to-panel body top padding 6px desktop / 7px mobile. Do not “simplify” these values without checking the live UI with the user.

Relevant paths:

- `app/owner/cases/CasesListClient.tsx` and `app/owner/cases/owner-cases.css` — board, merchant filter, errors, card interaction.
- `app/owner/cases/[caseId]/CaseDetailClient.tsx` and `app/owner/cases/[caseId]/case-detail.css` — modal workspace and styling. `CaseDetailClient.tsx` is reused inside the modal; it is not a route page.
- `app/owner/cases/[caseId]/page.tsx` — intentionally deleted. Do not restore the separate page.
- `app/api/owner/cases/route.ts`, `app/api/owner/cases/[caseId]/route.ts`, `/status`, `/close`, `/notes`, `/recovery-link` — API routes remain.
- `lib/customer-case-store.ts`, `lib/case-assistant.ts` — case records, merchant derivation, draft gating, evidence and assistant behavior.

## M5 — Merchant analytics and transaction diagnostics — IMPLEMENTED LOCALLY

- [x] Derive per-merchant payment event counts, failed payments, recovered revenue/orders, order counts, open cases, and human cases needing action from ledger records.
- [x] Show attributed event totals and explain cross-merchant overlap for mixed-merchant orders.
- [x] Show merchant health and case breakdowns without stock/inventory metrics.
- [x] Provide owner-authenticated simulation history and configurable Sandbox diagnostic inputs.
- [x] Validate server-side failure count, selected failure label, merchant, origin mode, and time compression.
- [x] Create a fresh idempotency key for each diagnostic transaction and return transaction/order/case identifiers.
- [x] Keep all diagnostic transactions on Braintree Sandbox and require the configured database for this diagnostics endpoint.
- [x] Fixed merchant dropdown in `TransactionSimulations.tsx` to always show all 5 `DEMO_MERCHANTS` (Apex Outpost, Beacon Supply, Field & Form, Northstar Goods, Solis Studio) without being overwritten by analytics data.
- [x] Joined `simulation_diagnoses` in `listDatabaseDashboardSimulations()` (`lib/database-demo-store.ts`) on `simulationId` / `simToken` extracted from `SIMDASH-V2F-` idempotency keys, returning `patternDetected` and `confidence` on order rows.
- [x] Replaced client-side React `useState` diagnosis map in `TransactionSimulations.tsx` with DB-backed `patternDetected` (displaying "Pending" when null, and "Analyzing…" for the actively analyzing simulation run).
- [x] Redesigned `TransactionSimulations.tsx` with a two-column layout (≥1200px): left column configurator with 11px uppercase tracking-widest muted labels, subtle orange left-accent focus border, and full-width pulsing run button; right column 'Last Diagnosis' card fetching from `GET /api/admin/simulate/latest-diagnosis` with confidence pill, recommended action block, collapsible hypothesis, relative timestamps, and shimmering skeleton loader during analysis.
- [x] Replaced flat AG Grid transaction table with grouped diagnostic history run cards aggregated by `simulationId`, showing merchant name, failure type & origin tags, relative time, transaction count, diagnosis status, confidence badge, and expandable chevron sub-table for transaction IDs, outcomes, and case statuses.

Relevant paths:

- `components/admin/MerchantAnalytics.tsx`, `app/api/demo/merchant-analytics/route.ts` — merchant payment and case metrics.
- `components/admin/TransactionSimulations.tsx`, `app/api/demo/simulations/route.ts` — inputs, Sandbox runs, and history.
- `lib/database-demo-store.ts`, `lib/demo-store.ts` — order, payment, case, and simulation ledger behavior.

## M6 — Cross-merchant incident monitoring — IMPLEMENTED LOCALLY

- [x] Detect a payment failure spike when a merchant has at least 5 recent events and more than 50% failures in the 15-minute window.
- [x] Detect 5 or more distinct failed orders for one merchant in the 5-minute window as a possible carding pattern.
- [x] Surface open agent failures requiring human review.
- [x] Detect 5 or more unresolved cases for a merchant and include the oldest-case age.
- [x] Return incident evidence, merchant, window, and confidence/classification to the admin UI.
- [x] Let the admin request a notification draft, flag an incident, or dismiss it. Notification content is drafted for review; the endpoint does not send it.
- [x] Scope incident endpoints to owner authentication and validate request origin for actions.

Relevant paths:

- `lib/incident-detector.ts` — thresholds and cross-merchant grouping.
- `app/api/admin/incidents/route.ts`, `lib/incident-notifications.ts` — incident API and notification drafts.
- `components/admin/Incidents.tsx` — incident cards, actions, and review UI.

## M7 — Merchant case health and agent action log — IMPLEMENTED LOCALLY

- [x] Show merchant-level open case health and case breakdowns.
- [x] Record agent failure escalation to human review and suppressed win-back actions.
- [x] Show recent automatic agent actions with merchant attribution and timestamps.
- [x] Protect the action log endpoint with owner authentication.

Relevant paths:

- `lib/agent-action-log.ts`, `app/api/admin/agent-actions/route.ts` — persistence and read API.
- `lib/database-demo-store.ts` — writes escalation and recovery-suppression actions on agent failures.
- `components/admin/AgentActions.tsx`, `components/admin/MerchantHealthSummary.tsx`, `components/admin/MerchantCaseBreakdown.tsx` — admin views.

## M8 — Admin dashboard refinement — IMPLEMENTED LOCALLY

- [x] Organize the admin landing around payment outcomes, order activity, cases, merchant analytics, and demo diagnostics.
- [x] Keep Network Overview content in the network admin surface and make the landing navigation link available.
- [x] Remove inventory snapshot and protection toggle features from the current admin implementation.
- [x] Preserve polling and responsive admin activity views.

Relevant paths:

- `app/admin/page.tsx`, `app/admin/admin.css` — admin landing and layout.
- `components/admin/PaymentEvents.tsx`, `OrderManagement.tsx`, `SectionRail.tsx`, `DashboardHeader.tsx` — payment and order activity.
- `app/admin/activity/`, `components/admin/LiveDataStream.tsx` — order activity surface.

## M9 — Merchant portal and isolated merchant authentication — IMPLEMENTED LOCALLY

- [x] Authenticate merchants and issue a merchant-scoped session.
- [x] Restrict merchant views and dashboard records to products/orders owned by the signed-in merchant.
- [x] Show that merchant’s payment summary, failed checkout rate, open cases, origin, and detected incidents.
- [x] Keep the merchant view separate from owner/admin endpoints and require owner authentication for Network Overview access.

Relevant paths:

- `app/merchant/login/page.tsx`, `app/merchant/page.tsx`, `app/merchant/layout.tsx` — merchant portal.
- `app/api/merchant/auth/route.ts`, `app/api/merchant/dashboard/route.ts`, `lib/auth.ts`, `middleware.ts` — sessions, scoping, and access controls.

## M10: Distinct, real Sandbox failure scenarios (scope: accuracy only)
 
M5 already built the inputs, validation and history. M10 changes only what the simulator sends to Braintree and proves the outcomes differ.
 
**Scenario matrix (verify codes against current Braintree Sandbox docs before coding):**
 
| UI failure type | How it is triggered in Sandbox | Expected stored signal |
|---|---|---|
| Insufficient funds | valid test nonce + sandbox-only amount 2001.00 | processor response 2001 |
| Do not honor (generic decline) | amount 2000.00 | 2000 |
| Expired card | amount 2004.00 | 2004 |
| Suspected fraud | amount 2014.00 | 2014 |
| CVV mismatch | CVV test value that fails + merchant account CVV rule enabled | gateway rejection reason `cvv` |
| AVS mismatch | postal code test value that fails + AVS rule enabled | gateway rejection reason `avs` |
| Processor unavailable | amount 3000.00 | 3000 |
 
If the sandbox merchant account cannot enforce AVS/CVV rules, **remove those two types from the UI** rather than faking them.
 
**Tasks**
- [ ] Add a server-side `SCENARIOS` map (failure type -> nonce, sandbox amount override, expected response code). The UI sends only the type key.
- [ ] Sandbox-only amount override: apply it only in `app/api/demo/simulations/route.ts` and only when the Braintree environment is Sandbox. Never in `/api/checkout/*` or the connector route, where amount is derived from the catalog.
- [ ] Store on each payment event: `processorResponseCode`, `processorResponseText`, `gatewayRejectionReason`, `avsResponse`, `cvvResponse` (null when absent) plus `simulationId`. Add an additive migration if columns are missing.
- [ ] Compare the stored code against the scenario's expected code; if they differ, mark the transaction `scenarioMismatch=true` and surface it in the result card.
- [ ] Keep: owner auth, origin check, per-transaction idempotency key, merchant selection, HUMAN/AGENT/alternating MIXED, compressed vs spread timing.
- [ ] Timing: define "compressed" = all transactions inside 2 minutes; "spread" = evenly across 20 minutes (document in the UI). Use real scheduling with a request time budget, not backdated timestamps.
- [ ] Label every simulation row and UI string as Sandbox / fictional.
**Acceptance checks**
- [ ] Run 5 failures for each type; DB shows the expected distinct response codes per type, zero `scenarioMismatch`.
- [ ] HUMAN, AGENT, MIXED runs: origin on payment events and cases matches; MIXED alternates.
- [ ] Compressed run triggers the M6 failure-spike incident for the chosen merchant; spread run does not.
- [ ] Agent failures write escalation entries to the action log; human failures create cases.
- [ ] Re-submitting the same request does not duplicate transactions.
---
 
## M11: Transaction-grounded diagnosis
 
Depends on M10 being verified.
 
- [ ] Analysis endpoint reads only rows for the given `simulationId` (events, cases, origin, timestamps, processor/AVS/CVV fields). It must not read other simulations.
- [ ] Build a deterministic **evidence summary first** (counts per response code, origin split, time span, merchants) in code. Pass that summary to Groq; Groq writes the interpretation.
- [ ] Output schema: `pattern`, `likelyCause`, `evidence[]` (each tied to a row count or code), `testableHypothesis`, `recommendation`, `confidence` (low/medium/high), `confidenceReason`.
- [ ] Validate evidence: every cited code/count in the model output must exist in the evidence summary; otherwise discard that item and lower confidence.
- [ ] Fallback when Groq is down or JSON is invalid: rule-based diagnosis from the evidence summary, `confidence: low`, flagged `source: "fallback"`.
- [ ] Missing-field behavior: if processor/AVS/CVV fields are null, say so in `confidenceReason` and cap confidence at medium.
- [ ] Never trigger payments, customer messages or merchant notifications.
**Acceptance checks**
- [ ] Insufficient-funds x5 vs fraud-suspected x5 produce clearly different diagnoses that cite the correct codes.
- [ ] AGENT-only vs HUMAN-only runs: diagnosis mentions the origin difference.
- [ ] Kill the Groq key: fallback appears, UI still renders, nothing crashes.
- [ ] Hand-check one diagnosis claim-by-claim against the DB rows.
---
 
## M12: Persisted latest diagnosis
 
- [ ] `SimulationDiagnosis` stores diagnosis JSON, `source` (groq/fallback), `simulationId` (unique), `createdAt`.
- [ ] Save after analysis; on save failure return the analysis anyway with `persisted: false` and show a small notice.
- [ ] Owner-only `latest-diagnosis` endpoint; merchant sessions get 403.
- [ ] Apply the additive migration only after confirming the target database. Do not apply `20261107180000_remove_inventory` in the same step without a separate confirmation.
**Acceptance checks**
- [ ] Run diagnostic, refresh, open in a new browser session: same latest diagnosis shows.
- [ ] Break the DB write (temporary env): analysis still displays, `persisted:false` shown.
- [ ] Running a second diagnostic replaces "latest" but old row remains.
---
 
## M13: Network Overview and attention strip — PARTIALLY COMPLETE
 
- [ ] `/admin/network`: active incidents, latest diagnosis, system-recorded actions, merchant health. (Rename "automatic actions" to "system-recorded actions" everywhere; PayProof records escalations, it does not act autonomously.)
- [ ] Dismissible attention strip on `/admin`; dismissal stored per session; hidden when nothing to show.
- [ ] Network nav badge shows active incident count.
- [ ] Owner-session middleware on `/admin/**` and `/api/admin/**`; merchant session returns 401/403.
- [x] Network nav badge shows active incident COUNT number inside the badge, not just a red dot
- [x] middleware.ts must protect /api/admin/** with owner session check — currently /api/admin/** is completely unprotected
**Acceptance checks**
- [ ] Empty database state renders cleanly with no strip and no badge.
- [ ] After an M10 compressed run: incident card, badge, strip all appear; dismiss hides strip until next new incident.
- [ ] Merchant cookie hitting `/admin/network` and each admin API is rejected.
- [ ] All links on the page resolve.
- [ ] Light re-check of M5-M9 behavior (analytics totals, incident thresholds, merchant isolation) with the same data.
---

## M13-N — Automatic incident notifications — COMPLETE (app-side runtime verified 2026-11-09; inbox delivery not independently checked)

- [x] Auto-send email via Resend immediately (no admin approval) when incident type is CARDING_PATTERN or FAILURE_SPIKE and confidence is high. FAILURE_SPIKE auto-send threshold is >80% failure rate.
- [x] All other incident types (AGENT_REVIEW_REQUIRED, CASE_THRESHOLD_EXCEEDED, medium/low confidence) remain draft + admin approval. Do not change that flow.
- [x] Email recipient: raox58@gmail.com (demo). Subject and body generated by Groq with hardcoded fallback template if Groq fails.
- [x] Attach autoNotified, autoNotifiedAt, autoNotifiedChannel to incident record on success. Attach autoNotified: false and autoNotifyError on failure. Send failure must never block incident detection from returning.
- [x] Incident card shows "✉ Merchant notified automatically · [time]" badge on auto-sent incidents. Shows amber warning if send failed.
- [x] Incident modal for auto-sent incidents shows read-only view of sent message with "Send follow-up" option instead of "Prepare merchant response".

### M13-N runtime verification note — 2026-11-09 (local)

Environment: local dev server, owner session, configured Braintree Sandbox + Neon, Resend env present. Scenario run exactly as requested: `/admin` → Demo Tools → Transaction simulations, **Origin AGENT**, **Number of failures 6**, **Failure type Processor decline**, **Time compression Compressed**, **Merchant Northstar Goods (single)**, Network incident mode **off**.

- Run result: 6/6 captures `FAILED` (`2000 · Do Not Honor`, cases created), diagnosis ready.
- `GET /api/admin/incidents` returned `FAILURE_SPIKE:northstar` (*100% of 6 payment attempts failed in the last 15 minutes*) and `CARDING_PATTERN:northstar` (*6 distinct orders failed in the last 5 minutes*). Both had `autoNotified: true`, `autoNotifiedChannel: "email"`, `sentRecipient: "raox58@gmail.com"` (`autoNotifiedAt` 09:38:16Z and 09:38:17Z).
- `/admin/network` rendered both incident cards with `✉ Merchant notified automatically · just now`; nav badge showed incident count `8`. No `Auto-notification failed` badge appeared.
- DB rows inspected: `AgentActionLog` `MERCHANT_NOTIFICATION_EMAIL_SENT` rows for both incidents (09:38:17Z–09:38:34Z) with subjects `⚠️ Security alert — possible carding attack detected on Northstar Goods` and `⚠️ Payment alert — elevated failure rate detected on Northstar Goods`; `IncidentState` rows present for both incident IDs.
- Outcome: **A (app-side)** — Resend accepted the sends and the cards show the success badge. **Inbox arrival at raox58@gmail.com was not independently inspected** (no inbox access in this environment); Resend returning a message id (required before `autoNotified: true`) is the strongest available evidence.
- Defect observed: **duplicate sends.** Five `MERCHANT_NOTIFICATION_EMAIL_SENT` rows were written for these two incidents within ~17s (2× FAILURE_SPIKE, 3× CARDING_PATTERN). Concurrent incident polls (header, attention strip, network page) race the in-memory `autoNotifiedCache`, whose check-then-set is not atomic (dev module reload also resets it). Add persisted per-incident dedupe before calling notifications production-safe.
---

## M13-O — Agent actions in live feed — IMPLEMENTED LOCALLY (runtime verified 2026-11-09)

> Per explicit user direction, this landed in `app/admin/live-transaction/page.tsx` (live scan stream), **not** `TransactionSimulations.tsx`. That file was left untouched.

- [x] Add [ACTION] event level to the live scan stream. Color: cyan (`#22d3ee`); same timestamp · level badge · message · sub-label row structure.
- [x] After each `SCAN SUMMARY` ALERT for a FAILED AGENT checkout, inject one ACTION row:
        [ACTION] Case escalated for human review · {caseId}
      HUMAN failures inject no escalation row. (Recovery suppressed row/injection removed from the UI per user request 2026-11-09; `RECOVERY_SUPPRESSED` DB records remain.)
- [x] After an auto-notification fires (`autoNotified: true` for the transaction merchant from `GET /api/admin/incidents`), inject:
        [ACTION] Merchant notified automatically · {merchant}
        sub: ✉ Sent to raox58@gmail.com · {incidentType}
      Deduped per `incidentId` for the page session via a `Set`.
- [x] ACTION rows appear inline at the moment the action is taken, not batched at the end of the run.

### M13-O runtime verification note — 2026-11-09 (local)

- Owner session on the dev server; latest capture scanned on `/admin/live-transaction`.
- HUMAN failed capture: ALERT emitted, **no** suppression/escalation ACTION rows; one `Merchant notified automatically · Northstar Goods` ACTION row (`✉ Sent to raox58@gmail.com · FAILURE_SPIKE`) because the incident was `autoNotified: true`.
- AGENT failed capture (`processor_decline`, Northstar): ALERT then `Case escalated for human review · CASE-61044A29` (sub: `Requires merchant action`). The auto-notification row was **not** re-injected — session dedupe worked.
- Recovery suppressed display/injection removed from the live scan stream and both agent-action panels (2026-11-09); `RECOVERY_SUPPRESSED` records remain in `AgentActionLog`. Runtime check: live scan shows only the Case escalated ACTION row, and both panels render 10 Case escalated rows with 0 recovery rows.
- ACTION badge computed color `rgb(34, 211, 238)` (cyan).
- New full-width **Recent agent actions** panel: dark `rgb(17, 18, 20)` surface (matches live scan stream), fixed `220px` body, scrollable, types tagged muted-yellow / amber / cyan / gray, relative times (`just now`, `13 min ago`), and age styling confirmed (`just now` → cyan 2px left border + opacity 1; older → opacity 0.6, transparent border).
---
 
## M13A: Cross-merchant pattern detection (new; this is the "Network" signal) — NOT STARTED
 
> Network incident mode in TransactionSimulations.tsx fires parallel simulations per merchant under a shared networkBatchId but does NOT generate cross-merchant signals (no shared card hash or agent channel grouping). M13A detection logic does not exist yet in lib/incident-detector.ts.
 
M6 detects spikes per merchant. This milestone detects patterns across merchants.
 
- [ ] Add a stable, non-sensitive grouping key to payment events: agent channel identifier (see M15A) and, for card signals, Braintree's returned card BIN/last4 pair or a one-way hash. Never store full card numbers.
- [ ] Rule: same agent channel OR same card hash failing at 3 or more distinct merchants within 30 minutes -> `CROSS_MERCHANT` incident with evidence (merchants, counts, window).
- [ ] Add to incident API and Network Overview; admin can draft a notification to affected merchants (draft only, human sends).
- [ ] Add a simulator option "span merchants" so this can be reproduced with Sandbox data.
**Acceptance checks**
- [ ] Simulated run across 3 merchants from one channel creates exactly one cross-merchant incident.
- [ ] Same volume at one merchant creates only the M6 incident, not a cross-merchant one.
---
 
## M14: Live payment diagnosis — PARTIALLY IMPLEMENTED (WRONG ARCHITECTURE)
 
- [ ] Trigger diagnosis from real failed-checkout records (human and agent paths), reusing the M11 evidence-summary approach. Remove any dependence on `simulationId`; key by `paymentEventId` or case.
- [ ] Evidence: processor response, AVS/CVV, origin, merchant's recent event pattern, cross-merchant incident if any.
- [ ] Output: cited evidence, testable hypothesis, merchant next step, confidence; stored and shown on the case and merchant portal.
- [ ] Data gaps: when fields are absent, state the gap and use rule-based fallback.
- [ ] Advisory only; no money movement, customer contact or checkout blocking.
- [ ] Diagnosis runs after the failure is recorded (async); a diagnosis failure must never fail the checkout response.
- [ ] Diagnosis must run async AFTER failure is recorded — currently runs synchronously on poll, blocking response
- [ ] Groq must be called for diagnosis interpretation — currently pure rule-based only, no Groq integration
- [ ] Diagnosis result must surface on case view (app/owner/cases) and merchant portal (app/merchant)
- [ ] Cross-merchant incident context missing from diagnosis evidence
**Acceptance checks**
- [ ] A real Sandbox failed checkout (non-simulator) produces a diagnosis on its case.
- [ ] Checkout latency is unchanged when Groq is slow or down.
---
 
## M15A: Agent channel identity (new prerequisite for freezing) — NOT STARTED
 
> Connector route currently validates only against a single static CONNECTOR_SHARED_SECRET. No AgentChannel model exists in schema.prisma. agentChannelId is not recorded on Order or PaymentEvent.
 
- [ ] Replace the single `CONNECTOR_SHARED_SECRET` model with per-channel credentials: `AgentChannel { id, name, merchantId?, secretHash, status, createdAt }`. Store only a hash of each secret.
- [ ] Connector route resolves the channel from the bearer token; record `agentChannelId` on every connector order and payment event.
- [ ] Keep the shared secret working temporarily as a legacy channel named `legacy` so existing tests do not break; log a deprecation note.
- [ ] Owner can create/rotate a channel secret (shown once).
**Acceptance checks**
- [ ] Two channels checkout; events carry the right channel id.
- [ ] Invalid secret returns 401 and records nothing.
---
 
## M15B: Channel freeze and restore — NOT STARTED
 
- [ ] Freeze requires a human action from an authenticated merchant (own channels) or owner; records actor, reason, timestamp in the audit log.
- [ ] Frozen channel: connector returns a structured rejection (`code: "CHANNEL_FROZEN"`, reason, contact guidance) with HTTP 403 and records the rejected attempt.
- [ ] Restore: owner/admin only; records actor and reason. Merchants can request restore, not perform it.
- [ ] Never freeze based on AI output; incident and diagnosis may only suggest it.
- [ ] Surface status and history in the merchant portal and Network Overview.
**Acceptance checks**
- [ ] Freeze channel A: A is rejected with the reason; channel B still succeeds.
- [ ] Merchant cannot restore; owner can.
- [ ] Merchant cannot freeze another merchant's channel.
- [ ] Audit log shows who/why for each freeze, restore and rejection.
---
 
## M16: Live diagnosis stream panel — NOT STARTED
 
> No SSE routes exist in the codebase. The live stream panel at /admin/live-transaction uses a polling JSON endpoint (GET /api/admin/live-transactions every 4s) with client-side template strings simulating stream events. Groq streaming is not used. Terminal component does not appear on Network Overview or merchant portal.
 
- [ ] Server emits a stream (SSE) of **real pipeline events**, each produced by actual code: `INFO` (query run, rows read, window checked), `WARN` (threshold exceeded, mismatch, missing fields), `SUCCESS`/`ALERT` (conclusion).
- [ ] Each line carries a type, message, and a reference (table/count/incident id) so it can be traced.
- [ ] Groq's streaming API is used only for the final interpretation/conclusion lines. Pipeline steps are not generated by the model.
- [ ] Terminal-style component on Network Overview and the merchant portal (merchant sees only its own data), shown during active incidents or a running simulation.
- [ ] Handle disconnect/reconnect and Groq failure (emit `WARN` then fallback conclusion).
**Acceptance checks**
- [ ] Every streamed INFO/WARN line can be matched to a real query/result in server logs.
- [ ] Merchant session never receives another merchant's lines.
---
 
## M17: Incident history graph (7 days)
 
- [ ] Persist incident detections (`IncidentRecord`: type, merchantId, window, evidence, detectedAt, status) so history exists; M6 currently computes live only.
- [ ] Persist system-recorded actions with timestamps (already in the action log; confirm retention).
- [ ] Chart per merchant: failure events, incident detections, actions per hour/day over 7 days.
- [ ] Demo data: a clearly labeled seed script that inserts fictional historical events (quiet baseline, spike, incident, recovery) flagged `isDemoSeed=true`, removable with one command. Do not present it as live data.
- [ ] Owner sees all merchants; merchant sees own.
**Acceptance checks**
- [ ] After seed, graph shows baseline -> spike -> incident marker -> recovery for the chosen merchant.
- [ ] Removing seed data empties the graph without errors.
---

## M18: AG Studio embedded analytics dashboard

> Implementation owned by teammate. A placeholder 
> page exists at /admin/network under the existing 
> network page. AG Studio will replace the static 
> panels with an embedded self-serve dashboard.

- [ ] Obtain AG Studio 45-day trial license from 
      https://www.ag-grid.com/studio/license-pricing/
- [ ] Install AG Studio React package and configure 
      license key in environment variables
- [ ] Create a flat JSON data endpoint 
      GET /api/admin/studio-data that returns payment 
      events, incidents, agent actions, and merchant 
      health as a single denormalized array suitable 
      for AG Studio's data engine
- [ ] Replace the network heatmap section on 
      /admin/network with AG Studio embedded dashboard 
      component
- [ ] Pre-build these widgets inside Studio:
        • Failure rate by merchant (bar chart)
        • Payment events over time 48h (line chart)
        • Incident count by type (donut)
        • Agent actions timeline
        • Checkout origin breakdown HUMAN/AGENT/UNKNOWN
        • Merchant health heatmap
- [ ] Integrate Studio Agent Framework: chat input 
      on the network page, natural language → widget 
      generation. Example queries:
        "Show me only carding pattern incidents"
        "Compare Field & Form vs Northstar failures"
        "Which hour had the most failures today?"
- [ ] Theme Studio to match PayProof design system 
      (dark background, orange accent, existing 
      typography)
- [ ] Cross-filtering: clicking a merchant in one 
      widget filters all other widgets

Relevant paths:
- app/admin/network/page.tsx — host component
- app/api/admin/studio-data/route.ts — flat data 
  endpoint for Studio
- Space reserved in network page layout between 
  Active Incidents and Agent Actions sections

---

## Remaining release checks
 
- [ ] Confirm target database, then apply pending migrations in order (diagnosis, new event columns, channels, incident records, inventory removal last).
- [ ] Re-run M10-M17 acceptance checks on the deployed app. Use the existing Vercel project.
- [ ] Update the handoff block with the real last verified milestone and date.

---

## Recent Updates (November 2026)

### 1. Active Incidents — Modern Response Modal (`components/admin/Incidents.tsx`)
- Replaced card downward-expansion with a dedicated overlay modal.
- State-aware loading screen while AI generates draft with text glow and pulse animation: "Agent is preparing the draft... Synthesizing incident signals...".
- Clean modal design with tabs for Email Dispatch (Resend integration with email validation) and Chatbox / Direct Copy.
- Fully editable subject line and response message text areas with copy-to-clipboard functionality.
- Resend email sending with instant feedback and inline error handling.

### 2. Transaction Simulations — Live Stream Feed & Network Incident Mode (`components/admin/TransactionSimulations.tsx`)
- **Configurator UI & Network Incident Mode**:
  - Added dedicated toggle row with globe icon + "Network incident mode" and smooth animated height transition (150ms).
  - Multi-merchant checklist showing all 5 merchants from `DEMO_MERCHANTS` (Apex Outpost, Beacon Supply, Field & Form, Northstar Goods, Solis Studio) with "Select all merchants" bidirectional synchronization.
  - Inline validation text in red (`"Select at least one merchant to run a network incident."`) preventing API calls when zero merchants are selected.
  - Dynamic "SCENARIO" dropdown between Failure type and merchant checklist with automatic presets:
    - *PayPal / Braintree infrastructure outage* -> Gateway timeout (`network_timeout`), Origin `HUMAN`
    - *Coordinated carding attack* -> Processor decline (`processor_decline`), Origin `HUMAN`, Failure count `6`
    - *AVS service degradation* -> AVS mismatch (`avs_mismatch`), Origin `HUMAN`
    - *Gateway timeout (network-wide)* -> Gateway timeout (`network_timeout`), Time compression `compressed`
  - Added small muted hint: `"Set by scenario — you can override this."` below Failure type, cleared on manual edit.
  - Run button dynamically toggles label: `"Run network incident"` vs `"Run diagnostic"`.
- **Parallel Streaming & Sequential Analysis**:
  - `POST /api/demo/simulations` fired once per merchant concurrently via `Promise.all` with client-generated `networkBatchId` and `scenarioName`.
  - Sequential Groq analysis execution loop (`POST /api/admin/simulate/analyze`) after all streams complete, respecting rate limits and updating live feed status indicators.
- **Diagnostic History Bundling**:
  - Grouped runs with $\ge 2$ entries sharing `networkBatchId` render inside a unified incident container with banner `🌐 Network incident · [scenarioName] · [relative time]`, maintaining individual nested expandability.

 