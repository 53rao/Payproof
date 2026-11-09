"use client";
import { useEffect, useState } from "react";

type MerchantMetrics = { id: string; name: string; paymentEvents: number; failedPayments: number; recoveredRevenue: number; recoveredOrders: number; orderCount?: number };

export function MerchantAnalytics() {
  const [merchants, setMerchants] = useState<MerchantMetrics[]>([]);
  const [loading, setLoading] = useState(true);
  const [uniqueEvents, setUniqueEvents] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const r = await fetch("/api/demo/merchant-analytics", { cache: "no-store" });
        const body = await r.json();
        if (!r.ok) throw new Error(body.error ?? "Merchant analytics could not be loaded.");
        if (active) {
          setMerchants(body.merchants ?? []);
          setUniqueEvents(typeof body.uniquePaymentEvents === "number" ? body.uniquePaymentEvents : null);
          setError("");
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Merchant analytics could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const attributedEvents = merchants.reduce((total, merchant) => total + merchant.paymentEvents, 0);
  const overlappingEvents = uniqueEvents === null ? null : Math.max(0, attributedEvents - uniqueEvents);

  return <section className="pp-merchant-analytics" aria-labelledby="pp-merchant-analytics-title">
    <header><div><h2 id="pp-merchant-analytics-title">Merchant Analytics</h2><p>Attributed payment outcomes across connected merchants.</p></div></header>
    {error ? <p role="alert">{error}</p> : loading && !merchants.length ? <MerchantAnalyticsSkeleton/> : <>
      <div className="pp-merchant-analytics-table" role="table" aria-label="Merchant analytics">
        <div className="pp-merchant-analytics-row pp-merchant-analytics-head" role="row"><span role="columnheader">Merchant</span><span role="columnheader">Events*</span><span role="columnheader">Failed</span><span role="columnheader">Recovered sales</span><span role="columnheader">Health</span></div>
        {merchants.map((m) => {
          const eventCount = m.paymentEvents;
          const failureRate = m.orderCount ? m.failedPayments / m.orderCount : 0;
          const health = eventCount < 10 ? "limited" : failureRate < 0.10 ? "healthy" : failureRate < 0.31 ? "elevated" : failureRate < 0.80 ? "high" : "critical";
          const healthLabel = health === "limited" ? "Low data" : health === "critical" ? "Critical" : health === "high" ? "High" : health === "elevated" ? "Elevated" : "Healthy";
          return <div className="pp-merchant-analytics-row" role="row" key={m.id}><b role="cell">{m.name}</b><span role="cell">{eventCount}</span><span role="cell">{m.failedPayments}</span><span role="cell">${m.recoveredRevenue.toLocaleString("en-US", { maximumFractionDigits: 0 })} · {m.recoveredOrders} orders</span><span role="cell"><b className={`pp-health-badge ${health}`}>{healthLabel}</b></span></div>;
        })}
      </div>
      <p className="pp-merchant-analytics-foot">* {uniqueEvents === null ? "Events are grouped by merchant ownership; mixed-merchant orders may overlap." : `${attributedEvents} merchant attributions across ${uniqueEvents} unique events${overlappingEvents ? ` (${overlappingEvents} event attributions overlap across merchant rows)` : ""}.`}</p>
    </>}
  </section>;
}

function MerchantAnalyticsSkeleton() {
  return <>
    <div className="pp-merchant-analytics-table" role="status" aria-label="Loading merchant analytics">
      <div className="pp-merchant-analytics-row pp-merchant-analytics-head" role="row"><span role="columnheader">Merchant</span><span role="columnheader">Events*</span><span role="columnheader">Failed</span><span role="columnheader">Recovered sales</span><span role="columnheader">Health</span></div>
      {[0, 1, 2, 3, 4].map((row) => <div className="pp-merchant-analytics-row pp-merchant-analytics-skeleton" role="row" key={row}>
        <span role="cell"><span className="pp-skeleton pp-skeleton-line" style={{ width: "68%" }}/></span>
        <span role="cell"><span className="pp-skeleton pp-skeleton-line" style={{ width: "38%" }}/></span>
        <span role="cell"><span className="pp-skeleton pp-skeleton-line" style={{ width: "38%" }}/></span>
        <span role="cell"><span className="pp-skeleton pp-skeleton-line" style={{ width: "78%" }}/></span>
        <span role="cell"><span className="pp-skeleton pp-skeleton-badge"/></span>
      </div>)}
    </div>
    <p className="pp-merchant-analytics-foot pp-skeleton-foot"><span className="pp-skeleton pp-skeleton-line" style={{ width: "52%" }}/></p>
  </>;
}
