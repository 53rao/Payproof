# PayProof Network

## Platform

Web application and payment intelligence layer for commerce platforms.

## Users

Platform operators monitor payment patterns across connected merchants. Merchants review their own payment outcomes, cases, and recommended actions. Customers may use an eligible recovery checkout or report an order problem.

## Product purpose

PayProof turns checkout outcomes into clear explanations and appropriate next steps. It distinguishes human, agent, and unknown checkout origins, helps recover eligible human failures, routes agent failures to structured responses and human review, and detects patterns across merchants.

## Operating context

The current integration uses Braintree Sandbox and fictional demo data. The admin Network Overview presents incidents, diagnostic insights, agent actions, and merchant health. The merchant portal is scoped to one merchant. Cases include transaction records, evidence, and reviewable customer response drafts.

## Capabilities and constraints

- Checkout uses Braintree Sandbox and Hosted Fields; simulated fallback behavior is labeled.
- Diagnostics use transaction signals and present likely causes as hypotheses with evidence and confidence.
- Groq analysis is grounded in recorded transaction data and is advisory.
- Human failures may receive single-use recovery links. Agent failures receive structured guidance and can require human review.
- Admins review notification drafts. Notifications are not sent automatically.
- PayProof does not manage inventory, move money autonomously, or make payment dispute decisions.
- Neon Postgres persistence is optional through Prisma.

## Product principles

- Explain the observed payment signals in language merchants can act on.
- Make evidence and uncertainty visible.
- Keep merchant data isolated.
- Preserve human control over external actions.
- Clearly label Sandbox and fictional records.
