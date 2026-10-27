import { isPayPalConfigured, createRealPayPalOrder, captureRealPayPalOrder } from "./paypal";

export type PaymentResult = { status: "COMPLETED" | "FAILED"; issue?: string; debug_id?: string; raw: Record<string, unknown>; };
export interface PaymentProvider {
  createOrder(input: { items: { id: string; quantity: number }[]; idempotencyKey?: string }): Promise<{ id: string; amount: number }>;
  captureOrder(orderId: string, outcome?: "success" | "decline" | "duplicate"): Promise<PaymentResult>;
  isRealProvider(): boolean;
}

export class MockProvider implements PaymentProvider {
  isRealProvider() { return false; }
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

export class PayPalProvider implements PaymentProvider {
  isRealProvider() { return true; }
  async createOrder(input: { items: { id: string; quantity: number }[]; idempotencyKey?: string }) {
    return createRealPayPalOrder(input);
  }
  async captureOrder(orderId: string, outcome: "success" | "decline" | "duplicate" = "success"): Promise<PaymentResult> {
    return captureRealPayPalOrder(orderId, outcome);
  }
}

export class HybridPaymentProvider implements PaymentProvider {
  private mock = new MockProvider();
  private paypal = new PayPalProvider();

  isRealProvider() {
    return isPayPalConfigured();
  }

  async createOrder(input: { items: { id: string; quantity: number }[]; idempotencyKey?: string }) {
    if (isPayPalConfigured()) {
      try {
        return await this.paypal.createOrder(input);
      } catch (error) {
        console.warn("PayPal Sandbox order creation failed, falling back to MockProvider:", error);
      }
    }
    return this.mock.createOrder(input);
  }

  async captureOrder(orderId: string, outcome: "success" | "decline" | "duplicate" = "success"): Promise<PaymentResult> {
    if (isPayPalConfigured() && !orderId.startsWith("SIM-")) {
      try {
        return await this.paypal.captureOrder(orderId, outcome);
      } catch (error) {
        console.warn("PayPal Sandbox capture failed, falling back to MockProvider:", error);
      }
    }
    return this.mock.captureOrder(orderId, outcome);
  }
}

export const paymentProvider: PaymentProvider = new HybridPaymentProvider();
