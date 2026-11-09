"use client";
import { useEffect, useState } from "react";

type MerchantCases = { id: string; name: string; openCases: number; casesNeedingAction: number };

export function MerchantCaseBreakdown() {
  const [merchants, setMerchants] = useState<MerchantCases[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/demo/merchant-analytics", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Merchant case counts could not be loaded.");
        if (active) { setMerchants(body.merchants ?? []); setError(""); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Merchant case counts could not be loaded.");
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

  if (error) return <p className="pp-assist-error" role="alert">{error}</p>;
  if (loading && !merchants.length) return <div className="pp-assist-case-breakdown pp-assist-case-loading" role="status" aria-label="Loading case activity">
    {[0, 1, 2, 3, 4].map((row) => <div className="pp-assist-merchant pp-assist-merchant-skeleton" key={row}>
      <span className="pp-skeleton pp-skeleton-line" style={{ width: "46%" }}/>
      <span className="pp-skeleton pp-skeleton-line" style={{ width: "76%" }}/>
      <span className="pp-skeleton pp-skeleton-line" style={{ width: "64%" }}/>
      <span className="pp-skeleton pp-skeleton-line" style={{ width: "32%" }}/>
    </div>)}
  </div>;
  return <div className="pp-assist-case-breakdown" aria-live="polite">
    {merchants.map((merchant) => <div className="pp-assist-merchant" key={merchant.id}>
      <a href={`/admin/cases?merchantId=${encodeURIComponent(merchant.id)}`}>{merchant.name}</a>
      <span>Total open cases: {merchant.openCases ?? 0}</span>
      <span>Open human payment failures requiring merchant review: {merchant.casesNeedingAction ?? 0}</span>
      <b className={(merchant.casesNeedingAction ?? 0) > 0 ? "is-actionable" : "is-clear"}>{merchant.casesNeedingAction ?? 0} need action</b>
    </div>)}
  </div>;
}
