import { NextRequest, NextResponse } from "next/server";
import { OWNER_SESSION_COOKIE } from "@/lib/auth-constants";

export function middleware(request: NextRequest) {
  const isOwnerPage = request.nextUrl.pathname === "/admin" || request.nextUrl.pathname.startsWith("/admin/") || request.nextUrl.pathname === "/owner" || request.nextUrl.pathname.startsWith("/owner/");
  const isOwnerApi = request.nextUrl.pathname.startsWith("/api/demo/") || request.nextUrl.pathname.startsWith("/api/owner/");
  if (!isOwnerPage && !isOwnerApi) return NextResponse.next();
  if (request.cookies.has(OWNER_SESSION_COOKIE)) return NextResponse.next();
  if (isOwnerApi) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const login = new URL("/login", request.url);
  login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = { matcher: ["/admin/:path*", "/owner/:path*", "/api/demo/:path*", "/api/owner/:path*"] };
