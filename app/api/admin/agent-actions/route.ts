import { NextResponse } from "next/server";
import { hasOwnerSession } from "@/lib/auth";
import { getRecentAgentActions } from "@/lib/agent-action-log";

export async function GET() {
  if (!await hasOwnerSession()) {
    return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    return NextResponse.json({ actions: await getRecentAgentActions(20) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Agent actions could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
