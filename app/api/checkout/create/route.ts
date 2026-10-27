import { NextResponse } from "next/server";
import { createDemoOrder } from "@/lib/demo-store";
import { products } from "@/lib/products";

export async function POST(request: Request) {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || !Array.isArray((body as { items?: unknown }).items)) return NextResponse.json({ error: "Invalid cart." }, { status: 400 });
    const { items: rawItems, idempotencyKey } = body as { items: unknown[]; idempotencyKey?: unknown };
    if (typeof idempotencyKey !== "string" || !/^[a-zA-Z0-9-]{16,80}$/.test(idempotencyKey)) return NextResponse.json({ error: "A valid idempotency key is required." }, { status: 400 });
    const items: { id: string; quantity: number }[] = [];
    for (const entry of rawItems) {
      if (!entry || typeof entry !== "object") return NextResponse.json({ error: "Invalid cart item." }, { status: 400 });
      const { id, quantity } = entry as { id?: unknown; quantity?: unknown };
      if (typeof id !== "string" || typeof quantity !== "number" || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || !products.some((p) => p.id === id)) return NextResponse.json({ error: "Invalid cart item." }, { status: 400 });
      const existing = items.find((item) => item.id === id);
      if (existing) existing.quantity += quantity; else items.push({ id, quantity });
    }
    if (!items.length) return NextResponse.json({ error: "Your bag is empty." }, { status: 400 });
    const order = await createDemoOrder(items, idempotencyKey);
    return NextResponse.json({ ...order, items, simulated: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create checkout." }, { status: 400 });
  }
}
