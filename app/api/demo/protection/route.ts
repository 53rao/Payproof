import { NextResponse } from "next/server";
import { setProtection } from "@/lib/demo-store";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
export async function POST(request: Request) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401 });
  try { const body: unknown = await request.json(); if (!body || typeof body !== "object" || typeof (body as { enabled?: unknown }).enabled !== "boolean") return NextResponse.json({ error: "enabled must be a boolean." }, { status: 400 }); return NextResponse.json(await setProtection((body as { enabled: boolean }).enabled)); }
  catch { return NextResponse.json({ error: "Invalid protection setting." }, { status: 400 }); }
}
