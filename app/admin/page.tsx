"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import type { DemoState } from "@/components/admin/types";
import { money } from "@/components/admin/format";
import { SectionRail } from "@/components/admin/SectionRail";
import { DashboardHeader } from "@/components/admin/DashboardHeader";
import { Overview } from "@/components/admin/Overview";
import { PaymentEvents } from "@/components/admin/PaymentEvents";
import { OrderManagement } from "@/components/admin/OrderManagement";
import { InventorySnapshot } from "@/components/admin/InventorySnapshot";
import { LiveDataStream } from "@/components/admin/LiveDataStream";
import "./admin.css";

gsap.registerPlugin(useGSAP);

export default function AdminPage() {
  const rootRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<DemoState | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [presenterMode, setPresenterMode] = useState(false);
  const [presenterStep, setPresenterStep] = useState(0);
  const counterValues = useRef<Record<string, number>>({});
  const { contextSafe } = useGSAP({ scope: rootRef });

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !data) return;
    gsap.utils.toArray<HTMLElement>(".pp-stat-value").forEach((element) => {
      const key = element.dataset.counter ?? "metric";
      const target = Number(element.dataset.target ?? 0);
      const counter = { value: counterValues.current[key] ?? 0 };
      counterValues.current[key] = target;
      gsap.to(counter, { value: target, duration: 0.58, ease: "power2.out", snap: { value: 1 }, onUpdate: () => { element.textContent = String(Math.round(counter.value)); } });
    });
    gsap.fromTo(".pp-stat", { y: 4 }, { y: 0, duration: 0.35, stagger: 0.035, ease: "power2.out", clearProps: "transform" });
    gsap.fromTo(".pp-chart-bars span", { scaleY: 0, transformOrigin: "bottom" }, { scaleY: 1, duration: 0.48, stagger: 0.035, ease: "power2.out", clearProps: "transform" });
    gsap.fromTo(".pp-meter i", { scaleX: 0, transformOrigin: "left" }, { scaleX: 1, duration: 0.42, stagger: 0.045, ease: "power2.out", clearProps: "transform" });
  }, { scope: rootRef, dependencies: [data?.counters.paymentEvents, data?.counters.failedPayments, data?.counters.recoveredStock, data?.counters.stuckStock, data?.protected, data?.orders.length, data?.stock], revertOnUpdate: true });

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
  useEffect(() => { void refresh(); setPresenterMode(new URLSearchParams(window.location.search).get("presenter") === "1"); }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  const feedEvents = useMemo(() => !data ? [] : data.orders.map((order) => ({
    kind: "Payments" as const,
    title: order.status === "FAILED" ? "Payment failed" : order.status === "PENDING" || order.status === "PROCESSING" ? "Payment pending" : "Payment captured",
    ref: order.id,
    detail: `${money(order.amount)}${order.issue ? ` · ${order.issue.replaceAll("_", " ")}` : ""}`,
    time: order.createdAt,
    failed: order.status === "FAILED",
  })).sort((a, b) => Date.parse(b.time) - Date.parse(a.time)), [data]);
  const totalStock = useMemo(() => data ? Object.values(data.stock).reduce((sum, count) => sum + count, 0) : 0, [data]);
  const failedOrders = data?.orders.filter((order) => order.status === "FAILED").length ?? 0;
  const totalOrders = data?.orders.length ?? 0;
  const failedRate = totalOrders ? Math.round((failedOrders / totalOrders) * 100) : 0;
  const refreshWithMotion = useCallback(contextSafe(async () => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.to(".pp-icon-button", { rotation: 360, duration: 0.5, ease: "power2.inOut" });
    await refresh();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.set(".pp-icon-button", { rotation: 0 });
  }), [contextSafe, refresh]);

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
      if (event.key === "p" || event.key === "P") {
        setPresenterMode((prev) => !prev);
      } else if (event.key === "t" || event.key === "T") {
        void toggleProtection();
      } else if (event.key === "ArrowRight" || event.key === "]" || event.key === "j") {
        if (presenterMode) setPresenterStep((step) => Math.min(3, step + 1));
      } else if (event.key === "ArrowLeft" || event.key === "[" || event.key === "k") {
        if (presenterMode) setPresenterStep((step) => Math.max(0, step - 1));
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [presenterMode, toggleProtection]);
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
      <DashboardHeader data={data} onRefresh={refreshWithMotion} onSignOut={signOut}/>
      {presenterMode && <section className="pp-presenter-bar" aria-label="Demo presentation controls"><div><b>Walkthrough</b><span>{["The simulated storefront", "Payment outcome and stock protection", "Review the merchant case", "Prepare an evidence packet"][presenterStep]}</span></div><div className="pp-presenter-controls"><span>{presenterStep + 1} / 4 · SIMULATED</span><button type="button" onClick={() => setPresenterStep((step) => Math.max(0, step - 1))} disabled={presenterStep === 0}>Previous</button><button type="button" onClick={() => setPresenterStep((step) => Math.min(3, step + 1))} disabled={presenterStep === 3}>Next</button><button type="button" onClick={() => { setPresenterMode(false); window.history.replaceState(null, "", "/admin"); }}>Exit</button></div></section>}
      <div className="pp-workspace">
        <div className="pp-content">
          <Overview data={data} loading={loading} error={error} events={feedEvents} updating={updating} onReset={() => void reset()}/>
          <PaymentEvents data={data} failedRate={failedRate} failedOrders={failedOrders} totalOrders={totalOrders} totalStock={totalStock} updating={updating} onToggle={() => void toggleProtection()}/>
          <OrderManagement data={data} loading={loading} totalOrders={totalOrders}/>
          <InventorySnapshot data={data} loading={loading}/>
          <footer className="pp-footer"><span>PAYPROOF MERCHANT DESK</span><span>DEMO LEDGER · {data?.storage.toUpperCase() ?? "LOADING"}</span><span>FICTIONAL PAYMENT AND CUSTOMER DATA</span></footer>
        </div>
        <LiveDataStream events={feedEvents} loading={loading}/>
      </div>
    </div>
  </main>;
}
