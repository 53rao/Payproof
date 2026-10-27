import { NextResponse } from "next/server";
import { hasOwnerSession } from "@/lib/auth";
import { listOwnerCases } from "@/lib/customer-case-store";

export async function GET() {
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try { return NextResponse.json({ cases: await listOwnerCases() }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return NextResponse.json({ error: "The case list could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
}
