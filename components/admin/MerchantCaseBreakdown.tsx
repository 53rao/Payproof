"use client";
import { useEffect, useState } from "react";

type MerchantCases = { id: string; name: string; openCases: number; casesNeedingAction: number };

export function MerchantCaseBreakdown() {
  const [merchants, setMerchants] = useState<MerchantCases[]>([]);
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
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  if (error) return <p className="pp-assist-error" role="alert">{error}</p>;
  return <div className="pp-assist-case-breakdown" aria-live="polite">
    {merchants.map((merchant) => <div className="pp-assist-merchant" key={merchant.id}>
      <a href={`/owner/cases?merchantId=${encodeURIComponent(merchant.id)}`}>{merchant.name}</a>
      <span>Total open cases: {merchant.openCases ?? 0}</span>
      <span>Open human payment failures requiring merchant review: {merchant.casesNeedingAction ?? 0}</span>
      <b>{merchant.casesNeedingAction ?? 0} need action</b>
    </div>)}
  </div>;
}
