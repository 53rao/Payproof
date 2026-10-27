export type DemoCase = { id: string; orderId: string; issue: string; debug_id?: string; createdAt: string; status: "OPEN" };
export type DemoOrder = { id: string; amount: number; status: string; createdAt: string; issue?: string; debug_id?: string; items: { id: string; quantity: number }[]; recoveredFromOrderId?: string };
export type DemoState = {
  simulated: true;
  storage: string;
  protected: boolean;
  stock: Record<string, number>;
  heldStock: Record<string, number>;
  committedStock: Record<string, number>;
  orders: DemoOrder[];
  cases: DemoCase[];
  counters: { paymentEvents: number; failedPayments: number; recoveredStock: number; stuckStock: number; openCases: number; recoveredRevenue: number; recoveredOrders: number };
};
export type FeedEvent = { kind: "Payments" | "Inventory"; title: string; ref: string; detail: string; time: string; failed: boolean };
export type IconName = "grid" | "chart" | "shield" | "receipt" | "box" | "chevron" | "search" | "refresh" | "info" | "alert" | "arrow" | "filter" | "check" | "minus" | "expand";
