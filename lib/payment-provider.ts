export type PaymentResult = { status: "COMPLETED" | "FAILED"; issue?: string; debug_id?: string; raw: Record<string, unknown>; };
export interface PaymentProvider { createOrder(input: { items: { id: string; quantity: number }[] }): Promise<{ id: string; amount: number }>; captureOrder(orderId: string, outcome?: "success" | "decline" | "duplicate"): Promise<PaymentResult>; }

// SIMULATED provider for local product development. Replace only in Phase 6.
export class MockProvider implements PaymentProvider {
  async createOrder(input: { items: { id: string; quantity: number }[] }) {
    const { products } = await import("./products");
    const amount = input.items.reduce((sum, item) => {
      const product = products.find((p) => p.id === item.id);
      return sum + (product?.price ?? 0) * Math.max(0, Math.floor(item.quantity));
    }, 0);
    return { id: `SIM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, amount };
  }
  async captureOrder(orderId: string, outcome: "success" | "decline" | "duplicate" = "success"): Promise<PaymentResult> {
    if (outcome === "success") return { status: "COMPLETED", raw: { id: orderId, simulated: true } };
    return { status: "FAILED", issue: outcome === "decline" ? "INSTRUMENT_DECLINED" : "DUPLICATE_INVOICE_ID", debug_id: `SIM-${crypto.randomUUID().slice(0, 8)}`, raw: { id: orderId, simulated: true, issue: outcome === "decline" ? "INSTRUMENT_DECLINED" : "DUPLICATE_INVOICE_ID" } };
  }
}
export const paymentProvider: PaymentProvider = new MockProvider();
