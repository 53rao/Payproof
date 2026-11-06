import { NextResponse } from "next/server";

export async function POST(request: Request) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const secret = process.env.CONNECTOR_SHARED_SECRET;
  if (!secret) return NextResponse.json({ error: "Set CONNECTOR_SHARED_SECRET in .env and restart the dev server." }, { status: 503 });
  try {
    const target = new URL("/api/connector/checkout", request.url);
    const response = await fetch(target, {
      method: "POST",
      headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" },
      body: await request.text(),
      cache: "no-store",
    });
    const body = await response.text();
    return new NextResponse(body, { status: response.status, headers: { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The local connector endpoint could not be reached." }, { status: 502 });
  }
}
