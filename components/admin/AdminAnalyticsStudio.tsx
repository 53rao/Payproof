"use client";

import dynamic from "next/dynamic";
import type { ActivityOrder } from "./PaymentLedgerGrid";

const AdminAnalyticsCanvas = dynamic(() => import("./AdminAnalyticsCanvas"), {
  ssr: false,
  loading: () => <div className="pp-studio-loading" role="status">Preparing analytics workspace…</div>,
});

export function AdminAnalyticsStudio({ rows, loading, error }: { rows: ActivityOrder[]; loading: boolean; error: string }) {
  return <section className="pp-screen pp-admin-studio-screen" id="analytics" aria-labelledby="pp-admin-studio-title">
    <div className="pp-admin-section-head">
      <div><h2 id="pp-admin-studio-title">Payment analytics</h2><p>Explore the recent ledger and compare payment outcomes.</p></div>
      <span className="pp-studio-badge">AG STUDIO</span>
    </div>
    {loading ? <div className="pp-studio-loading" role="status">Loading payment records for analytics…</div>
      : error ? <div className="pp-admin-data-error" role="alert">Analytics could not load: {error}</div>
      : <AdminAnalyticsCanvas rows={rows}/>}
  </section>;
}
