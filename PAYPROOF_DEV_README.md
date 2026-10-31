# PayProof — Developer README (build spec)

> Status: PROVISIONAL idea, building on top of this spec. Tiers below set BUILD ORDER, not removal: do not drop a feature because it might score low. Hackathon: PayPal AI Hackathon. Deadline: Nov 12, 2026, 12:00 pm PT (Official Rules). Solo developer, about 16 days from Oct 27.

## 0. How the coding agent must work

1. Keep ALL real PayPal code for Phase 6. Until then every payment goes through a `PaymentProvider` interface with a `MockProvider` (section 12). Run the Phase 0 probe early as a standalone script, outside the app, and record what the sandbox supports in `docs/SPIKE_RESULTS.md`. Every phase must end deploy-ready (section 12).
2. Never invent PayPal API behavior. Check official PayPal docs, or the APIMatic Context Plugin if your IDE supports MCP (verify; the plugin is documented for Claude Code, Cursor and other MCP-compatible agents).
3. Sandbox only. Never use live credentials. Never commit secrets. Do not connect external services, purchase anything, publish or submit without the developer's explicit permission.
4. The AI model never moves money, changes prices or stock, or sends messages. Deterministic server code enforces every rule. Customer text is untrusted input to the model.
5. Label simulated data and simulated behavior in the UI and in docs. Never claim a real PayPal dispute was received or that evidence was submitted to PayPal unless verified in the spike.
6. Animation on button clicks is the top UI priority (section 7). Build `MotionButton` before other UI.

## 1. One-paragraph abstract

PayProof is a merchant incident and trust desk for PayPal-powered stores. A store sends order and payment events to PayProof. When a payment fails, PayProof protects stock and orders automatically, shows exactly what the failure cost, opens a case with evidence and a probable cause, helps the merchant answer the customer and win the sale back, and assembles transaction-specific evidence for enquiries and disputes. The merchant approves every outward action. Pitch line: "Every failed payment is a lost sale and a stuck shelf. PayProof shows what a failure costs, then fixes it live."

## 2. Stack (decided)

| Area | Choice | Notes |
|---|---|---|
| App | Next.js (App Router) + TypeScript | One codebase: storefront, owner console, API routes |
| Animation | GSAP via `@gsap/react` (`useGSAP`), GSAP Flip | Check current GSAP license terms at gsap.com |
| Dashboard | AG Studio (React) | Free 45-day trial license; docs: ag-grid.com/studio/react/quick-start, /custom-widgets, /ai-agents |
| Starter | github.com/paypaldev/hackathon-paypal-ag-grid-boilerplate | Check its license first; README showed simple tables, verify AG Studio is actually used |
| PayPal | `@paypal/paypal-server-sdk` + PayPal JS SDK, sandbox | Verify SDK version (v5 vs v6) in docs |
| AI | Groq (primary, call directly, structured JSON output), second Groq model as fallback, AWS Bedrock only if access is confirmed | No LangChain needed |
| DB | Neon Postgres (Prisma ORM) | Warm before demos (cold start) |
| Live updates | SSE route handler, polling fallback | Vercel Hobby has a time limit per function; auto-reconnect |
| Hosting | Vercel | Render worker is conditional (F6.3) |
| Build aid | APIMatic Context Plugin | Dev-time only; keep an evidence log |

Environment variables: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_ENV=sandbox`, `DATABASE_URL`, `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_FALLBACK_MODEL`, `OWNER_EMAIL`, `OWNER_PASSWORD_HASH`, `SESSION_SECRET`, `AG_STUDIO_LICENSE_KEY`, `CONNECTOR_SHARED_SECRET`. Secrets stay server-side. The private merchant desk requires `OWNER_EMAIL`, a `scrypt_v1:<salt>:<hex-digest>` `OWNER_PASSWORD_HASH`, and a random `SESSION_SECRET` of at least 32 bytes. `npm run owner:hash` generates a password hash with hidden terminal input. The connector requires a separate `CONNECTOR_SHARED_SECRET`.

## 3. Verified vs unverified PayPal sandbox facts

Verified (from the PayPal sandbox getting-started README only): fake accounts and money; Personal = buyer, Business = seller; create order, buyer approval, capture; seller sees activity; test cards; `PayPal-Mock-Response` header forces named errors (examples: `INSTRUMENT_DECLINED`, `DUPLICATE_INVOICE_ID`); Business-account Negative Testing toggle fails all its transactions; branch on the `issue` field and log `debug_id`.

Unverified (test in Phase 0 before relying): which API calls accept the mock header and its exact format; whether buyer approval can be automated; webhooks and delivery to a public URL; refunds; disputes (creation, evidence, webhooks); authorize/capture; Transaction Search and its timing; any "same API feature set as live" claim for a specific feature.

## 4. Phase 0 — standalone sandbox probe (2 to 4 hours, outside the app, day 1)

This is verification, not implementation. Use a throwaway script. Do not copy probe code into the app; the real adapter is written in Phase 6 with the APIMatic plugin.

1. Create order, approve manually as the sandbox buyer, capture, store the result.
2. Force one failure; record which call accepts the mock header, or whether a second Business account with Negative Testing is needed.
3. Record order and stock state after the failure.
4. Apply one deterministic fix (release reservation) and re-run.
5. Test duplicate submission (`DUPLICATE_INVOICE_ID`).
6. Optional: webhook delivery to a deployed URL; sandbox dispute creation; refund.

Pass: one scenario fails visibly and passes after the fix. Fail: pivot to a narrower order-state simulator that labels the PayPal failure as sandbox-triggered and all other logic as app-side behavior. Write results to `docs/SPIKE_RESULTS.md`. If the probe shows the sandbox cannot produce the needed failures, change scope before Phase 1.

## 5. Features

Tiers: **M** = must (build first), **S** = should, **X** = stretch. Verification tags: [V] verified, [U] unverified, [OWN] our own data and code.

### 5.1 Checkout and failure simulation
- **F1.1 Demo storefront (M, OWN):** 6 to 8 fictional products, cart, order summary.
- **F1.2 PayPal sandbox checkout (M, V):** create order, buyer approval, capture. Implemented in Phase 6; earlier phases run on the mock provider. Amounts and totals are computed and validated on the server, never trusted from the client.
- **F1.3 Demo controls (M, U):** clearly labeled panel (mock failures until Phase 6, then real sandbox triggers) with "Simulate decline" and "Simulate duplicate submit". Burst mode is X.
- **F1.4 Store connector (M, OWN):** `POST /api/connector/events` with a shared secret receives order and payment events. Our demo store uses it, so a real store could too.
- **F1.5 Live updates (M, OWN):** SSE stream to the owner console, polling fallback.

### 5.2 Order protection
- **F2.1 Stock reservation (M, OWN):** reserve at checkout with an expiry, release on failed or expired payment, decrement on capture.
- **F2.2 Duplicate-order protection (M, U):** idempotency key plus a unique DB constraint; repeat submission yields one order. Use PayPal's idempotency header (verify name in docs).
- **F2.3 Protections ON/OFF with before/after counters (M, OWN):** a switch that makes the same failure run unprotected (stock stuck, duplicate order) or protected. Counters come from the real ledger.
- **F2.4 Failure burst detection and checkout pause (X, U).**

### 5.3 Cases and owner console
- **F3.1 Case auto-open (M, OWN):** triggers: order unpaid after a payment error; store state does not match returned PayPal result; customer inquiry.
- **F3.2 Probable cause with uncertainty (M):** shows PayPal `issue`, `debug_id`, response snippet, and store state; never claims more than the records show.
- **F3.3 Private owner console (M):** custom themed merchant console with incident timeline, stock reservation gauge, failure grid, protection counters, and a filterable case queue. The case queue stays scan-focused; opening a row navigates to a separate assistant-first detail page.
- **F3.4 Case-specific questions (S):** merchant asks the AI about one case; answers cite records.
- **F3.5 Auth (M, OWN):** owner login; session checked in middleware and again in every protected API route and the SSE endpoint. No private data in public routes.
- **F3.6 Natural-language widgets via the Studio Agent Framework (X, U):** check Groq compatibility and requirements in the docs first.

### 5.4 AI and communication
- **F4.1 Incident explanation (M):** Groq returns structured JSON `{summary, likely_cause, uncertainty, evidence[], next_steps[]}`; UI streams the text.
- **F4.2 Customer replies (M):** drafts for status updates and missing-information requests; the owner edits and reviews before copying. No customer message is sent from this demo.
- **F4.3 AI guardrails (M):** no money, stock or price actions by the model; sources cited; fallback to the second model, then to a templated explanation.

### 5.5 Recovery, evidence and escalation
- **F5.1 Win-back link and recovered-revenue counter (S):** server creates a new order for the same cart after owner approval.
- **F5.2 Enquiry data collection (S, OWN):** gathers order, payment and incident records into one case and asks the owner for missing details.
- **F5.3 Evidence collector (S):** timeline from authorized records (order, payment, fulfillment, policy, messages), flags missing or conflicting items, drafts a neutral response, builds a packet. Payment capture does not prove delivery. Never states that a customer is lying.
- **F5.4 PayPal case file / escalation (S, U):** API submission only if the spike proves it. Otherwise produce a PayPal-ready packet for the owner and label any seeded dispute "SIMULATED".
- **F5.5 Merchant-local history summary (X, OWN):** facts and dates only, reviewable and correctable, within one merchant's own records. No scores, no auto-blocking, no cross-merchant sharing.

### 5.6 Build and sponsor tooling
- **F6.1 APIMatic evidence log (M, process):** `docs/APIMATIC_LOG.md` with prompts used, what the plugin got right or corrected.
- **F6.2 AG Studio notes (M, process):** `docs/AG_STUDIO_NOTES.md` explaining what is custom and how it was built.
- **F6.3 Render worker (conditional):** incident processor and SSE hub; build last, cut first.
- **F6.4 Submission assets (M):** see section 10.

### 5.7 Merchant desk dashboard backlog (proposed)

These are product opportunities for making each console view more useful as the ledger grows. They are **not implemented** unless separately marked in the build status; keep the existing fictional-data and uncertainty labels on every view. Build from the shared order, payment, reservation, case, and evidence records rather than adding decorative metrics.

| View | Proposed capability | Merchant value and data needed | Suggested tier |
|---|---|---|---|
| Overview | Action queue for failed or pending orders, cases needing review, and reservations nearing expiry; each item deep-links to its record. | A clear next step based on current ledger state and reservation expiry. | S |
| Overview | Protection outcome comparison for the same demo run: units released, units still held, duplicate submissions prevented, and recovered revenue when available. | Makes the ON/OFF control explain the product's operational effect. Only show counters recorded by deterministic server logic. | M |
| Payments | Failure grouping and filters by provider issue, status, and time window, with an attempt timeline per order. | Helps a merchant separate repeated attempts from separate orders. Requires payment-event history and provider response fields where returned. | S |
| Payments | Provider diagnostics panel with `debug_id`, normalized issue, response time, and retry state. | Speeds investigation while keeping raw provider data out of customer-facing copy. Hide fields the provider did not return. | S |
| Orders | Order detail showing payment attempts, idempotency result, reservation state, and fulfillment evidence in one timeline. | Explains exactly what happened to a checkout without implying that payment proves delivery. | M |
| Orders | Owner-approved recovery action for an eligible failed order, with a new checkout link and recovered-revenue attribution. | Enables the planned win-back flow in F5.1. Require owner approval; never retry a charge automatically. | S |
| Cases | Evidence checklist with source, timestamp, completeness, and conflict flags, plus a neutral response draft that the owner edits and approves. | Extends F5.3 while making missing records and uncertainty explicit. | M |
| Cases | Downloadable case packet with a source index and an explicit `SIMULATED` label until real escalation is verified. | Gives the merchant a reviewable handoff artifact without claiming that anything was submitted to PayPal. | S |
| Inventory | Reservation aging and expiry view with release/commit history by product and order. | Surfaces stock at risk before it is stranded; depends on `stock_reservations.expires_at` and state transitions. | M |
| Global | Saved ledger filters, keyboard navigation between console sections, and a merchant-local activity export. | Speeds repeated incident review; export only records this merchant is authorized to access. | X |

**Implementation order:** first, action queue and order timeline using existing records; next, evidence checklist and reservation aging once their source fields are persisted; then diagnostics, approved recovery, packet export, and saved filters. Do not display provider latency, expiry countdowns, recovered revenue, duplicate-prevention totals, or fulfillment claims until the corresponding source data exists. The merchant overview's latest-activity strip is a read-only summary of payment records. Case summaries and evidence remain on the private `/owner/cases` pages, not embedded in the dashboard.

## 6. Data model (sketch)

`products`, `orders` (status, total, client_key unique, paypal_order_id), `stock_reservations` (order_id, qty, expires_at, state), `payment_events` (ledger: type, paypal_status, issue, debug_id, raw_json, created_at), `cases` (type, status, order_id, cause, uncertainty), `case_items` (evidence records), `ai_drafts` (case_id, kind, body, approved_by, approved_at, simulated=true), `protection_settings`, `demo_runs` (before/after counters), `owners`.

Routes (sketch): `/api/checkout/create`, `/api/checkout/capture`, `/api/demo/fail`, `/api/connector/events`, `/api/cases`, `/api/cases/[id]/explain`, `/api/cases/[id]/ask`, `/api/drafts/[id]/approve`, `/api/stream` (SSE, auth required), `/api/demo/reset`.

**Connector event contract (Phase 3):** `POST /api/connector/events` requires `Authorization: Bearer $CONNECTOR_SHARED_SECRET` and JSON `{eventId, orderId, type, status?, issue?, debugId?, occurredAt?}`. `eventId` is a UUID used as the idempotent ledger record ID; `orderId` must already exist; `type` is `ORDER_EVENT` or `PAYMENT_EVENT`. The endpoint appends a validated, simulated observation to `payment_events`; it does not mutate the order, charge a payment, or treat an unverified external status as authoritative. The DB must be configured. Never include card data, customer message bodies, or raw provider payloads in this connector event.

## 7. Motion and interaction spec (TOP UI PRIORITY)

Principles: motion explains state change. Feedback within 100 ms of any click. Durations 150 to 500 ms. Animate transforms and opacity only. Use `useGSAP` with a `scope` and `contextSafe` for handlers so everything cleans up. Respect `prefers-reduced-motion` via `gsap.matchMedia` (fade only). Animation never blocks interaction or hides real state.

**`MotionButton` (build first).** State machine: idle, pressed, loading, success, error.
- Press: scale to 0.96 with a quick `power2.out`, spring back with `back.out(1.7)`.
- Click ripple from the pointer position.
- Loading: label swaps with a vertical slide, spinner fades in, width stays stable.
- Success: width morph to a checkmark (stroke-dashoffset draw), brief pop, then settle.
- Error: short horizontal shake, color flash.
- Optional magnetic hover on primary buttons.

**Key click-driven moments**
1. **Pay with PayPal:** button morphs to loading, then a payment pipeline animates node by node (Cart, PayPal, Capture, Ledger, Console) as real events arrive over SSE.
2. **Simulate decline or duplicate:** the failing node pulses red, a fault ripple travels down the pipeline.
3. **Protections ON/OFF toggle:** thumb slides with an elastic ease, the background color morphs, counters tween up or down (`gsap.to` on an object with `onUpdate`), "stuck stock" and "released stock" bars animate.
4. **Incident arrival:** card slides into the queue, the queue reorders with GSAP Flip, a severity pulse plays, a timeline node pops in.
5. **AI explanation:** text streams from real tokens (no fake delay), then evidence chips stagger in.
6. **Approve draft:** button morphs to "Sent (simulated)" with a check, the card collapses.
7. **Dashboard widgets:** staggered entrance; changed values tween rather than jump.

Do not heavily animate AG Studio internals; animate wrappers and values around them.

## 8. Demo controls
- **Reset demo:** one button restores seeded fictional data for repeatable takes.
- **Keyboard shortcuts:** trigger decline and toggle protections.
- **Design:** one coherent visual language, dark neutral console with a single accent, clear empty, loading and error states.

## 9. 3-minute demo script (video must be under 3 minutes, public on YouTube)

| Time | Beat |
|---|---|
| 0:00 to 0:20 | Pitch and who it's for |
| 0:20 to 0:45 | Normal purchase, console updates live |
| 0:45 to 1:15 | Decline: OFF leaves stock stuck, ON releases it, AI explains |
| 1:15 to 1:35 | Double submission: two orders versus one |
| 1:35 to 2:10 | Recovery: owner approves win-back, customer pays, counter rises |
| 2:10 to 2:40 | Escalation: case file assembled, one missing item flagged |
| 2:40 to 3:00 | Counters, credits (PayPal, AG Studio, APIMatic), recap |

If buyer approval cannot be automated, record segments and edit; footage must still show the project functioning. Label real versus simulated.

## 10. Submission checklist (Official Rules)
- Public repo with a visible open-source license file (for example MIT) in the repo About section; all code, assets and run instructions included.
- The submitted golden path must run on the real PayPal sandbox. Mock mode may remain only as a clearly labeled SIMULATED fallback.
- Working demo: hosted URL or clear setup instructions. Private site: include test credentials in the README (demo-only owner account, fictional data).
- Text description of features and tools; explain significant updates if starting from the boilerplate.
- Public YouTube video under 3 minutes, no copyrighted music or third-party trademarks without permission.
- English materials. Rules caps: one Grand Prize or Honorable Mention plus one Sponsor Prize.
- Confirm sponsor-prize requirements on the official sponsor pages before claiming eligibility.

## 11. Safety and privacy
Minimize customer data, never store card data, mask emails in the UI, protect every admin endpoint server-side, cite sources with dates and uncertainty, no cross-merchant blacklist, no public reputation scores, no automatic fraud blocking, no sales-lift promises, fictional data only.

## 12. Phases, deploy-ready definition, and order (16 days)

**Rule:** every phase ends deploy-ready, and PayPal implementation is kept to Phase 6. Until then, all payment behavior goes through a `PaymentProvider` interface (`createOrder`, `captureOrder`, normalized result `{status, issue?, debug_id?, raw}`) with a `MockProvider` that returns success, an `INSTRUMENT_DECLINED`-style decline and a `DUPLICATE_INVOICE_ID`-style duplicate. Anything mock-driven is labeled SIMULATED in the UI. The mock response shapes are guesses until Phase 6; expect to adjust them.

**Deploy-ready means all of these:**
1. Build, typecheck and lint pass.
2. Deployed to a Vercel preview with Neon connected and seeded fictional data.
3. The golden path for everything built so far works end to end.
4. No secrets in the repo; `.env.example` is current.
5. Private routes and the SSE endpoint return 401 without a session.
6. README run instructions and `docs/` notes are updated.
7. SIMULATED labels are visible wherever mock behavior appears.
8. A git tag `phase-N` marks a rollback point.

| Phase | Days | Scope | Deploy-ready result |
|---|---|---|---|
| P0 | Day 1 (2 to 4 h) | Standalone sandbox probe outside the app | `docs/SPIKE_RESULTS.md` only |
| P1 | 1 to 2 | Repo, license, boilerplate check, design system, `MotionButton`, storefront, cart, `MockProvider` checkout, DB, seed and reset | Storefront live, simulated checkout works |
| P2 | 3 to 4 | Ledger, stock reservation, duplicate protection, ON/OFF counters, demo controls (mock), SSE | Protections demo works on the mock |
| P3 | 5 to 7 | Auth, AG Studio console, case engine, connector endpoint, custom widgets | Private console live |
| P4 | 8 to 9 | AI explanation, drafts, case Q&A, guardrails, motion pass | AI and animated flows live |
| P5 | 10 to 11 | Win-back, evidence collector, escalation packet (simulated), local history (X) | Full simulated product |
| P6 | 12 to 14 | Real PayPal sandbox adapter written with the APIMatic plugin, JS SDK buttons, real failure triggers, webhooks if verified, remap the mock, APIMatic log | Golden path on the real sandbox |
| P7 | 15 to 16 | Video, submission assets, buffer; submit a day early | Submitted |

**Current implementation checkpoint (Oct 27, 2026):** P1 storefront and simulated checkout, P2 order protection and Prisma-backed Neon ledger, and the custom merchant console are in place. P3 foundation is implemented: signed owner login, access checks on merchant data/mutation endpoints, private merchant controls, and a validated append-only connector event receiver. P4 includes case-grounded incident answers with source citations and reviewable customer reply drafts; no customer message is sent from this demo. The customer support flow at `/report-problem` authenticates a customer's own demo orders with HTTP-only access cookies, preserves their original complaint text, and creates a linked case. The private `/owner/cases` queue is scan-focused; each case opens a separate assistant-first page that summarizes confirmed records, uncertainty, and the next useful check. Evidence sources and the full timeline expand on request. Merchant notes are labeled unverified, and the editable merchant response can be saved, copied, or downloaded for review. No PayPal dispute API or submission integration is implemented or implied, and PayPal remains the final decision-maker. One fictional complaint is seeded against the failed-payment demo order. Groq uses `GROQ_API_KEY`; `GROQ_MODEL` and `GROQ_FALLBACK_MODEL` are optional, and template fallbacks remain available. To activate sign-in, set `OWNER_EMAIL`, `OWNER_PASSWORD_HASH`, and `SESSION_SECRET` in `.env`; set `CONNECTOR_SHARED_SECRET` to enable the connector. AG Studio and AG Grid are not integrated yet; their licensed package/setup and custom-widget work remain open, so do not describe the custom console or queue as AG Studio/AG Grid. Phase 0 sandbox verification remains unrun, so real PayPal behavior remains unverified and deferred to Phase 6.

**Risk:** PayPal is the central judging requirement and the biggest unknown, and Phase 6 has three days. If it slips, Stage One (reasonable use of PayPal) is at risk. Mitigations: the Phase 0 probe, the adapter interface, and cutting Phase 5 extras and Render first.

## 13. Open items
APIMatic runtime use (unverified); AG Studio Agent Framework with Groq; AG trial expiry versus judging ending Dec 15; boilerplate license; Groq rate limits; whether Antigravity supports the APIMatic MCP plugin.
