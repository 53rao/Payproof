import { memo } from "react";
import type { DemoState } from "./types";
import { Icon } from "./Icon";
import { products } from "@/lib/products";

export const PaymentEvents = memo(function PaymentEvents({ data, failedRate, failedOrders, totalOrders, totalStock, updating, onToggle }: {
  data: DemoState | null; failedRate: number; failedOrders: number; totalOrders: number; totalStock: number; updating: boolean; onToggle: () => void;
}) {
  const outcomes = (data?.orders ?? []).reduce((counts, order) => {
    if (order.status === "FAILED") counts.failed += 1;
    else if (order.status === "PAID" || order.status === "COMPLETED") counts.successful += 1;
    else counts.pending += 1;
    return counts;
  }, { failed: 0, successful: 0, pending: 0 });
  const outcomeTotal = outcomes.failed + outcomes.successful + outcomes.pending;
  const outcomePercent = (count: number) => outcomeTotal ? (count / outcomeTotal) * 100 : 0;
  return <section className="pp-screen" id="events"><div className="pp-primary-grid">
    <article className="pp-panel pp-events"><div className="pp-panel-head"><div><h2>Payment events</h2><p>Recent outcomes from the simulated checkout</p></div><span className="pp-live-label">Auto-refreshes every 15 seconds</span></div><div className="pp-chart-summary"><strong>{failedRate}<small>%</small></strong><span>failed checkout rate<br/><b>{failedOrders} failed</b> of {totalOrders} orders</span></div><div className="pp-outcome-breakdown"><div className="pp-outcome-heading"><b>Outcome mix</b><span>{outcomeTotal} recent orders</span></div>{outcomeTotal ? <><div className="pp-outcome-track" role="img" aria-label={`${outcomes.failed} failed, ${outcomes.successful} successful, ${outcomes.pending} pending orders`}>{outcomes.failed > 0 && <i className="failed" style={{ width: `${outcomePercent(outcomes.failed)}%` }}/ >}{outcomes.successful > 0 && <i className="successful" style={{ width: `${outcomePercent(outcomes.successful)}%` }}/ >}{outcomes.pending > 0 && <i className="pending" style={{ width: `${outcomePercent(outcomes.pending)}%` }}/>}</div><div className="pp-outcome-legend"><span><i className="failed"/>Failed <b>{outcomes.failed}</b></span><span><i className="successful"/>Successful <b>{outcomes.successful}</b></span><span><i className="pending"/>Pending <b>{outcomes.pending}</b></span></div></> : <p className="pp-outcome-empty">No checkout outcomes yet.</p>}</div><div className="pp-chart-foot"><span>{data?.counters.paymentEvents ?? 0} payment events recorded</span><a href="#orders">View order activity <Icon name="arrow"/></a></div></article>
    <article className="pp-panel pp-safety"><div className="pp-safety-art" aria-hidden="true"><i/><i/><i/></div><div className="pp-panel-head"><div><h2>Order safety</h2><p>Automated stock protection</p></div><span className={`pp-auto-badge ${data?.protected ? "enabled" : ""}`}>{data?.protected ? "On" : "Off"}</span></div><div className="pp-safety-copy"><Icon name="shield"/><div><b>{data?.protected ? "Protection is on" : "Protection is off"}</b><p>{data?.protected ? "Release reserved inventory automatically when a simulated payment fails." : "Failed checkouts keep stock reserved until protection is enabled."}</p></div></div><button className={`pp-toggle ${data?.protected ? "on" : "off"}`} onClick={onToggle} disabled={!data || updating} aria-label="Toggle stock protection" aria-pressed={data?.protected ?? false}><i/></button><div className="pp-protected-total"><strong>{totalStock}</strong><span>available units across {products.length} products</span></div><div className="pp-safety-foot"><span><i className={data?.protected ? "" : "paused"}/>{data?.protected ? "Protection active" : "Protection paused"}</span><span>Demo control</span></div></article>
  </div></section>;
});
