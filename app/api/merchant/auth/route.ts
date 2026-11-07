import { NextResponse } from "next/server";
import { getDatabase } from "@/db/client";
import { DEMO_MERCHANTS } from "@/lib/merchants";
import {
  createMerchantSession,
  getMerchantSession,
  verifyPassword,
  verifyRequestOrigin,
} from "@/lib/auth";
import {
  MERCHANT_SESSION_COOKIE,
  MERCHANT_SESSION_TTL_SECONDS,
} from "@/lib/auth-constants";

export async function GET() {
  const session = await getMerchantSession();
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  return NextResponse.json({
    authenticated: true,
    merchantId: session.merchantId,
    merchantName: session.merchantName,
    email: session.email,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  if (!verifyRequestOrigin(request)) {
    return NextResponse.json({ error: "Sign-in request origin was not accepted." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return NextResponse.json({ error: "Send credentials as JSON." }, { status: 415 });
  }

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Enter your merchant email and password." }, { status: 400 });
    }
    const { email, password } = body as { email?: unknown; password?: unknown };
    if (
      typeof email !== "string" ||
      email.length > 254 ||
      typeof password !== "string" ||
      password.length > 1024
    ) {
      return NextResponse.json({ error: "Enter your merchant email and password." }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const db = getDatabase();

    let merchant: { id: string; name: string; email: string | null; passwordHash: string | null; simulated: boolean } | null = null;

    if (db) {
      merchant = await db.merchant.findUnique({
        where: { email: cleanEmail },
        select: { id: true, name: true, email: true, passwordHash: true, simulated: true },
      });
    }

    const demoMerchant = DEMO_MERCHANTS.find((candidate) => candidate.email === cleanEmail);
    // Use the published demo credential for fictional accounts even when a stale
    // password hash exists in the local database. Real merchant accounts always
    // continue to authenticate against their stored password hash.
    if (demoMerchant && (!merchant || (merchant.simulated && merchant.id === demoMerchant.id))) {
      const valid = password === demoMerchant.defaultPassword
        || Boolean(merchant?.passwordHash && await verifyPassword(password, merchant.passwordHash));
      if (!valid) {
        return NextResponse.json({ error: "Email or password did not match." }, { status: 401 });
      }
      if (!merchant) {
        merchant = {
          id: demoMerchant.id,
          name: demoMerchant.name,
          email: cleanEmail,
          passwordHash: null,
          simulated: true,
        };
      }
    } else {
      if (!merchant || !merchant.passwordHash) {
        return NextResponse.json({ error: "Email or password did not match." }, { status: 401 });
      }
      const passwordMatches = await verifyPassword(password, merchant.passwordHash);
      if (!passwordMatches) {
        return NextResponse.json({ error: "Email or password did not match." }, { status: 401 });
      }
    }

    const sessionPayload = {
      merchantId: merchant.id,
      merchantName: merchant.name,
      email: cleanEmail,
    };

    const token = createMerchantSession(sessionPayload);
    const response = NextResponse.json({
      authenticated: true,
      merchantId: merchant.id,
      merchantName: merchant.name,
    });

    response.cookies.set(MERCHANT_SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: MERCHANT_SESSION_TTL_SECONDS,
    });
    response.headers.set("Cache-Control", "no-store");

    return response;
  } catch {
    return NextResponse.json({ error: "Could not sign in. Try again." }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  if (!verifyRequestOrigin(request)) {
    return NextResponse.json({ error: "Sign-out request origin was not accepted." }, { status: 403 });
  }
  const response = NextResponse.json({ authenticated: false });
  response.cookies.set(MERCHANT_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  response.headers.set("Cache-Control", "no-store");
  return response;
}
