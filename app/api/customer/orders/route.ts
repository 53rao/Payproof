import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { listCustomerOrders } from "@/lib/customer-case-store";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export async function GET() {
  try {
    const cookieStore = await cookies();
    const ownCookies = cookieStore.getAll().filter((cookie) => /^payproof_order_([A-Z0-9-]{10,40}|SIM-[A-F0-9]{8}|DEMO-ORDER-[A-Z0-9-]+)$/i.test(cookie.name) && /^[a-zA-Z0-9-]{16,80}$/.test(cookie.value)).slice(0, 30);
    const orders = await listCustomerOrders([...new Set(ownCookies.map((cookie) => hash(cookie.value)))]);
    return NextResponse.json({ orders }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Your saved orders could not be loaded." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
