import { randomUUID } from "node:crypto";
import { captureBraintreeTransaction, isBraintreeConfigured } from "./braintree";

export type PaymentResult = {
  status: "COMPLETED" | "FAILED";
  issue?: string;
  debug_id?: string;
  transaction_id?: string;
  raw: Record<string, unknown>;
};

export interface PaymentProvider {
  createOrder(input: { items: { id: string; quantity: number }[]; idempotencyKey?: string }): Promise<{ id: string; amount: number }>;
  captureOrder(orderId: string, outcome?: "success" | "decline" | "duplicate", paymentMethodNonce?: string): Promise<PaymentResult>;
  isRealProvider(): boolean;
}

export class MockProvider implements PaymentProvider {
  isRealProvider() { return false; }

  async createOrder(input: { items: { id: string; quantity: number }[] }) {
    const { products } = await import("./products");
    const amount = input.items.reduce((sum, item) => {
      const product = products.find((product) => product.id === item.id);
      return sum + (product?.price ?? 0) * Math.max(0, Math.floor(item.quantity));
    }, 0);
    return { id: `SIM-${randomUUID().slice(0, 8).toUpperCase()}`, amount };
  }

  async captureOrder(orderId: string, outcome: "success" | "decline" | "duplicate" = "success"): Promise<PaymentResult> {
    if (outcome === "success") return { status: "COMPLETED", raw: { id: orderId, simulated: true } };
    const issue = outcome === "decline" ? "INSTRUMENT_DECLINED" : "DUPLICATE_INVOICE_ID";
    return { status: "FAILED", issue, debug_id: `SIM-${randomUUID().slice(0, 8)}`, raw: { id: orderId, simulated: true, issue } };
  }
}

/** Real Sandbox orders are local ledger IDs; Braintree creates the transaction on capture. */
export class BraintreeSandboxProvider implements PaymentProvider {
  private mock = new MockProvider();

  isRealProvider() { return isBraintreeConfigured(); }

  async createOrder(input: { items: { id: string; quantity: number }[]; idempotencyKey?: string }) {
    if (!isBraintreeConfigured()) return this.mock.createOrder(input);
    const { products } = await import("./products");
    const amount = input.items.reduce((sum, item) => {
      const product = products.find((product) => product.id === item.id);
      return sum + (product?.price ?? 0) * Math.max(0, Math.floor(item.quantity));
    }, 0);
    return { id: `BT-${randomUUID().toUpperCase()}`, amount };
  }

  async captureOrder(orderId: string, outcome: "success" | "decline" | "duplicate" = "success", paymentMethodNonce?: string) {
    if (!orderId.startsWith("BT-")) return this.mock.captureOrder(orderId, outcome);
    if (!paymentMethodNonce) throw new Error("Enter your payment details to continue with Braintree Sandbox.");
    return captureBraintreeTransaction(orderId, paymentMethodNonce);
  }
}

export const paymentProvider: PaymentProvider = new BraintreeSandboxProvider();
