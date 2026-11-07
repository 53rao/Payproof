export type DemoCase = { id: string; orderId: string; issue: string; debug_id?: string; createdAt: string; status: "OPEN"; agentHandled?: boolean; humanReviewRequired?: boolean };
export type DemoOrder = { id: string; amount: number; status: string; createdAt: string; issue?: string; debug_id?: string; transactionId?: string; items: { id: string; quantity: number }[]; recoveredFromOrderId?: string; origin?: "AGENT" | "HUMAN" | "UNKNOWN" };
export type DemoState = {
  simulated: true;
  storage: string;
  orders: DemoOrder[];
  cases: DemoCase[];
  counters: { paymentEvents: number; failedPayments: number; openCases: number; agentFailureCases: number; humanFailureCases: number; recoveredRevenue: number; recoveredOrders: number };
};
export type FeedEvent = { kind: "Payments"; title: string; ref: string; detail: string; time: string; failed: boolean };
export type IconName = "grid" | "chart" | "shield" | "receipt" | "box" | "chevron" | "search" | "refresh" | "info" | "alert" | "arrow" | "filter" | "check" | "minus" | "expand";
