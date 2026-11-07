import { memo } from "react";
import type { DemoState } from "./types";
import { Icon } from "./Icon";
import { money } from "./format";
import { products } from "@/lib/products";
import { PRODUCT_TO_MERCHANT_NAME } from "@/lib/merchants";
import { MerchantCaseBreakdown } from "./MerchantCaseBreakdown";

export const OrderManagement = memo(function OrderManagement({ data, loading, totalOrders }: { data: DemoState | null; loading: boolean; totalOrders: number }) {
  const recentCount = Math.min(data?.orders.length ?? 0, 4);
  return <section className="pp-screen" id="orders"><div className="pp-secondary-grid">
    <article className="pp-assist"><div className="pp-assist-art"><i/><i/><i/></div><div className="pp-assist-content"><div className="pp-assist-brand"><span>PayProof</span><small>AI ASSIST</small></div><h2>Case activity by merchant</h2><MerchantCaseBreakdown/><a href="/owner/cases" className="pp-assist-link"><span><Icon name="arrow"/></span>Review open cases</a></div></article>
    <article className="pp-panel pp-orders-preview"><div className="pp-panel-head"><div><h2>Recent orders</h2><p>{loading && !data ? "Loading recent orders…" : `Showing ${recentCount} most recent of ${totalOrders} orders`}</p></div></div>{data?.orders.length ? <div className="pp-order-preview-list">{data.orders.slice(0, 4).map((order) => { const productNames = order.items.map((item) => products.find((product) => product.id === item.id)?.name ?? item.id).join(", "); const merchantSet = [...new Set(order.items.map((item) => PRODUCT_TO_MERCHANT_NAME[item.id]).filter(Boolean))]; const merchantName = merchantSet.length === 1 ? merchantSet[0] : merchantSet.length > 1 ? "Multiple merchants" : "Unknown merchant"; const originLabel = order.origin === "AGENT" ? "Agent" : order.origin === "HUMAN" ? "Human" : "Unknown"; return <div className="pp-order-preview" key={order.id}><span className="pp-order-glyph"><Icon name="receipt"/></span><span className="pp-order-main"><b>{productNames || order.id}</b><small>{merchantName} · {originLabel} checkout</small><small className="pp-order-transaction">{order.transactionId ? `Transaction ID · ${order.transactionId}` : "Transaction ID unavailable"}</small></span><span className="pp-order-amount">{money(order.amount)}</span><span className={`pp-tag ${order.status.toLowerCase()}`}>{order.status}</span></div>; })}</div> : loading ? <LoadingLedger label="Loading recent orders…"/> : <div className="pp-empty-inline">No orders recorded yet.</div>}</article>
  </div></section>;
});

function LoadingLedger({ label }: { label: string }) { return <div className="pp-ledger-loading" role="status"><span className="pp-stream-mark" aria-hidden="true"><i/><i/><i/></span>{label}</div>; }
