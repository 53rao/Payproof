# APIMatic & PayPal API Evidence Log

## 1. PayPal Orders v2 REST Specification Review

### Endpoints Verified
- **OAuth 2.0 Token Generation:**
  - `POST /v1/oauth2/token`
  - Headers: `Authorization: Basic base64(client_id:client_secret)`, `Content-Type: application/x-www-form-urlencoded`
  - Body: `grant_type=client_credentials`
  - Response: `{ access_token, token_type, expires_in }`

- **Create Order:**
  - `POST /v2/checkout/orders`
  - Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`, `PayPal-Request-Id: <idempotency_key>`
  - Body:
    ```json
    {
      "intent": "CAPTURE",
      "purchase_units": [
        {
          "reference_id": "default",
          "amount": { "currency_code": "USD", "value": "28.00", "breakdown": { "item_total": { "currency_code": "USD", "value": "28.00" } } },
          "items": [{ "name": "...", "unit_amount": { "currency_code": "USD", "value": "28.00" }, "quantity": "1", "category": "PHYSICAL_GOODS" }]
        }
      ]
    }
    ```
  - Response: `{ id, status: "CREATED", links: [...] }`

- **Capture Order:**
  - `POST /v2/checkout/orders/{orderId}/capture`
  - Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`
  - Response (Success - 201 Created): `{ id, status: "COMPLETED", purchase_units: [...] }`
  - Header: `paypal-debug-id` captured on all requests for incident tracing.

## 2. Sandbox Negative Testing & Mock Application Codes

### Headers Used for Forced Error Simulation
- **Instrument Declined:**
  - Header: `PayPal-Mock-Response: {"mock_application_codes": "INSTRUMENT_DECLINED"}`
  - Target Status: HTTP 422 Unprocessable Entity
  - Payload: `{ "name": "UNPROCESSABLE_ENTITY", "details": [{ "issue": "INSTRUMENT_DECLINED" }], "debug_id": "..." }`
- **Duplicate Invoice ID:**
  - Header: `PayPal-Mock-Response: {"mock_application_codes": "DUPLICATE_INVOICE_ID"}`
  - Target Status: HTTP 422 Unprocessable Entity
  - Payload: `{ "name": "UNPROCESSABLE_ENTITY", "details": [{ "issue": "DUPLICATE_INVOICE_ID" }], "debug_id": "..." }`

## 3. Implementation Decision
- Implemented in `lib/paypal.ts` with direct, zero-dependency REST v2 calls compatible with Next.js 15 & React 19.
- Provider abstraction: `HybridPaymentProvider` in `lib/payment-provider.ts` delegates to `PayPalProvider` when credentials exist in `.env`, falling back cleanly to `MockProvider` when running in offline/mock demo mode.
- Frontend JS SDK integration: dynamically loads `https://www.paypal.com/sdk/js?client-id=...&currency=USD&components=buttons` in `app/page.tsx` and renders PayPal Buttons while preserving demo controls.
