import { NextResponse } from "next/server";
import { authenticateOwner, createOwnerSession, isOwnerLoginConfigured, verifyRequestOrigin } from "@/lib/auth";
import { OWNER_SESSION_COOKIE, OWNER_SESSION_TTL_SECONDS } from "@/lib/auth-constants";

export async function POST(request: Request) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Sign-in request origin was not accepted." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Send credentials as JSON." }, { status: 415 });
  if (!isOwnerLoginConfigured()) return NextResponse.json({ error: "Owner sign-in is not configured. Set OWNER_EMAIL, OWNER_PASSWORD_HASH, and SESSION_SECRET in .env." }, { status: 503 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Enter your owner email and password." }, { status: 400 });
    const { email, password } = body as { email?: unknown; password?: unknown };
    if (typeof email !== "string" || email.length > 254 || typeof password !== "string" || password.length > 1024) return NextResponse.json({ error: "Enter your owner email and password." }, { status: 400 });
    if (!await authenticateOwner(email, password)) return NextResponse.json({ error: "Email or password did not match." }, { status: 401 });
    const response = NextResponse.json({ authenticated: true });
    response.cookies.set(OWNER_SESSION_COOKIE, createOwnerSession(email), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: OWNER_SESSION_TTL_SECONDS });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    return NextResponse.json({ error: "Could not sign in. Try again." }, { status: 400 });
  }
}
