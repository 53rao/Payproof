import { NextResponse } from "next/server";
import { getDemoState } from "@/lib/demo-store";
import { hasOwnerSession } from "@/lib/auth";
export async function GET() {
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const startedAt = performance.now();
  const state = await getDemoState();
  const elapsedMs = (performance.now() - startedAt).toFixed(1);
  return NextResponse.json(state, { headers: { "Cache-Control": "no-store", "Server-Timing": `demo-state;dur=${elapsedMs}` } });
}
