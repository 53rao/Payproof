"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { DemoState } from "@/components/admin/types";
import { SectionRail } from "@/components/admin/SectionRail";
import { DashboardHeader } from "@/components/admin/DashboardHeader";
import { NeedsAttentionStrip } from "@/components/admin/NeedsAttentionStrip";
import { MerchantAnalytics } from "@/components/admin/MerchantAnalytics";
import { TransactionSimulations } from "@/components/admin/TransactionSimulations";
import { PaymentEvents } from "@/components/admin/PaymentEvents";
import { OrderManagement } from "@/components/admin/OrderManagement";
import { AgentActions } from "@/components/admin/AgentActions";
import { Icon } from "@/components/admin/Icon";
import "./admin.css";

gsap.registerPlugin(useGSAP);

export default function AdminPage() {
  const rootRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<DemoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const { contextSafe } = useGSAP({ scope: rootRef });

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/demo/state", { cache: "no-store" });
      if (response.status === 401) { window.location.replace("/login?next=%2Fadmin"); return; }
      if (!response.ok) throw new Error("Could not load the demo ledger.");
      setData(await response.json() as DemoState);
      setError("");
    } catch (err) { setError(err instanceof Error ? err.message : "Could not load the demo ledger."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const failedOrders = data?.orders.filter((order) => order.status === "FAILED").length ?? 0;
  const totalOrders = data?.orders.length ?? 0;
  const failedRate = totalOrders ? Math.round((failedOrders / totalOrders) * 100) : 0;
  const reset = useCallback(contextSafe(async () => {
    if (updating) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.to(".pp-content", { opacity: 0.82, duration: 0.16 });
    setUpdating(true);
    try { const response = await fetch("/api/demo/reset", { method: "POST" }); if (!response.ok) throw new Error("Could not reset the demo."); setData(await response.json() as DemoState); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not reset the demo."); }
    finally { setUpdating(false); if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.to(".pp-content", { opacity: 1, duration: 0.22 }); }
  }), [contextSafe, updating]);
  const signOut = useCallback(async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { setError("Could not sign out. Refresh the desk and try again."); return; }
    window.location.replace("/login");
  }, []);

  return <main ref={rootRef} className="pp-shell pp-merchant-desk-shell">
    <SectionRail/>
    <div className="pp-app">
      <DashboardHeader onSignOut={signOut}/>
      <div className="pp-workspace pp-desk-workspace">
        <div className="pp-content">
          <div id="overview" className="pp-rail-anchor" aria-hidden="true"/>
          <NeedsAttentionStrip />
          {error && <div className="pp-error" role="alert">{error}</div>}
          <PaymentEvents data={data} loading={loading} failedRate={failedRate} failedOrders={failedOrders} totalOrders={totalOrders}/>
          <OrderManagement data={data} loading={loading} totalOrders={totalOrders}/>
          <section className="pp-screen pp-demo-tools" aria-labelledby="pp-demo-tools-title">
            <div className="pp-hero"><div className="pp-title"><h1 id="pp-demo-tools-title">Demo Tools</h1><p>Sandbox testing controls — not visible to merchants.</p></div></div>
            <button type="button" className="pp-reset-demo pp-demo-reset" onClick={() => void reset()} disabled={updating} title="Restore the demo data"><Icon name="refresh"/>{updating ? "Resetting…" : "Reset demo"}</button>
            <TransactionSimulations/>
            <MerchantAnalytics/>
          </section>
          <footer className="pp-footer"><span>DEMO LEDGER · NEON-POSTGRES</span><span>PAYPROOF MERCHANT DESK</span><span>FICTIONAL PAYMENT AND CUSTOMER DATA</span></footer>
        </div>
        <AgentActions variant="rail"/>
      </div>
    </div>
  </main>;
}
