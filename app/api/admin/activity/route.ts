import { NextResponse } from "next/server";
import { getOrderActivityList } from "@/lib/demo-store";
import { hasOwnerSession } from "@/lib/auth";

export async function GET() {
  if (!await hasOwnerSession()) {
    return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const orders = await getOrderActivityList();
    return NextResponse.json({
      environment: "Braintree Sandbox (Simulated)",
      orders,
      total: orders.length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load order activity." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}
