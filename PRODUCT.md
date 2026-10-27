# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Customers reporting an order problem and merchants reviewing payment incidents, complaints, and evidence in a simulated PayPal checkout. Merchants need to diagnose incidents, understand what records do and do not establish, and prepare an evidence-backed response.

## Product Purpose

PayProof gives merchants a clear view of checkout events, payment outcomes, inventory reservations, and related cases. Customers can attach an unchanged complaint to an order they can access. Merchants review that complaint beside scoped store records and prepare a merchant-owned evidence report while keeping missing information and uncertainty visible.

## Positioning

PayProof connects payment events to stock reservations and case evidence, so a merchant can see the operational consequence of a payment failure in the same workflow.

## Operating Context

The web app has a demo storefront at `/`, customer order support at `/report-problem`, a merchant console at `/admin`, and a private case workspace at `/owner/cases` and `/owner/cases/[caseId]`. Operators review payment and order activity, inspect cases and evidence, monitor inventory, and toggle the simulated stock-protection behavior. The current experience is a fictional demo workspace.

## Capabilities and Constraints

- Checkout, payment outcomes, and incident records use a simulated payment provider; no live PayPal transaction is performed.
- Owner pages and case APIs require a signed owner session. Customer complaint access is scoped to orders with an HTTP-only order-access cookie.
- Customer complaint text is stored verbatim. It is separate from owner-edited report drafts.
- The evidence assistant can read only case-scoped order, payment, reservation, complaint, and manually entered notice records. AI explanations remain suggestions, not evidence or decisions.
- There is no verified PayPal dispute notification or evidence-submission integration. Owners may enter notice details manually and copy or download their report for submission through PayPal's appropriate process.
- Payment records support investigation but do not establish customer intent or fulfillment.
- The app can persist its demo ledger to Neon Postgres through Prisma when `DATABASE_URL` is configured.

## Evidence on Hand

- The source of product and workflow requirements is `PAYPROOF_DEV_README.md`.
- The running app and fictional catalog are the available product evidence. Customer names, orders, payment outcomes, and incident records in the demo are illustrative, not real customer data.

## Product Principles

- Make the relationship between a payment event and its inventory effect visible.
- Keep simulated records clearly labeled as simulated.
- Show evidence and uncertainty without inferring customer intent.
- Keep merchant review and control in the workflow.
