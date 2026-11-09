import { NextResponse } from "next/server";
import { getMerchantSession } from "@/lib/auth";
import { listOwnerCases } from "@/lib/customer-case-store";

/**
 * Merchant-scoped case list. This intentionally ignores any owner session so a
 * shared browser can never surface every merchant's cases in the merchant portal.
 */
export async function GET() {
  const session = await getMerchantSession();
  if (!session) {
    return NextResponse.json({ error: "Merchant sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const cases = (await listOwnerCases()).filter((item) => item.merchantId === session.merchantId);
    return NextResponse.json({ cases }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Merchant case list query failed:", error);
    return NextResponse.json({ error: "Your cases could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
