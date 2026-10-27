# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Merchants and store operators monitoring payment failures and stock reservations in a simulated PayPal checkout. They need to diagnose incidents, understand what the records do and do not establish, and recover reserved stock.

## Product Purpose

PayProof gives merchants a clear view of checkout events, payment outcomes, inventory reservations, and related cases. Its demo flow shows how stock protection can release inventory after a failed payment while keeping the available evidence and uncertainty visible.

## Positioning

PayProof connects payment events to stock reservations and case evidence, so a merchant can see the operational consequence of a payment failure in the same workflow.

## Operating Context

The web app has a demo storefront at `/` and a merchant console at `/admin`. Operators review payment and order activity, inspect cases and evidence, monitor inventory, and toggle the simulated stock-protection behavior. The current experience is a fictional demo workspace.

## Capabilities and Constraints

- Checkout, payment outcomes, and incident records use a simulated payment provider; no live PayPal transaction is performed.
- The admin console currently has no authentication.
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
