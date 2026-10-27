import { memo } from "react";
import type { DemoState, FeedEvent, IconName } from "./types";
import { when } from "./format";
import { Icon } from "./Icon";

export const Overview = memo(function Overview({ data, loading, error, events, updating, onReset }: {
  data: DemoState | null; loading: boolean; error: string; events: FeedEvent[]; updating: boolean; onReset: () => void;
}) {
  return <section className="pp-screen pp-overview-screen" id="overview">
    <div className="pp-hero"><div className="pp-title"><h1>Good morning, merchant.</h1><p>Here’s what’s happening with your store today.</p></div><div className="pp-hero-meta"><span>Today <b>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date())}</b></span><span className="pp-status-live"><i/> Live <small>(Simulated data)</small></span></div></div>
    {error && <div className="pp-error" role="alert">{error}</div>}
    <div className="pp-demo-note"><Icon name="info"/><p><b>Demo workspace</b> &nbsp; Fictional orders, payments, incidents, and inventory. Stored in {data?.storage === "neon-postgres" ? "Neon Postgres" : "server memory"}.</p><button onClick={onReset} disabled={updating}><Icon name="refresh"/> Reset demo</button></div>
    <section className="pp-stats" aria-label="Store metrics">
      <StatCard metric="events" label="Payment events" value={data?.counters.paymentEvents ?? null} foot="Create + capture events" icon="receipt" loading={loading}/>
      <StatCard metric="failures" label="Failed payments" value={data?.counters.failedPayments ?? null} foot="Simulated provider failures" icon="alert" loading={loading}/>
      <StatCard metric="released" label="Stock protected" value={data?.counters.recoveredStock ?? null} foot="Units released" icon="box" loading={loading}/>
      <StatCard metric="held" label="Still reserved" value={data?.counters.stuckStock ?? null} foot="Units in failed orders" icon="shield" loading={loading}/>
      <StatCard metric="recovered" label="Recovered sales" value={data?.counters.recoveredRevenue ?? null} foot={`${data?.counters.recoveredOrders ?? 0} completed recovery orders · simulated`} icon="chart" loading={loading} prefix="$"/>
    </section>
    <section className="pp-overview-activity" aria-label="Latest activity">
      <div className="pp-overview-activity-head"><div><h2>Latest activity</h2><p>Recent payment records from this workspace</p></div><a href="#events">Open payment events <Icon name="arrow"/></a></div>
      {loading && !data ? <div className="pp-overview-activity-list pp-activity-skeleton" aria-label="Loading recent activity"><span/><span/><span/><span/><span/><span/></div> : events.length ? <div className="pp-overview-activity-list">{events.slice(0, 6).map((event) => <a className="pp-overview-activity-row" href="#orders" key={`${event.ref}-${event.kind}`}><span className={`pp-overview-activity-icon ${event.failed ? "failed" : ""}`}><Icon name="receipt"/></span><span><b>{event.title}</b><small>{event.ref} · {event.detail}</small></span><time>{when(event.time)}</time><Icon name="chevron"/></a>)}</div> : <div className="pp-overview-activity-empty">No payment activity yet. Run a simulated checkout to start the ledger.</div>}
  </section>
</section>;
});

const StatCard = memo(function StatCard({ metric, label, value, foot, icon, loading, prefix = "" }: { metric: string; label: string; value: number | null; foot: string; icon: IconName; loading: boolean; prefix?: string }) {
  return <article className={`pp-stat ${loading ? "is-loading" : ""}`} aria-busy={loading}><div><span>{label}</span><Icon name={icon}/></div>{value === null ? <strong className="pp-stat-value pp-stat-placeholder" aria-label={`Loading ${label.toLowerCase()}`}><i/></strong> : <strong className="pp-stat-value" data-counter={metric} data-target={value}>{prefix}{prefix ? value.toLocaleString("en-US", { maximumFractionDigits: 0 }) : value}</strong>}<small>{foot}</small></article>;
});
