import { NextResponse } from "next/server";
import { captureDemoOrder } from "@/lib/demo-store";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid capture request." }, { status: 400 });
    const { orderId, outcome } = body as { orderId?: unknown; outcome?: unknown };
    if (typeof orderId !== "string" || !/^SIM-[A-F0-9]{8}$/.test(orderId) || !["success", "decline", "duplicate"].includes(String(outcome))) return NextResponse.json({ error: "Invalid capture request." }, { status: 400 });
    const result = await captureDemoOrder(orderId, outcome as "success" | "decline" | "duplicate");
    return NextResponse.json({ payment: { status: result.payment.status, issue: result.payment.issue, debug_id: result.payment.debug_id }, simulated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not complete simulated payment." }, { status: 400 });
  }
}
