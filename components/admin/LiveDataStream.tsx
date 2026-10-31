import { memo, useMemo, useState } from "react";
import type { FeedEvent } from "./types";
import { when } from "./format";
import { Icon } from "./Icon";

type FeedFilter = "All" | "Payments";
export const LiveDataStream = memo(function LiveDataStream({ events, loading }: { events: FeedEvent[]; loading: boolean }) {
  const [filter, setFilter] = useState<FeedFilter>("All");
  const visible = useMemo(() => [...(filter === "All" ? events : events.filter((event) => event.kind === filter))].sort((a, b) => Date.parse(b.time) - Date.parse(a.time)), [events, filter]);
  return <aside className="pp-feed" aria-label="Recent payment activity"><div className="pp-feed-head"><div><h2>Recent activity</h2><span>Refreshes every 15 seconds</span></div><button onClick={() => setFilter("All")} aria-label="Show all events"><Icon name="filter"/></button></div><div className="pp-feed-filters">{(["All", "Payments"] as const).map((item) => <button key={item} onClick={() => setFilter(item)} className={filter === item ? "active" : ""}>{item}</button>)}</div>
    {loading ? <div className="pp-feed-loading" role="status" aria-label="Loading recent activity"><i/><i/><i/><i/><i/></div> : visible.length ? <div className="pp-feed-list">{visible.slice(0, 12).map((event, index) => <article className="pp-feed-event" key={`${event.ref}-${event.kind}`}><span className={`pp-feed-marker ${event.failed ? "failed" : ""}`}><Icon name="receipt"/></span><div className="pp-feed-copy"><div><b>{event.title}</b><span className={`pp-feed-state ${event.failed ? "failed" : ""}`}>{event.failed ? "Failed" : "Recorded"}</span></div><p>{event.ref} · {event.detail}</p><time>{when(event.time)}</time></div>{index < Math.min(visible.length, 12) - 1 && <i className="pp-feed-line"/>}</article>)}</div> : <div className="pp-feed-empty"><Icon name="box"/><b>No recent events</b><p>New payment activity will appear here.</p></div>}
    <a href="#orders" className="pp-feed-all">View related records <Icon name="arrow"/></a>
  </aside>;
});
