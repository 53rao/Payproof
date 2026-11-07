"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { DemoState } from "@/components/admin/types";
import { SectionRail } from "@/components/admin/SectionRail";
import { DashboardHeader } from "@/components/admin/DashboardHeader";
import { Overview } from "@/components/admin/Overview";
import { MerchantHealthSummary } from "@/components/admin/MerchantHealthSummary";
import { MerchantAnalytics } from "@/components/admin/MerchantAnalytics";
import { TransactionSimulations } from "@/components/admin/TransactionSimulations";
import { PaymentEvents } from "@/components/admin/PaymentEvents";
import { OrderManagement } from "@/components/admin/OrderManagement";
import { Icon } from "@/components/admin/Icon";
import { AgentActions } from "@/components/admin/AgentActions";
import "./admin.css";

gsap.registerPlugin(useGSAP);

export default function AdminPage() {
  const rootRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<DemoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const { contextSafe } = useGSAP({ scope: rootRef });

  useGSAP(() => {
    if (!data || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.to(".pp-toggle i", { x: data.protected ? 15 : 0, duration: 0.48, ease: "elastic.out(1, 0.62)" });
    gsap.to(".pp-toggle", { backgroundColor: data.protected ? "#111416" : "#66717d", duration: 0.25, ease: "power1.out" });
  }, { scope: rootRef, dependencies: [data?.protected] });

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
  const toggleProtection = useCallback(contextSafe(async () => {
    if (!data || updating) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(".pp-toggle", { scale: 0.94 }, { scale: 1, duration: 0.42, ease: "elastic.out(1, 0.55)" });
    setUpdating(true);
    try { const response = await fetch("/api/demo/protection", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !data.protected }) }); if (!response.ok) throw new Error("Could not update protection."); setData(await response.json()); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update protection."); }
    finally { setUpdating(false); }
  }), [contextSafe, data, updating]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (event.key === "t" || event.key === "T") {
        void toggleProtection();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggleProtection]);
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

  return <main ref={rootRef} className="pp-shell">
    <SectionRail data={data}/>
    <div className="pp-app">
      <DashboardHeader data={data} onSignOut={signOut}/>
      <div className="pp-workspace">
        <div className="pp-content">
          <Overview error={error}/>
          <MerchantHealthSummary/>
          <PaymentEvents data={data} failedRate={failedRate} failedOrders={failedOrders} totalOrders={totalOrders}/>
          <OrderManagement data={data} loading={loading} totalOrders={totalOrders}/>
          <section className="pp-screen pp-demo-tools" aria-labelledby="pp-demo-tools-title">
            <div className="pp-hero"><div className="pp-title"><h1 id="pp-demo-tools-title">Demo Tools</h1><p>Sandbox testing controls — not visible to merchants.</p></div></div>
            <button type="button" className="pp-reset-demo pp-demo-reset" onClick={() => void reset()} disabled={updating} title="Restore the demo data"><Icon name="refresh"/>{updating ? "Resetting…" : "Reset demo"}</button>
            <TransactionSimulations/>
            <MerchantAnalytics/>
          </section>
          <footer className="pp-footer"><span>PAYPROOF MERCHANT DESK</span><span>DEMO LEDGER · {data?.storage.toUpperCase() ?? "LOADING"}</span><span>FICTIONAL PAYMENT AND CUSTOMER DATA</span></footer>
        </div>
        <AgentActions variant="rail"/>
      </div>
    </div>
  </main>;
}
