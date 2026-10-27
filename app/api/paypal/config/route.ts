import { NextResponse } from "next/server";
import { getPayPalClientId, isPayPalConfigured } from "@/lib/paypal";

export async function GET() {
  const configured = isPayPalConfigured();
  const clientId = configured ? getPayPalClientId() : null;
  return NextResponse.json(
    {
      configured,
      clientId,
      currency: "USD",
      environment: process.env.PAYPAL_ENV === "production" ? "production" : "sandbox",
    },
    {
      headers: { "Cache-Control": "no-store, max-age=0" },
    }
  );
}
