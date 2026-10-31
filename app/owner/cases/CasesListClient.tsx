"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import "./owner-cases.css";

type Complaint = { id: string; type: string; originalText: string; createdAt: string } | null;
type CaseRow = { id: string; orderId: string; type: string; status: string; cause: string; createdAt: string; simulated: boolean; orderStatus?: string; total?: number; suggestedNextStep?: string; complaint: Complaint };
const labels: Record<string,string> = { ITEM_NOT_RECEIVED: "Item not received", ITEM_DIFFERENT: "Item different from description", PAYMENT_ISSUE: "Payment issue", OTHER: "Other" };
const date = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
export default function CasesListClient() {
  const [cases, setCases] = useState<CaseRow[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState(""); const [filter, setFilter] = useState("All cases");
  useEffect(() => { let active = true; void fetch("/api/owner/cases", { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "Cases could not be loaded."); if (active) setCases(data.cases ?? []); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Cases could not be loaded."); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, []);
  const visible = cases.filter((row) => filter === "All cases" || (filter === "Customer complaints" ? Boolean(row.complaint) : row.type !== "CUSTOMER_COMPLAINT"));
  return <main className="pp-owner-cases">
    <header className="pp-owner-top"><Link href="/admin" className="pp-owner-brand"><span>p.</span> PayProof <small>MERCHANT DESK</small></Link><div><span className="pp-owner-demo">SIMULATED WORKSPACE</span><Link href="/admin">Back to overview ↗</Link></div></header>
    <div className="pp-owner-container"><nav className="pp-owner-breadcrumb"><Link href="/admin">Merchant desk</Link><span>/</span><b>Cases &amp; complaints</b></nav>
      <section className="pp-owner-title"><div><h1>Cases &amp; <em>complaints</em></h1><p>Review customer notes alongside the store records available for each order.</p></div><span className="pp-owner-private"><OwnerShield/> Owner workspace</span></section>
      <div className="pp-owner-truth"><span className="pp-owner-truth-icon">i</span><p>Store and payment records may be incomplete. Customer statements are shown as written. PayPal makes the final decision on any dispute.</p></div>
      <section className="pp-owner-case-panel"><div className="pp-owner-case-toolbar"><div><h2>Case queue</h2><p>{loading ? "Loading case records…" : `${visible.length} ${visible.length === 1 ? "case" : "cases"} · newest first`}</p></div><label className="pp-owner-filter"><span className="sr-only">Filter cases</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>All cases</option><option>Customer complaints</option><option>Payment incidents</option></select></label></div>
        {loading ? <div className="pp-owner-list-loading" role="status" aria-label="Loading cases"><i/><i/><i/></div> : error ? <div className="pp-owner-empty" role="alert"><b>Couldn’t load the case list.</b><p>{error}</p><button onClick={() => location.reload()}>Try again</button></div> : !visible.length ? <div className="pp-owner-empty"><b>No cases in this view.</b><p>Customer reports and payment incidents will appear here for owner review.</p></div> : <div className="pp-owner-grid" role="table" aria-label="Cases awaiting merchant review">
          <div className="pp-owner-grid-head" role="row"><span role="columnheader">Case / order</span><span role="columnheader">Issue type</span><span role="columnheader">Status</span><span role="columnheader">Amount</span><span role="columnheader">Suggested next step</span><span role="columnheader" className="sr-only">Action</span></div>
          {visible.map((row) => <article className="pp-owner-grid-row" role="row" key={row.id}><div className="pp-owner-grid-case" role="cell"><b>{row.id}</b><small>{row.orderId}</small></div><div className="pp-owner-grid-issue" role="cell"><span>{row.complaint ? labels[row.complaint.type] ?? row.complaint.type : row.type.replaceAll("_", " ").toLowerCase()}</span><small>{row.simulated ? "SIMULATED" : "STORE RECORD"}</small></div><div role="cell"><span className={`pp-owner-case-status-chip ${row.status.toLowerCase()}`}>{row.status.toLowerCase()}</span></div><div className="pp-owner-grid-amount" role="cell">{row.total === undefined ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(row.total)}</div><p className="pp-owner-grid-next" role="cell">{row.suggestedNextStep ?? "Review the available order and payment records."}</p><div role="cell"><Link className="pp-owner-review" href={`/owner/cases/${encodeURIComponent(row.id)}`}>Review <span>↗</span></Link></div></article>)}
        </div>}
      </section>
      <footer className="pp-owner-foot"><span>PayProof · Private store workspace</span><span>Demo records are fictional. No PayPal dispute integration is connected.</span></footer>
    </div>
  </main>;
}
function OwnerShield(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></svg>}
function ComplaintIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h14v11H9l-4 3V5Z"/><path d="M8 9h8M8 12h5"/></svg>}
function IncidentIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 21 19H3L12 3Z"/><path d="M12 9v4m0 3h.01"/></svg>}
