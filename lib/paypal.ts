import { products } from "@/lib/products";
import type { PaymentResult } from "@/lib/payment-provider";

function getBaseUrl() {
  return process.env.PAYPAL_ENV === "production"
    ? "https://api-m.paypal.com"
    : "https://api-m.sandbox.paypal.com";
}

let tokenCache: { token: string; expiresAt: number } | null = null;

export function isPayPalConfigured(): boolean {
  return Boolean(
    process.env.PAYPAL_CLIENT_ID?.trim() &&
    process.env.PAYPAL_CLIENT_SECRET?.trim()
  );
}

export function getPayPalClientId(): string | null {
  return process.env.PAYPAL_CLIENT_ID?.trim() || null;
}

export async function getPayPalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim();
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET must be set in .env.");
  }

  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const response = await fetch(`${getBaseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`PayPal OAuth authentication failed (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache = {
    token: data.access_token,
    expiresAt: now + data.expires_in * 1000,
  };
  return data.access_token;
}

export async function createRealPayPalOrder(input: {
  items: { id: string; quantity: number }[];
  idempotencyKey?: string;
}): Promise<{ id: string; amount: number; raw?: Record<string, unknown> }> {
  const accessToken = await getPayPalAccessToken();
  const totalAmount = input.items.reduce((sum, item) => {
    const product = products.find((p) => p.id === item.id);
    return sum + (product?.price ?? 0) * Math.max(0, Math.floor(item.quantity));
  }, 0);

  const purchaseItems = input.items.map((item) => {
    const product = products.find((p) => p.id === item.id);
    return {
      name: product?.name ?? "Store Item",
      unit_amount: {
        currency_code: "USD",
        value: (product?.price ?? 0).toFixed(2),
      },
      quantity: String(Math.max(1, Math.floor(item.quantity))),
      category: "PHYSICAL_GOODS",
    };
  });

  const payload = {
    intent: "CAPTURE",
    purchase_units: [
      {
        reference_id: "default",
        description: "PayProof Store Order",
        amount: {
          currency_code: "USD",
          value: totalAmount.toFixed(2),
          breakdown: {
            item_total: {
              currency_code: "USD",
              value: totalAmount.toFixed(2),
            },
          },
        },
        items: purchaseItems,
      },
    ],
  };

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  if (input.idempotencyKey) {
    headers["PayPal-Request-Id"] = input.idempotencyKey;
  }

  const response = await fetch(`${getBaseUrl()}/v2/checkout/orders`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  const debugId = response.headers.get("paypal-debug-id") ?? undefined;
  const data = (await response.json()) as { id: string; status: string; [key: string]: unknown };

  if (!response.ok || !data.id) {
    const issue = (data as { details?: { issue?: string }[] }).details?.[0]?.issue ?? "ORDER_CREATION_FAILED";
    throw new Error(`PayPal order creation failed (${response.status}): ${issue}${debugId ? ` (debug_id: ${debugId})` : ""}`);
  }

  return { id: data.id, amount: totalAmount, raw: { ...data, debug_id: debugId } };
}

export async function captureRealPayPalOrder(
  orderId: string,
  outcome: "success" | "decline" | "duplicate" = "success"
): Promise<PaymentResult> {
  const accessToken = await getPayPalAccessToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  // Real sandbox negative testing triggers via PayPal-Mock-Response header
  if (outcome === "decline") {
    headers["PayPal-Mock-Response"] = JSON.stringify({
      mock_application_codes: "INSTRUMENT_DECLINED",
    });
  } else if (outcome === "duplicate") {
    headers["PayPal-Mock-Response"] = JSON.stringify({
      mock_application_codes: "DUPLICATE_INVOICE_ID",
    });
  }

  const response = await fetch(`${getBaseUrl()}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    headers,
    body: JSON.stringify({}),
  });

  const headerDebugId = response.headers.get("paypal-debug-id") ?? undefined;
  const rawJson = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  const bodyDebugId = typeof rawJson.debug_id === "string" ? rawJson.debug_id : undefined;
  const debug_id = bodyDebugId ?? headerDebugId;

  if (response.ok && (rawJson.status === "COMPLETED" || response.status === 201 || response.status === 200)) {
    return {
      status: "COMPLETED",
      debug_id,
      raw: { ...rawJson, debug_id, provider: "PayPal_Sandbox" },
    };
  }

  // Parse structured PayPal error details
  let issue = "PAYMENT_FAILED";
  if (Array.isArray(rawJson.details) && rawJson.details.length > 0) {
    const firstDetail = rawJson.details[0] as { issue?: string; description?: string };
    if (firstDetail?.issue) issue = firstDetail.issue;
  } else if (typeof rawJson.name === "string") {
    issue = rawJson.name;
  }

  return {
    status: "FAILED",
    issue,
    debug_id,
    raw: { ...rawJson, debug_id, provider: "PayPal_Sandbox", issue },
  };
}
