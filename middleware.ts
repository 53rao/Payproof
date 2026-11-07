import { NextRequest, NextResponse } from "next/server";
import { MERCHANT_SESSION_COOKIE, OWNER_SESSION_COOKIE } from "@/lib/auth-constants";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Merchant Portal protection
  const isMerchantLogin = pathname === "/merchant/login" || pathname === "/api/merchant/auth";
  const isMerchantPage = (pathname === "/merchant" || pathname.startsWith("/merchant/")) && !isMerchantLogin;
  const isMerchantApi = pathname.startsWith("/api/merchant/") && pathname !== "/api/merchant/auth";

  if (isMerchantPage || isMerchantApi) {
    if (request.cookies.has(MERCHANT_SESSION_COOKIE)) return NextResponse.next();
    if (isMerchantApi) {
      return NextResponse.json({ error: "Merchant sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }
    const login = new URL("/merchant/login", request.url);
    login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  // Allow merchant session for case viewing/modal reuse
  const isCaseRoute = pathname.startsWith("/owner/cases") || pathname.startsWith("/api/owner/cases");
  if (isCaseRoute && request.cookies.has(MERCHANT_SESSION_COOKIE)) return NextResponse.next();

  // Owner protection
  const isOwnerPage = pathname === "/admin" || pathname.startsWith("/admin/") || pathname === "/owner" || pathname.startsWith("/owner/");
  const isOwnerApi = pathname.startsWith("/api/demo/") || pathname.startsWith("/api/owner/");
  if (!isOwnerPage && !isOwnerApi) return NextResponse.next();
  if (request.cookies.has(OWNER_SESSION_COOKIE)) return NextResponse.next();
  if (isOwnerApi) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/owner/:path*",
    "/api/demo/:path*",
    "/api/owner/:path*",
    "/merchant/:path*",
    "/api/merchant/:path*",
  ],
};

