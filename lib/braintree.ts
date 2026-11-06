import type { PaymentResult } from "./payment-provider";

type TransactionResult = {
  success: boolean;
  transaction?: {
    id?: string;
    status?: string;
    processorResponseCode?: string;
    processorResponseText?: string;
  };
};

type BraintreeGatewayLike = {
  clientToken: { generate(options: Record<string, never>): Promise<{ clientToken: string }> };
  transaction: {
    sale(options: {
      amount: string;
      orderId: string;
      paymentMethodNonce: string;
      options: { submitForSettlement: true };
    }): Promise<TransactionResult>;
  };
};

type BraintreeModule = {
  Environment: { Sandbox: unknown };
  BraintreeGateway: new (options: {
    environment: unknown;
    merchantId: string;
    publicKey: string;
    privateKey: string;
  }) => BraintreeGatewayLike;
};

const braintree = require("braintree") as BraintreeModule;
const gatewayCache = globalThis as typeof globalThis & { payproofBraintreeGateway?: BraintreeGatewayLike };

export function isBraintreeConfigured(): boolean {
  return process.env.BRAINTREE_ENVIRONMENT?.trim().toLowerCase() === "sandbox"
    && Boolean(process.env.BRAINTREE_MERCHANT_ID?.trim())
    && Boolean(process.env.BRAINTREE_PUBLIC_KEY?.trim())
    && Boolean(process.env.BRAINTREE_PRIVATE_KEY?.trim());
}

function getGateway(): BraintreeGatewayLike {
  if (!isBraintreeConfigured()) {
    throw new Error("Set the Braintree Sandbox environment and API credentials to enable card checkout.");
  }
  if (!gatewayCache.payproofBraintreeGateway) {
    gatewayCache.payproofBraintreeGateway = new braintree.BraintreeGateway({
      environment: braintree.Environment.Sandbox,
      merchantId: process.env.BRAINTREE_MERCHANT_ID!.trim(),
      publicKey: process.env.BRAINTREE_PUBLIC_KEY!.trim(),
      privateKey: process.env.BRAINTREE_PRIVATE_KEY!.trim(),
    });
  }
  return gatewayCache.payproofBraintreeGateway;
}

export async function createBraintreeClientToken(): Promise<string> {
  const result = await getGateway().clientToken.generate({});
  if (!result.clientToken) throw new Error("Braintree did not return a client token.");
  return result.clientToken;
}

export async function captureBraintreeTransaction(orderId: string, paymentMethodNonce: string): Promise<PaymentResult> {
  const order = await import("./demo-store").then(async ({ getDemoState }) => {
    const state = await getDemoState();
    return state.orders.find((candidate) => candidate.id === orderId);
  });
  if (!order) throw new Error("Order not found in the payment ledger.");

  const result = await getGateway().transaction.sale({
    amount: order.amount.toFixed(2),
    orderId,
    paymentMethodNonce,
    options: { submitForSettlement: true },
  });

  const transaction = result.transaction;
  const transactionId = transaction?.id;
  const status = transaction?.status ?? (result.success ? "submitted_for_settlement" : "failed");
  if (result.success) {
    return {
      status: "COMPLETED",
      transaction_id: transactionId,
      raw: { provider: "Braintree_Sandbox", simulated: false, transactionId, status },
    };
  }

  const issue = transaction?.processorResponseCode ?? status.toUpperCase();
  return {
    status: "FAILED",
    issue,
    transaction_id: transactionId,
    raw: {
      provider: "Braintree_Sandbox",
      simulated: false,
      transactionId,
      status,
      processorResponseCode: transaction?.processorResponseCode,
      processorResponseText: transaction?.processorResponseText,
    },
  };
}
