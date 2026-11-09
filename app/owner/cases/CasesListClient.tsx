"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import CaseDetailClient from "./[caseId]/CaseDetailClient";
import "./owner-cases.css";

type Complaint = { id: string; type: string; originalText: string; createdAt: string } | null;
type CaseRow = { id: string; orderId: string; type: string; status: string; cause: string; createdAt: string; simulated: boolean; merchantId: string; merchantName: string; customerReplySaved: boolean; origin?: "AGENT" | "HUMAN" | "UNKNOWN"; agentHandled?: boolean; humanReviewRequired?: boolean; orderStatus?: string; total?: number; suggestedNextStep?: string; complaint: Complaint };
type MerchantOption = { id: string; name: string };
type MerchantHealth = { id: string; name: string; openCases?: number; casesNeedingAction?: number; failedPayments?: number; orderCount?: number };
const columns = [{ id: "OPEN", title: "Open", hint: "Needs review" }, { id: "REVIEWED", title: "In review", hint: "Being handled" }, { id: "CLOSED", title: "Closed", hint: "Review complete" }];
const issueLabel = (row: CaseRow) => row.complaint ? ({ ITEM_NOT_RECEIVED: "Item not received", ITEM_DIFFERENT: "Item different from description", PAYMENT_ISSUE: "Payment issue", OTHER: "Other" }[row.complaint.type] ?? row.complaint.type) : row.type.replaceAll("_", " ").toLowerCase();

export default function CasesListClient({ mode = "admin", embedded = false, dataUrl }: { mode?: "admin" | "merchant"; embedded?: boolean; dataUrl?: string }) {
  const isMerchant = mode === "merchant";
  const homeHref = isMerchant ? "/merchant" : "/admin";
  const casesUrl = dataUrl ?? (isMerchant ? "/api/merchant/cases" : "/api/owner/cases");
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("All merchants");
  const [kind, setKind] = useState("All cases");
  const [selected, setSelected] = useState<CaseRow | null>(null);
  const [waitingForStatusSave, setWaitingForStatusSave] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [merchants, setMerchants] = useState<MerchantOption[]>([]);
  const [merchantHealth, setMerchantHealth] = useState<MerchantHealth[]>([]);

  useEffect(() => {
    if (!isMerchant) {
      void fetch("/api/demo/merchant-analytics", { cache: "no-store" }).then(async (r) => {
        const data = await r.json();
        if (r.ok && data.merchants) {
          setMerchants(data.merchants.map((m: { id: string; name: string }) => ({ id: m.id, name: m.name })));
          setMerchantHealth(data.merchants);
        }
      }).catch(() => {});
    }
    const params = new URLSearchParams(window.location.search);
    const requestedMerchant = params.get("merchantId");
    const initialFilter = isMerchant
      ? "All merchants"
      : requestedMerchant
        ? requestedMerchant
        : localStorage.getItem("payproof-owner-cases-merchant") ?? "All merchants";
    setFilter(initialFilter);
    if (!isMerchant && initialFilter !== "All merchants") localStorage.setItem("payproof-owner-cases-merchant", initialFilter);
    void fetch(casesUrl, { cache: "no-store" }).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error ?? "Cases could not be loaded.");
      const rows: CaseRow[] = data.cases ?? [];
      setCases(rows);
      const requestedCase = params.get("caseId");
      if (requestedCase) {
        const matched = rows.find((row) => row.id === requestedCase);
        if (matched) setSelected(matched);
      }
    }).catch((e) => setError(e instanceof Error ? e.message : "Cases could not be loaded.")).finally(() => setLoading(false));
  }, [casesUrl, isMerchant]);

  const visible = useMemo(() => cases.filter((row) => (filter === "All merchants" || row.merchantId === filter) && (kind === "All cases" || (kind === "Customer complaints" ? Boolean(row.complaint) : row.type !== "CUSTOMER_COMPLAINT"))), [cases, filter, kind]);

  function chooseMerchant(value: string) {
    setFilter(value);
    localStorage.setItem("payproof-owner-cases-merchant", value);
  }

  async function moveCase(row: CaseRow, status: string) {
    if (row.status === status || saving) return false;
    if (status === "CLOSED" && isMerchant) { setError("PayProof admin closes a case after reviewing your submission."); return false; }
    if (status === "CLOSED" && !row.customerReplySaved) { setError("Save a customer reply draft for this case before closing it."); return false; }
    const previous = row.status;
    setSaving(row.id);
    setCases((items) => items.map((item) => item.id === row.id ? { ...item, status } : item));
    try {
      const response = await fetch(`/api/owner/cases/${encodeURIComponent(row.id)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Case status could not be saved.");
      setError("");
      return true;
    } catch (e) {
      setCases((items) => items.map((item) => item.id === row.id ? { ...item, status: previous } : item));
      setError(e instanceof Error ? e.message : "Case status could not be saved.");
      return false;
    } finally {
      setSaving(null);
    }
  }

  const closeModal = useCallback(() => { setSelected(null); setWaitingForStatusSave(false); }, []);

  async function openCase(row: CaseRow) {
    setError("");
    setSelected(row.status === "OPEN" ? { ...row, status: "REVIEWED" } : row);
    if (row.status === "OPEN") {
      setWaitingForStatusSave(true);
      if (!await moveCase(row, "REVIEWED")) { setSelected(null); setWaitingForStatusSave(false); return; }
      setWaitingForStatusSave(false);
    }
  }

  function syncModalCase(status: string, customerReplySaved?: boolean) {
    setCases((items) => items.map((item) => item.id === selected?.id ? { ...item, status, customerReplySaved: customerReplySaved ?? item.customerReplySaved } : item));
    setSelected((item) => item ? { ...item, status, customerReplySaved: customerReplySaved ?? item.customerReplySaved } : item);
  }

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setSelected(null); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [selected]);

  const Shell = embedded ? "div" : "main";
  return <Shell className={`pp-owner-cases${isMerchant ? " pp-merchant-cases" : " pp-admin-cases"}${embedded ? " is-embedded" : ""}`}>
    {!embedded && <header className="pp-owner-top"><Link href={homeHref} className="pp-owner-brand"><span>p.</span> PayProof <small>{isMerchant ? "MERCHANT PORTAL" : "MERCHANT DESK"}</small></Link><div><span className="pp-owner-demo">SIMULATED WORKSPACE</span><Link href={homeHref}>{isMerchant ? "Back to store ↗" : "Back to overview ↗"}</Link></div></header>}
    <div className="pp-owner-container">
      {!embedded && <nav className="pp-owner-breadcrumb"><Link href={homeHref}>{isMerchant ? "Merchant portal" : "Merchant desk"}</Link><span>/</span><b>Cases &amp; complaints</b></nav>}
      {!embedded && <section className="pp-owner-title"><h1>{isMerchant ? <>Cases &amp; <em>complaints</em></> : <>Case <em>review</em></>}</h1>{!isMerchant && <p className="pp-case-review-sub">Merchant-submitted case records and evidence, ready for admin review.</p>}</section>}
      {!isMerchant && <section className="pp-case-review-summary" aria-label="Merchant case health">
        <div className="pp-case-review-stats">
          <article><span>Open cases</span><b>{merchantHealth.reduce((sum, merchant) => sum + (merchant.openCases ?? 0), 0)}</b><small>Across all merchants</small></article>
          <article><span>Need action</span><b>{merchantHealth.reduce((sum, merchant) => sum + (merchant.casesNeedingAction ?? 0), 0)}</b><small>Human payment failures</small></article>
          <article><span>Merchants</span><b>{merchantHealth.length}</b><small>With case activity</small></article>
        </div>
        <div className="pp-case-review-merchants">
          <div className="pp-case-review-merchants-head"><b>Merchant health</b><small>Select a merchant to review their cases</small></div>
          {merchantHealth.map((merchant) => {
            const rate = merchant.orderCount ? Math.round(((merchant.failedPayments ?? 0) / merchant.orderCount) * 100) : 0;
            return <button type="button" key={merchant.id} className={`pp-case-review-merchant${filter === merchant.id ? " is-selected" : ""}`} onClick={() => chooseMerchant(filter === merchant.id ? "All merchants" : merchant.id)}>
              <span className="pp-case-review-merchant-name">{merchant.name}</span>
              <span>{merchant.openCases ?? 0} open</span>
              <span>{merchant.casesNeedingAction ?? 0} need action</span>
              <span className={rate >= 50 ? "is-red" : rate >= 20 ? "is-amber" : "is-green"}>{rate}% failure</span>
            </button>;
          })}
        </div>
      </section>}
      <section className="pp-owner-case-panel">
        <div className="pp-owner-case-toolbar">
          {!embedded && <div><h2>{isMerchant ? "Your case board" : "Case board"}</h2><p>{loading ? "Loading case records…" : `${visible.length} ${visible.length === 1 ? "case" : "cases"} · fictional demo records`}</p></div>}
          <div className="pp-owner-board-filters">
            {!isMerchant && <label className="pp-owner-filter"><span className="sr-only">Filter by merchant</span><select value={filter} onChange={(e) => chooseMerchant(e.target.value)}><option>All merchants</option>{merchants.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>}
            <label className="pp-owner-filter"><span className="sr-only">Filter cases</span><select value={kind} onChange={(e) => setKind(e.target.value)}><option>All cases</option><option>Customer complaints</option><option>Payment incidents</option></select></label>
          </div>
        </div>
        {error && <div className="pp-owner-board-toast" role="alert"><div><b>Couldn’t update the case board.</b><p>{error}</p></div><button type="button" onClick={() => setError("")} aria-label="Dismiss error">×</button></div>}
        {loading ? <div className="pp-owner-list-loading" role="status" aria-label="Loading cases"><i/><i/><i/></div> : <div className="pp-owner-kanban">{columns.map((column) => {
          const rows = visible.filter((row) => row.status === column.id);
          return <section className="pp-owner-lane" key={column.id} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const row = cases.find((item) => item.id === e.dataTransfer.getData("text/case-id")); if (row) void moveCase(row, column.id); }}>
            <header><div><h3>{column.title}</h3><small>{column.hint}</small></div><span>{rows.length}</span></header>
            {rows.length ? rows.map((row) => <article className="pp-owner-case-card" key={row.id} draggable onDragStart={(e) => { e.dataTransfer.setData("text/case-id", row.id); e.dataTransfer.effectAllowed = "move"; }}>
              <div className="pp-owner-card-meta"><span>{row.merchantName}</span><span className={`pp-owner-case-status-chip ${row.status.toLowerCase()}`}>{row.status.toLowerCase()}</span></div>
              <button className="pp-owner-card-open" onClick={() => void openCase(row)} aria-label={`Open ${row.id} case workspace`}><b>{issueLabel(row)}</b><small>{row.id} · {row.orderId}</small><small>{row.total === undefined ? "Amount unavailable" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(row.total)} · {row.origin === "AGENT" ? "Agent checkout" : "Store checkout"}</small></button>
              <div className="pp-owner-card-foot"><span>{row.complaint ? "Customer complaint" : "Payment incident"}</span><button onClick={() => void openCase(row)}>Review</button></div>
            </article>) : <div className="pp-owner-lane-empty">Drop a case here</div>}
          </section>;
        })}</div>}
      </section>
      {!embedded && <footer className="pp-owner-foot"><span>PayProof · Private store workspace</span><span>Demo records are fictional. No payment dispute integration is connected.</span></footer>}
    </div>
    {selected && <CaseDetailClient caseId={selected.id} merchantName={selected.merchantName} origin={selected.origin} mode={mode} waitForStatus={waitingForStatusSave} onClose={closeModal} onStatusChange={syncModalCase}/>}
  </Shell>;
}
