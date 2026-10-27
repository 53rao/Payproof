import { NextResponse } from "next/server";
import { resetDemo } from "@/lib/demo-store";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
export async function POST(request: Request) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401 });
  return NextResponse.json(await resetDemo(), { headers: { "Cache-Control": "no-store" } });
}
