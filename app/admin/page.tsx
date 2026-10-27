"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { products } from "@/lib/products";
import "./admin.css";

type DemoCase = { id: string; orderId: string; issue: string; debug_id?: string; createdAt: string; status: "OPEN" };
type DemoOrder = { id: string; amount: number; status: string; createdAt: string; issue?: string; debug_id?: string; items: { id: string; quantity: number }[] };
type DemoState = { simulated: true; storage: string; protected: boolean; stock: Record<string, number>; heldStock: Record<string, number>; committedStock: Record<string, number>; orders: DemoOrder[]; cases: DemoCase[]; counters: { paymentEvents: number; failedPayments: number; recoveredStock: number; stuckStock: number; openCases: number } };
gsap.registerPlugin(useGSAP);
const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(amount);
const when = (value: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));

export default function AdminPage() {
  const rootRef = useRef<HTMLElement>(null);
  const [data, setData] = useState<DemoState | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState("");
  const [activeSection, setActiveSection] = useState("overview");
  const [feedFilter, setFeedFilter] = useState<"All" | "Payments" | "Inventory" | "Cases">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const counterValues = useRef<Record<string, number>>({});
  const { contextSafe } = useGSAP({ scope: rootRef });
  useGSAP(() => {
    const media = gsap.matchMedia();
    media.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.from(".pp-title", { y: 12, autoAlpha: 0, duration: 0.45, ease: "power2.out" });
      gsap.from(".pp-stat, .pp-panel, .pp-feed", { y: 13, autoAlpha: 0, duration: 0.42, stagger: 0.045, delay: 0.08, ease: "power2.out" });
    });
    return () => media.revert();
  }, { scope: rootRef, dependencies: [] });
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
    try { const response = await fetch("/api/demo/state", { cache: "no-store" }); if (response.status === 401) { window.location.replace("/login?next=%2Fadmin"); return; } if (!response.ok) throw new Error("Could not load the demo ledger."); const result: DemoState = await response.json(); setData(result); setSelectedId((current) => current || result.cases[0]?.id || ""); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not load the demo ledger."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const sections = Array.from(rootRef.current?.querySelectorAll<HTMLElement>(".pp-screen[id]") ?? []);
    if (!sections.length) return;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible?.target.id) setActiveSection(visible.target.id);
    }, { rootMargin: "-72px 0px -38% 0px", threshold: [0.12, 0.3, 0.55] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onShortcut);
    return () => window.removeEventListener("keydown", onShortcut);
  }, []);
  const selected = data?.cases.find((item) => item.id === selectedId) ?? data?.cases[0];
  const selectedOrder = data?.orders.find((item) => item.id === selected?.orderId);
  const feedEvents = useMemo(() => {
    if (!data) return [];
    const payments = data.orders.map((order) => ({ kind: "Payments" as const, title: order.status === "FAILED" ? "Payment failed" : order.status === "PENDING" || order.status === "PROCESSING" ? "Payment pending" : "Payment captured", ref: order.id, detail: `${money(order.amount)}${order.issue ? ` · ${order.issue.replaceAll("_", " ")}` : ""}`, time: order.createdAt, failed: order.status === "FAILED" }));
    const cases = data.cases.map((item) => ({ kind: "Cases" as const, title: "Case opened", ref: item.id, detail: `${item.orderId} · ${item.issue.replaceAll("_", " ")}`, time: item.createdAt, failed: false }));
    return [...payments, ...cases].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
  }, [data]);
  const visibleFeed = feedFilter === "All" ? feedEvents : feedEvents.filter((event) => event.kind === feedFilter);
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query || !data) return [];
    const orders = data.orders.filter((order) => `${order.id} ${order.status} ${order.issue ?? ""} ${order.amount}`.toLowerCase().includes(query)).map((order) => ({ kind: "Order", id: order.id, detail: `${order.status} · ${money(order.amount)}`, href: "#orders", caseId: "" }));
    const cases = data.cases.filter((item) => `${item.id} ${item.orderId} ${item.issue}`.toLowerCase().includes(query)).map((item) => ({ kind: "Case", id: item.id, detail: `${item.orderId} · ${item.issue.replaceAll("_", " ")}`, href: "#cases", caseId: item.id }));
    return [...orders, ...cases].slice(0, 6);
  }, [data, searchQuery]);
  const totalStock = useMemo(() => data ? Object.values(data.stock).reduce((sum, count) => sum + count, 0) : 0, [data]);
  const failedOrders = data?.orders.filter((order) => order.status === "FAILED").length ?? 0;
  const totalOrders = data?.orders.length ?? 0;
  const failedRate = totalOrders ? Math.round((failedOrders / totalOrders) * 100) : 0;

  const refreshWithMotion = contextSafe(async () => {
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.to(".pp-icon-button", { rotation: 360, duration: 0.5, ease: "power2.inOut" });
    await refresh();
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.set(".pp-icon-button", { rotation: 0 });
  });
  const selectCase = contextSafe((id: string) => {
    setSelectedId(id);
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(".pp-case-detail", { y: 8, autoAlpha: 0.65 }, { y: 0, autoAlpha: 1, duration: 0.3, ease: "power2.out", clearProps: "transform,opacity,visibility" });
  });
  const toggleProtection = contextSafe(async () => {
    if (!data || updating) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.fromTo(".pp-toggle", { scale: 0.94 }, { scale: 1, duration: 0.42, ease: "elastic.out(1, 0.55)" });
    setUpdating(true);
    try { const response = await fetch("/api/demo/protection", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ enabled: !data.protected }) }); if (!response.ok) throw new Error("Could not update protection."); setData(await response.json()); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not update protection."); }
    finally { setUpdating(false); }
  });
  const reset = contextSafe(async () => {
    if (updating) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.to(".pp-content", { opacity: 0.82, duration: 0.16 });
    setUpdating(true);
    try { const response = await fetch("/api/demo/reset", { method: "POST" }); if (!response.ok) throw new Error("Could not reset the demo."); const result: DemoState = await response.json(); setData(result); setSelectedId(""); setError(""); }
    catch (err) { setError(err instanceof Error ? err.message : "Could not reset the demo."); }
    finally { setUpdating(false); if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) gsap.to(".pp-content", { opacity: 1, duration: 0.22 }); }
  });
  async function signOut() {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { setError("Could not sign out. Refresh the desk and try again."); return; }
    window.location.replace("/login");
  }

  return <main ref={rootRef} className="pp-shell">
    <aside className="pp-rail" aria-label="Dashboard sections">
      <Link className="pp-mark" href="/" aria-label="PayProof storefront">p</Link>
      <nav className="pp-rail-nav">
        <RailLink href="#overview" label="Overview" icon="grid" active={activeSection === "overview"} onClick={() => setActiveSection("overview")}/>
        <RailLink href="#events" label="Payment events" icon="chart" active={activeSection === "events"} onClick={() => setActiveSection("events")}/>
        <RailLink href="#orders" label="Orders" icon="receipt" active={activeSection === "orders"} onClick={() => setActiveSection("orders")}/>
        <RailLink href="#cases" label="Cases" icon="shield" count={data?.counters.openCases} active={activeSection === "cases"} onClick={() => setActiveSection("cases")}/>
        <RailLink href="#inventory" label="Inventory" icon="box" active={activeSection === "inventory"} onClick={() => setActiveSection("inventory")}/>
      </nav>
      <div className="pp-rail-bottom"><span className="pp-store-avatar" title="Little Things Supply">LT</span><span className="pp-live-dot" title="Simulated data"/></div>
    </aside>
    <div className="pp-app">
      <header className="pp-topbar"><div className="pp-brand-line"><Link href="/" className="pp-wordmark">PayProof</Link><span className="pp-divider"/><button className="pp-workspace-select">Merchant Desk <Icon name="chevron"/></button><span className="pp-demo-pill">Demo Workspace</span></div><div className="pp-top-actions"><div className="pp-search-wrap"><label className="pp-search"><Icon name="search"/><input ref={searchRef} type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search orders, cases, or transactions…" aria-label="Search orders and cases"/><kbd>⌘ K</kbd></label>{searchQuery.trim() && <div className="pp-search-results">{searchResults.length ? searchResults.map((result) => <a key={`${result.kind}-${result.id}`} href={result.href} className="pp-search-result" onClick={() => { if (result.caseId) selectCase(result.caseId); setSearchQuery(""); }}><span>{result.kind}</span><b>{result.id}</b><small>{result.detail}</small></a>) : <p>No matching orders or cases in this ledger.</p>}</div>}</div><span className="pp-sim-status"><i/> Simulated data</span><button className="pp-icon-button" onClick={() => void refreshWithMotion()} aria-label="Refresh dashboard"><Icon name="refresh"/></button><button type="button" className="pp-signout" onClick={() => void signOut()}>Sign out</button><span className="pp-user">S</span></div></header>
      <div className="pp-workspace">
        <div className="pp-content">
          <section className="pp-screen pp-overview-screen" id="overview"><div className="pp-hero"><div className="pp-title"><h1>Good morning, merchant.</h1><p>Here’s what’s happening with your store today.</p></div><div className="pp-hero-meta"><span>Today <b>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date())}</b></span><span className="pp-status-live"><i/> Live <small>(Simulated data)</small></span></div></div>
          {error && <div className="pp-error" role="alert">{error}</div>}
          <div className="pp-demo-note"><Icon name="info"/><p><b>Demo workspace</b> &nbsp; Fictional orders, payments, incidents, and inventory. Stored in {data?.storage === "neon-postgres" ? "Neon Postgres" : "server memory"}.</p><button onClick={() => void reset()} disabled={updating}><Icon name="refresh"/> Reset demo</button></div>
          <section className="pp-stats" aria-label="Store metrics">
            <StatCard metric="events" label="Payment events" value={data?.counters.paymentEvents ?? 0} foot="Create + capture events" icon="receipt"/>
            <StatCard metric="cases" label="Open cases" value={data?.counters.openCases ?? 0} foot="Needs owner review" icon="alert"/>
            <StatCard metric="released" label="Stock protected" value={data?.counters.recoveredStock ?? 0} foot="Units released" icon="box"/>
            <StatCard metric="held" label="Still reserved" value={data?.counters.stuckStock ?? 0} foot="Units in failed orders" icon="shield"/>
          </section>
          <section className="pp-overview-activity" aria-label="Latest activity">
            <div className="pp-overview-activity-head"><div><h2>Latest activity</h2><p>Recent payment and case records from this workspace</p></div><a href="#events">Open payment events <Icon name="arrow"/></a></div>
            {feedEvents.length ? <div className="pp-overview-activity-list">{feedEvents.slice(0, 3).map((event) => <a className="pp-overview-activity-row" href={event.kind === "Cases" ? "#cases" : "#orders"} key={`${event.ref}-${event.kind}`}><span className={`pp-overview-activity-icon ${event.failed ? "failed" : ""}`}><Icon name={event.kind === "Cases" ? "alert" : "receipt"}/></span><span><b>{event.title}</b><small>{event.ref} · {event.detail}</small></span><time>{when(event.time)}</time><Icon name="chevron"/></a>)}</div> : <div className="pp-overview-activity-empty">{loading ? "Loading activity…" : "No payment or case activity yet. Run a simulated checkout to start the ledger."}</div>}
          </section></section>
          <section className="pp-screen" id="events"><div className="pp-primary-grid">
            <article className="pp-panel pp-events"><div className="pp-panel-head"><div><h2>Payment events</h2><p>Recent outcomes from the simulated checkout</p></div><span className="pp-live-label"><i/> Live stream</span></div><div className="pp-chart-summary"><strong>{failedRate}<small>%</small></strong><span>failed checkout rate<br/><b>{failedOrders} failed</b> of {totalOrders} orders</span><div className="pp-legend"><i/> Successful <i className="red"/> Failed</div></div><div className="pp-chart-bars" aria-label={`${failedRate}% failed checkout rate`}>{data?.orders.length ? data.orders.slice(0, 16).reverse().map((order) => <span key={order.id} title={`${order.id}: ${order.status}`} className={order.status === "FAILED" ? "failed" : "success"} style={{ height: order.status === "FAILED" ? "74%" : order.status === "PENDING" || order.status === "PROCESSING" ? "49%" : `${28 + (Number(order.id.slice(-2)) % 5) * 8}%` }}/>) : <p>No checkout events yet</p>}</div><div className="pp-chart-axis"><span>Oldest</span><span>Recent orders</span><span>Latest</span></div><div className="pp-chart-foot"><span>{data?.counters.paymentEvents ?? 0} payment events recorded</span><a href="#orders">View order activity <Icon name="arrow"/></a></div></article>
            <article className="pp-panel pp-safety"><div className="pp-panel-head"><div><h2>Order safety</h2><p>Automated stock protection</p></div><span className={`pp-auto-badge ${data?.protected ? "enabled" : ""}`}>{data?.protected ? "On" : "Off"}</span></div><div className="pp-safety-copy"><Icon name="shield"/><div><b>{data?.protected ? "Protection is on" : "Protection is off"}</b><p>{data?.protected ? "Release reserved inventory automatically when a simulated payment fails." : "Failed checkouts keep stock reserved until protection is enabled."}</p></div></div><button className={`pp-toggle ${data?.protected ? "on" : "off"}`} onClick={() => void toggleProtection()} disabled={!data || updating} aria-label="Toggle stock protection" aria-pressed={data?.protected ?? false}><i/></button><div className="pp-protected-total"><strong>{totalStock}</strong><span>available units across {products.length} products</span></div><div className="pp-safety-foot"><span><i className={data?.protected ? "" : "paused"}/>{data?.protected ? "Protection active" : "Protection paused"}</span><span>Demo control</span></div></article>
          </div></section>
          <section className="pp-screen" id="orders"><div className="pp-secondary-grid">
            <article className="pp-panel pp-orders-preview"><div className="pp-panel-head"><div><h2>Recent orders</h2><p>Latest activity in the demo ledger</p></div><a href="#orders" className="pp-text-link">View all <Icon name="arrow"/></a></div>{data?.orders.length ? <div className="pp-order-preview-list">{data.orders.slice(0, 4).map((order) => <div className="pp-order-preview" key={order.id}><span className="pp-order-glyph"><Icon name="receipt"/></span><span className="pp-order-main"><b>{order.id}</b><small>{order.issue?.replaceAll("_", " ") ?? "Checkout"}</small></span><span className="pp-order-amount">{money(order.amount)}</span><span className={`pp-tag ${order.status.toLowerCase()}`}>{order.status}</span></div>)}</div> : <div className="pp-empty-inline">No orders yet. Start with a simulated checkout.</div>}</article>
            <article className="pp-assist"><div className="pp-assist-art"><i/><i/><i/></div><div className="pp-assist-content"><div className="pp-assist-brand"><span>PayProof</span><small>AI ASSIST</small></div><h2>Turn failed payments into clearer next steps.</h2><p>Review the records and evidence around a simulated checkout incident.</p><a href="#cases" className="pp-assist-link"><span><Icon name="arrow"/></span>Review open cases</a></div></article>
          </div><section className="pp-panel pp-all-orders"><div className="pp-panel-head"><div><h2>Order ledger</h2><p>Payments and incidents from the simulated checkout</p></div><span className="pp-count">{totalOrders} orders</span></div><div className="pp-table-wrap"><div className="pp-table pp-table-head"><span>Order</span><span>Status</span><span>Amount</span><span>Incident</span><span>Recorded</span></div>{data?.orders.length ? data.orders.slice(0, 8).map((order) => <div className="pp-table pp-table-row" key={order.id}><b>{order.id}</b><span className={`pp-tag ${order.status.toLowerCase()}`}>{order.status}</span><span>{money(order.amount)}</span><span>{order.issue?.replaceAll("_", " ") ?? "—"}</span><span>{when(order.createdAt)}</span></div>) : <div className="pp-empty-inline">No orders in the demo ledger.</div>}</div></section></section>
          <section className="pp-screen" id="cases"><div className="pp-lower-grid">
            <article className="pp-panel pp-case-list"><div className="pp-panel-head"><div><h2>Incidents &amp; cases</h2><p>{data?.counters.openCases ?? 0} open · needs owner attention</p></div><span className="pp-count">{data?.counters.openCases ?? 0} open</span></div>
              {loading ? <div className="pp-empty-inline">Loading case history…</div> : data?.cases.length ? <div className="pp-case-rows">{data.cases.map((item) => <button key={item.id} className={`pp-case-row ${selected?.id === item.id ? "selected" : ""}`} onClick={() => selectCase(item.id)}><span className="pp-case-alert"><Icon name="alert"/></span><span className="pp-case-info"><b>{item.id} · {item.issue.replaceAll("_", " ")}</b><small>{item.orderId} · {when(item.createdAt)}</small></span><span className="pp-severity">Review</span><Icon name="chevron"/></button>)}</div> : <div className="pp-empty-inline"><b>It’s quiet in here.</b><span>Simulate a decline in the demo shop to open a case.</span><Link href="/#shop">Go to demo shop <Icon name="arrow"/></Link></div>}</article>
            <article className="pp-panel pp-case-detail"><div className="pp-panel-head"><div><h2>{selected ? "Case evidence" : "Evidence readiness"}</h2><p>{selected ? "What the demo ledger can establish" : "Select a case to review its records"}</p></div>{selected && <span className="pp-count">Open</span>}</div>
              {selected ? <><div className="pp-case-summary"><span className="pp-case-alert"><Icon name="alert"/></span><div><b>{selected.issue.replaceAll("_", " ")}</b><small>Probable cause based on simulated provider response</small></div></div><div className="pp-evidence-meter"><b>Evidence completeness</b><span>{evidenceCount(selected, selectedOrder)}/4</span><i><em style={{ width: `${evidenceCount(selected, selectedOrder) * 25}%` }}/></i></div><div className="pp-evidence-list"><Evidence label="Order record" detail={selectedOrder ? `${selectedOrder.items.reduce((n, i) => n + i.quantity, 0)} item(s) · ${money(selectedOrder.amount)}` : "Order found in demo ledger"} ok/><Evidence label="Payment result" detail={`Failure issue: ${selected.issue}`} ok/><Evidence label="Provider debug ID" detail={selected.debug_id ?? "Not returned by mock response"} ok={Boolean(selected.debug_id)}/><Evidence label="Fulfillment record" detail="No fulfillment record in this demo" ok={false}/></div><p className="pp-neutral-note"><Icon name="info"/> Payment capture or failure does not establish whether an order was delivered.</p></> : <div className="pp-empty-inline">Case details appear here when an incident is selected.</div>}
            </article>
          </div></section>
          <section className="pp-screen" id="inventory"><section className="pp-panel pp-inventory"><div className="pp-panel-head"><div><h2>Inventory snapshot</h2><p>Reservations and available units by product</p></div><span className="pp-count">Simulated stock</span></div><div className="pp-inventory-list">{products.map((product) => { const available = data?.stock[product.id] ?? 12; const held = data?.heldStock[product.id] ?? 0; const sold = data?.committedStock[product.id] ?? 0; return <div className="pp-inventory-row" key={product.id}><span className="pp-product-icon" style={{ background: product.color }}>{product.icon}</span><span className="pp-product-name"><b>{product.name}</b><small>{product.category}</small></span><span className="pp-stock-values"><b>{available}</b> available <span>·</span> {held} held <span>·</span> {sold} sold</span><i className="pp-meter"><i style={{ width: `${Math.min(100, available / 12 * 100)}%` }}/></i><span className={`pp-stock-tag ${available > 0 ? "in" : "out"}`}>{available > 0 ? "In stock" : "Out of stock"}</span><span className="pp-price">{money(product.price)}</span></div>; })}</div></section></section>
          <footer className="pp-footer"><span>PAYPROOF MERCHANT DESK</span><span>DEMO LEDGER · {data?.storage.toUpperCase() ?? "LOADING"}</span><span>FICTIONAL PAYMENT AND CUSTOMER DATA</span></footer>
        </div>
        <aside className="pp-feed" aria-label="Live data stream"><div className="pp-feed-head"><div><h2>Live data stream</h2><span><i/> Live</span></div><button onClick={() => setFeedFilter("All")} aria-label="Show all events"><Icon name="filter"/></button></div><div className="pp-feed-filters">{(["All", "Payments", "Inventory", "Cases"] as const).map((filter) => <button key={filter} onClick={() => setFeedFilter(filter)} className={feedFilter === filter ? "active" : ""}>{filter}</button>)}</div>{visibleFeed.length ? <div className="pp-feed-list">{visibleFeed.slice(0, 12).map((event, index) => <article className="pp-feed-event" key={`${event.ref}-${event.kind}`}><span className={`pp-feed-marker ${event.failed ? "failed" : ""}`}><Icon name={event.kind === "Cases" ? "alert" : "receipt"}/></span><div className="pp-feed-copy"><div><b>{event.title}</b><span className={`pp-feed-state ${event.failed ? "failed" : ""}`}>{event.failed ? "Failed" : event.kind === "Cases" ? "Open" : "Recorded"}</span></div><p>{event.ref} · {event.detail}</p><time>{when(event.time)}</time></div>{index < Math.min(visibleFeed.length, 12) - 1 && <i className="pp-feed-line"/>}</article>)}</div> : <div className="pp-feed-empty"><Icon name="box"/><b>{feedFilter === "Inventory" ? "No inventory events" : "No recent events"}</b><p>{feedFilter === "Inventory" ? "Inventory is available below; this demo has no separate stock event log." : "New payment and case activity will appear here."}</p></div>}<a href={feedFilter === "Cases" ? "#cases" : "#orders"} className="pp-feed-all">View related records <Icon name="arrow"/></a></aside>
      </div>
    </div>
  </main>;
}
function RailLink({ href, label, icon, active, count, onClick }: { href: string; label: string; icon: IconName; active: boolean; count?: number; onClick: () => void }) { return <a href={href} aria-label={label} title={label} aria-current={active ? "location" : undefined} onClick={onClick} className={`pp-rail-link ${active ? "active" : ""}`}><Icon name={icon}/>{Boolean(count) && <span>{count}</span>}</a>; }
function StatCard({ metric, label, value, foot, icon }: { metric: string; label: string; value: number; foot: string; icon: IconName }) { return <article className="pp-stat"><div><span>{label}</span><Icon name={icon}/></div><strong className="pp-stat-value" data-counter={metric} data-target={value}>{value}</strong><small>{foot}</small></article>; }
function Evidence({ label, detail, ok }: { label: string; detail: string; ok: boolean }) { return <div className="pp-evidence-row"><span className={`pp-evidence-check ${ok ? "yes" : "no"}`}><Icon name={ok ? "check" : "minus"}/></span><span><b>{label}</b><small>{detail}</small></span><em>{ok ? "Found" : "Missing"}</em></div>; }
type IconName = "grid" | "chart" | "shield" | "receipt" | "box" | "chevron" | "search" | "refresh" | "info" | "alert" | "arrow" | "filter" | "check" | "minus";
function Icon({ name }: { name: IconName }) { const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true as const }; const shapes: Record<IconName, React.ReactNode> = { grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>, chart: <><path d="M4 19.5h16"/><path d="M6 16V11m4 5V5m4 11v-7m4 7V8"/></>, shield: <><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>, receipt: <><rect x="4" y="4" width="16" height="16" rx="2.5"/><path d="M8 9h8M8 13h5m-5 3h3"/></>, box: <><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4.5 7.8 7.5 4.4 7.5-4.4M12 12.2V21"/></>, chevron: <path d="m8 10 4 4 4-4"/>, search: <><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4 4"/></>, refresh: <><path d="M20 7v5h-5"/><path d="M19 12a7.5 7.5 0 1 1-2-5"/></>, info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>, alert: <><path d="M10.3 4.7 3.8 16a2 2 0 0 0 1.7 3h13a2 2 0 0 0 1.7-3L13.7 4.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></>, arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>, filter: <><path d="M4 6h16M7 12h10m-7 6h4"/></>, check: <path d="m5 12 4 4L19 6"/>, minus: <path d="M5 12h14"/> }; return <svg {...common}>{shapes[name]}</svg>; }
function evidenceCount(selected: DemoCase, order?: DemoOrder) { return 1 + Number(Boolean(selected.debug_id)) + Number(Boolean(order)); }
