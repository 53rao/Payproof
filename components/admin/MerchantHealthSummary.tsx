"use client";
import { useEffect, useState } from "react";

type MerchantHealth = {
  id: string;
  name: string;
  paymentEvents: number;
  failedPayments: number;
  orderCount?: number;
  openCases?: number;
  casesNeedingAction?: number;
};

export function MerchantHealthSummary() {
  const [merchants, setMerchants] = useState<MerchantHealth[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/demo/merchant-analytics", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Merchant health could not be loaded.");
        if (active) { setMerchants(body.merchants ?? []); setError(""); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Merchant health could not be loaded.");
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return <article
    className="pp-merchant-health"
    style={{ backgroundColor: "#17243b", color: "#ffffff", borderColor: "#23334d" }}
    aria-labelledby="pp-merchant-health-title"
  >
    <header className="pp-panel-head">
      <div>
        <h2 id="pp-merchant-health-title" style={{ color: "#ffffff" }}>Merchant Health Summary</h2>
        <p style={{ color: "#94a3b8" }}>Open cases and failure rates by merchant</p>
      </div>
    </header>
    {error ? <p className="pp-merchant-health-error" role="alert">{error}</p> : <div className="pp-merchant-health-list" role="table" aria-label="Merchant health summary">
      <div className="pp-merchant-health-row pp-merchant-health-head" role="row"><span role="columnheader">Merchant</span><span role="columnheader">Open cases</span><span role="columnheader">Failure rate</span><span role="columnheader">Health</span><span role="columnheader"/></div>
      {merchants.map((merchant) => {
        const eventCount = merchant.paymentEvents;
        const failureRate = merchant.orderCount ? merchant.failedPayments / merchant.orderCount : 0;
        const health = eventCount < 3 ? "limited" : failureRate >= .5 ? "critical" : failureRate >= .2 ? "watch" : "healthy";
        const label = health === "limited" ? "Low data" : health === "critical" ? "Critical" : health === "watch" ? "Watch" : "Healthy";
        return <div className="pp-merchant-health-row" role="row" key={merchant.id}>
          <span role="cell" className="pp-merchant-health-name">{merchant.name}</span>
          <span role="cell">{merchant.openCases ?? 0}</span>
          <span role="cell">{Math.round(failureRate * 100)}%</span>
          <span role="cell"><b className={`pp-health-badge ${health}`}>{label}</b></span>
          <span role="cell"><a href={`/owner/cases?merchantId=${encodeURIComponent(merchant.id)}`}>View cases</a></span>
        </div>;
      })}
    </div>}
  </article>;
}
