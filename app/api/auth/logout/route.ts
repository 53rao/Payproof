import { NextResponse } from "next/server";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { OWNER_SESSION_COOKIE } from "@/lib/auth-constants";

export async function POST(request: Request) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Sign-out request origin was not accepted." }, { status: 403 });
  if (!await hasOwnerSession()) return NextResponse.json({ authenticated: false }, { status: 401 });
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(OWNER_SESSION_COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
