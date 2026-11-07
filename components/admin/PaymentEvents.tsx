import { memo } from "react";
import type { DemoState } from "./types";
import { Icon } from "./Icon";

export const PaymentEvents = memo(function PaymentEvents({ data, failedRate, failedOrders, totalOrders }: {
  data: DemoState | null; failedRate: number; failedOrders: number; totalOrders: number;
}) {
  const outcomes = (data?.orders ?? []).reduce((counts, order) => {
    if (order.status === "FAILED") counts.failed += 1;
    else if (order.status === "PAID" || order.status === "COMPLETED") counts.successful += 1;
    else counts.pending += 1;
    return counts;
  }, { failed: 0, successful: 0, pending: 0 });
  const outcomeTotal = outcomes.failed + outcomes.successful + outcomes.pending;
  const outcomePercent = (count: number) => outcomeTotal ? (count / outcomeTotal) * 100 : 0;
  const recentFailures = (data?.orders ?? []).filter((order) => order.status === "FAILED");
  const failureCodes = recentFailures.map((order) => order.issue?.trim()).filter((issue): issue is string => Boolean(issue));
  const codeCounts = failureCodes.reduce<Record<string, number>>((counts, code) => { counts[code] = (counts[code] ?? 0) + 1; return counts; }, {});
  const dominantCodeShare = recentFailures.length ? Math.max(0, ...Object.values(codeCounts)) / recentFailures.length : 0;
  const failureClassification = recentFailures.length < 3 ? "Insufficient data" : dominantCodeShare >= 0.6 ? "Likely merchant configuration issue" : new Set(failureCodes).size > 1 ? "Likely buyer funding issues" : "Mixed signals — review cases";
  return <section className="pp-screen" id="events">
    <article className="pp-panel pp-events"><div className="pp-panel-head"><div><h2>Payment events</h2><p>Recent checkout outcomes across connected merchants.</p></div></div><div className="pp-chart-summary"><strong>{failedRate}<small>%</small></strong><span>failed checkout rate<br/><b>{failedOrders} failed</b> of {totalOrders} orders<br/><em className="pp-failure-classification">{failureClassification}</em>{(totalOrders > 0 && failedOrders / totalOrders > .6) && <small className="pp-reset-context">Based on last 12 orders — reset demo to clear simulation history.</small>}</span></div><div className="pp-outcome-breakdown"><div className="pp-outcome-heading"><b>Outcome mix</b><span>{outcomeTotal} recent orders</span></div>{outcomeTotal ? <><div className="pp-outcome-track" role="img" aria-label={`${outcomes.failed} failed, ${outcomes.successful} successful, ${outcomes.pending} pending orders`}>{outcomes.failed > 0 && <i className="failed" style={{ width: `${outcomePercent(outcomes.failed)}%` }}/ >}{outcomes.successful > 0 && <i className="successful" style={{ width: `${outcomePercent(outcomes.successful)}%` }}/ >}{outcomes.pending > 0 && <i className="pending" style={{ width: `${outcomePercent(outcomes.pending)}%` }}/>}</div><div className="pp-outcome-legend"><span><i className="failed"/>Failed <b>{outcomes.failed}</b></span><span><i className="successful"/>Successful <b>{outcomes.successful}</b></span><span><i className="pending"/>Pending <b>{outcomes.pending}</b></span></div></> : <p className="pp-outcome-empty">No checkout outcomes yet.</p>}</div><div className="pp-chart-foot"><span>{data?.counters.paymentEvents ?? 0} unique payment events recorded</span><a href="#orders">View order activity <Icon name="arrow"/></a></div></article>
  </section>;
});
