# PayPal Sandbox Verification & Adapter Results

## Status: Active in Phase 6

### Architecture & Verification
1. **Credentials Setup:**
   - Configured via `.env` with `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, and `PAYPAL_ENV=sandbox`.
   - Sandbox endpoints target `https://api-m.sandbox.paypal.com`.

2. **Order Creation & Approval Flow:**
   - Direct server-to-server creation at `POST /v2/checkout/orders` with verified `purchase_units` item breakdowns.
   - Idempotency enforced via `PayPal-Request-Id` header.
   - Client approval handled through the official PayPal JS SDK button container, rendering standard gold PayPal buttons in the storefront.

3. **Capture & Negative Testing:**
   - Synchronous capture at `POST /v2/checkout/orders/{id}/capture`.
   - Forced failure testing supported via `PayPal-Mock-Response` headers:
     - `{"mock_application_codes": "INSTRUMENT_DECLINED"}` yields HTTP 422 with issue `INSTRUMENT_DECLINED` and processor `debug_id`.
     - `{"mock_application_codes": "DUPLICATE_INVOICE_ID"}` triggers idempotency dispute simulation.

4. **Fallback:**
   - If sandbox credentials are not populated in `.env`, the adapter defaults gracefully to `MockProvider` and displays clear `SIMULATED` markers across the UI.
