import { NextResponse } from "next/server";
import { getDemoState } from "@/lib/demo-store";
import { hasOwnerSession } from "@/lib/auth";
export async function GET() {
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json(await getDemoState(), { headers: { "Cache-Control": "no-store" } });
}
