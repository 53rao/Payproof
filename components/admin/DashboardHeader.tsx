"use client";
import Link from "next/link";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { DemoState } from "./types";
import { money } from "./format";
import { Icon } from "./Icon";

export const DashboardHeader = memo(function DashboardHeader({ data, updating, onReset, onSignOut }: { data: DemoState | null; updating: boolean; onReset: () => void; onSignOut: () => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onShortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); inputRef.current?.focus(); } };
    window.addEventListener("keydown", onShortcut); return () => window.removeEventListener("keydown", onShortcut);
  }, []);
  const results = useMemo(() => {
    const term = query.trim().toLowerCase(); if (!term || !data) return [];
    const orders = data.orders.filter((order) => `${order.id} ${order.status} ${order.issue ?? ""} ${order.amount}`.toLowerCase().includes(term)).map((order) => ({ kind: "Order", id: order.id, detail: `${order.status} · ${money(order.amount)}`, href: "#orders", caseId: "" }));
    const cases = data.cases.filter((item) => `${item.id} ${item.orderId} ${item.issue}`.toLowerCase().includes(term)).map((item) => ({ kind: "Case", id: item.id, detail: `${item.orderId} · ${item.issue.replaceAll("_", " ")}`, href: `/owner/cases/${encodeURIComponent(item.id)}` }));
    return [...orders, ...cases].slice(0, 6);
  }, [data, query]);
  return <header className="pp-topbar"><div className="pp-brand-line"><Link href="/" className="pp-wordmark">PayProof</Link><span className="pp-divider"/><span className="pp-workspace-select">Merchant Desk</span></div><div className="pp-top-actions"><div className="pp-search-wrap"><label className="pp-search"><Icon name="search"/><input ref={inputRef} type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search orders or cases…" aria-label="Search orders and cases"/></label>{query.trim() && <div className="pp-search-results">{results.length ? results.map((result) => <a key={`${result.kind}-${result.id}`} href={result.href} className="pp-search-result" onClick={() => setQuery("")}><span>{result.kind}</span><b>{result.id}</b><small>{result.detail}</small></a>) : <p>No matching orders or cases in this ledger.</p>}</div>}</div><button type="button" className="pp-reset-demo" onClick={onReset} disabled={updating} title="Restore the demo data"><Icon name="refresh"/>{updating ? "Resetting…" : "Reset demo"}</button><button type="button" className="pp-signout" onClick={onSignOut}>Sign out</button><span className="pp-user">S</span></div></header>;
});
