"use client";

import { useMemo } from "react";
import type { ActivityOrder } from "./PaymentLedgerGrid";

type SignalRow = { signal: string; failedOrders: number; share: number };
type DailyRow = { key: string; day: string; failedOrders: number };

const signalColors = ["#ef4d1a", "#d96c45", "#e99a7e", "#d89528", "#668b55", "#8793a1", "#c9c1b3"];
const dateLabel = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

function localDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "unknown";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayLabel(key: string) {
  if (key === "unknown") return "Unknown date";
  const [year, month, day] = key.split("-").map(Number);
  return dateLabel.format(new Date(year, month - 1, day));
}

function buildSignalRows(failedOrders: ActivityOrder[]): SignalRow[] {
  const counts = new Map<string, number>();
  for (const order of failedOrders) {
    const signal = order.issue?.trim() || "Unspecified";
    counts.set(signal, (counts.get(signal) ?? 0) + 1);
  }

  const ranked = [...counts.entries()]
    .map(([signal, count]) => ({ signal, count }))
    .sort((a, b) => b.count - a.count || a.signal.localeCompare(b.signal));
  const visible = ranked.slice(0, 6);
  if (ranked.length > 6) {
    visible.push({
      signal: "Other",
      count: ranked.slice(6).reduce((sum, item) => sum + item.count, 0),
    });
  }

  return visible.map(({ signal, count }) => ({
    signal,
    failedOrders: count,
    share: failedOrders.length ? (count / failedOrders.length) * 100 : 0,
  }));
}

function buildDailyRows(rows: ActivityOrder[]): DailyRow[] {
  const counts = new Map<string, number>();
  for (const order of rows) {
    const key = localDayKey(order.createdAt);
    if (!counts.has(key)) counts.set(key, 0);
    if (order.status.toUpperCase() === "FAILED") counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, failedOrders]) => ({ key, day: dayLabel(key), failedOrders }));
}

function FailureSignalMix({ rows, total }: { rows: SignalRow[]; total: number }) {
  const summary = rows.map(({ signal, failedOrders, share }) => `${signal}: ${failedOrders} (${share.toFixed(1)}%)`).join(", ");

  return <section className="pp-admin-diagnostic-block" aria-labelledby="pp-admin-diagnostic-signals-title">
    <div className="pp-admin-diagnostic-heading">
      <div>
        <h3 id="pp-admin-diagnostic-signals-title">Failure signal mix</h3>
        <p>How the failed checkouts break down across payment signals.</p>
      </div>
      <span>{total} failed checkouts</span>
    </div>
    <div
      className="pp-admin-diagnostic-stack"
      role="img"
      aria-label={`Failure signal mix across ${total} failed checkouts. ${summary}`}
    >
      {rows.map((row, index) => <i
        key={row.signal}
        style={{ width: `${row.share}%`, backgroundColor: signalColors[index % signalColors.length] }}
        title={`${row.signal}: ${row.failedOrders} (${row.share.toFixed(1)}%)`}
      />)}
    </div>
    <ul className="pp-admin-diagnostic-legend" aria-label="Failure signal counts">
      {rows.map((row, index) => <li key={row.signal}>
        <i style={{ backgroundColor: signalColors[index % signalColors.length] }} aria-hidden="true"/>
        <span>{row.signal}</span>
        <b>{row.failedOrders}</b>
        <small>{row.share.toFixed(1)}%</small>
      </li>)}
    </ul>
  </section>;
}

function FailedCheckoutsByDay({ rows }: { rows: DailyRow[] }) {
  const width = 720;
  const height = 174;
  const left = 24;
  const right = width - 18;
  const top = 14;
  const bottom = 130;
  const maxValue = Math.max(1, ...rows.map((row) => row.failedOrders));
  const points = rows.map((row, index) => ({
    ...row,
    x: rows.length === 1 ? (left + right) / 2 : left + (index / (rows.length - 1)) * (right - left),
    y: bottom - (row.failedOrders / maxValue) * (bottom - top),
  }));
  const linePath = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)} ${point.y.toFixed(2)}`).join(" ");
  const areaPath = points.length > 1 ? `${linePath} L${right} ${bottom} L${left} ${bottom} Z` : "";
  const labelIndexes = rows.length <= 5
    ? rows.map((_, index) => index)
    : [...new Set([0, Math.round((rows.length - 1) / 3), Math.round((rows.length - 1) * 2 / 3), rows.length - 1])];
  const summary = rows.map((row) => `${row.day}: ${row.failedOrders}`).join(", ");

  return <section className="pp-admin-diagnostic-block" aria-labelledby="pp-admin-diagnostic-days-title">
    <div className="pp-admin-diagnostic-heading">
      <div>
        <h3 id="pp-admin-diagnostic-days-title">Failed checkouts by day</h3>
        <p>Daily failed-order counts across the available activity window.</p>
      </div>
      <span>{rows.length} {rows.length === 1 ? "day" : "days"}</span>
    </div>
    <svg
      className="pp-admin-diagnostic-trend"
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={`Failed checkouts by day, in chronological order. ${summary}`}
      preserveAspectRatio="none"
    >
      <title>Failed checkouts by day</title>
      <desc>{summary}</desc>
      <line className="pp-admin-diagnostic-gridline" x1={left} x2={right} y1={top} y2={top}/>
      <line className="pp-admin-diagnostic-baseline" x1={left} x2={right} y1={bottom} y2={bottom}/>
      {areaPath && <path className="pp-admin-diagnostic-area" d={areaPath}/>}
      {linePath && <path className="pp-admin-diagnostic-line" d={linePath}/>}
      {points.map((point) => <circle key={point.key} className="pp-admin-diagnostic-point" cx={point.x} cy={point.y} r="4">
        <title>{`${point.day}: ${point.failedOrders} failed checkouts`}</title>
      </circle>)}
      {labelIndexes.map((index) => <text
        key={rows[index].key}
        className="pp-admin-diagnostic-day-label"
        x={points[index].x}
        y={height - 7}
        textAnchor={index === 0 ? "start" : index === rows.length - 1 ? "end" : "middle"}
      >{rows[index].day}</text>)}
    </svg>
  </section>;
}

export function CheckoutDiagnostics({ rows, loading, error }: {
  rows: ActivityOrder[];
  loading: boolean;
  error: string;
}) {
  const failedOrders = useMemo(() => rows.filter((order) => order.status.toUpperCase() === "FAILED"), [rows]);
  const signalRows = useMemo(() => buildSignalRows(failedOrders), [failedOrders]);
  const dailyRows = useMemo(() => buildDailyRows(rows), [rows]);

  return <section className="pp-screen pp-admin-diagnostics-screen" id="checkout-diagnostics" aria-busy={loading}>
    <article className="pp-panel pp-admin-diagnostics-panel" aria-labelledby="pp-admin-diagnostics-title">
      <header className="pp-panel-head pp-admin-diagnostics-head">
        <div>
          <h2 id="pp-admin-diagnostics-title">Checkout diagnostics</h2>
          <p>See which payment signals fail most often and how failures change over time.</p>
        </div>
        <span className="pp-admin-record-count">{loading ? "Loading" : `${failedOrders.length} failed`}</span>
      </header>
      {loading ? <div className="pp-admin-diagnostics-empty" role="status">Loading checkout analytics…</div>
        : error ? <div className="pp-admin-data-error" role="alert">Diagnostics could not load: {error}</div>
        : failedOrders.length === 0 ? <div className="pp-admin-diagnostics-empty">No failed checkouts in the latest {rows.length} available records.</div>
        : <div className="pp-admin-diagnostics-content">
          <FailureSignalMix rows={signalRows} total={failedOrders.length}/>
          <FailedCheckoutsByDay rows={dailyRows}/>
          <footer className="pp-admin-diagnostics-foot">Based on the latest {rows.length} available activity records.</footer>
        </div>}
    </article>
  </section>;
}
