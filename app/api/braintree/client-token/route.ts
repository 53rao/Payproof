import { NextResponse } from "next/server";
import { createBraintreeClientToken, isBraintreeConfigured } from "@/lib/braintree";

export async function GET() {
  if (!isBraintreeConfigured()) {
    return NextResponse.json({ configured: false, environment: "sandbox" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const clientToken = await createBraintreeClientToken();
    return NextResponse.json({ configured: true, environment: "sandbox", clientToken }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : error && typeof error === "object" && "type" in error && typeof error.type === "string"
        ? error.type
        : "UNKNOWN";
    console.error(`Braintree Sandbox client-token request failed (${code}).`);
    return NextResponse.json({ configured: true, error: "Braintree Sandbox could not issue a client token. Check the server’s connection to Braintree Sandbox." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
