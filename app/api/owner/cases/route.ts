import { NextResponse } from "next/server";
import { getMerchantSession, hasMerchantSession, hasOwnerSession } from "@/lib/auth";
import { listOwnerCases } from "@/lib/customer-case-store";

export async function GET() {
  const isOwner = await hasOwnerSession();
  const isMerchant = await hasMerchantSession();
  if (!isOwner && !isMerchant) {
    return NextResponse.json({ error: "Sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const allCases = await listOwnerCases();
    let merchantSession = null;
    if (!isOwner && isMerchant) {
      merchantSession = await getMerchantSession();
    }
    const cases = merchantSession
      ? allCases.filter((c) => c.merchantId === merchantSession.merchantId)
      : allCases;
    return NextResponse.json({ cases }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Owner case list query failed:", error);
    return NextResponse.json({ error: "The case list could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
