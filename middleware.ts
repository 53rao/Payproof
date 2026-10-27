import { NextRequest, NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE } from "@/lib/auth-constants";

export function middleware(request: NextRequest) {
  const isAdminPage = request.nextUrl.pathname === "/admin" || request.nextUrl.pathname.startsWith("/admin/");
  const isAdminApi = request.nextUrl.pathname === "/api/demo/state" || request.nextUrl.pathname === "/api/demo/reset" || request.nextUrl.pathname === "/api/demo/protection";
  if (!isAdminPage && !isAdminApi) return NextResponse.next();
  if (request.cookies.has(OWNER_SESSION_COOKIE)) return NextResponse.next();
  if (isAdminApi) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/admin/:path*", "/api/demo/:path*"] };
