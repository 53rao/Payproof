"use client";
import { useEffect, useRef, useState } from "react";
import type { CaseSnapshot, CaseSource } from "@/lib/case-assistant";
import "../owner-cases.css";
import "./case-detail.css";

type CaseRecord = {
  id: string; orderId: string; type: string; status: string; cause: string; simulated: boolean;
  complaint: { id: string; type: string; originalText: string; createdAt: string } | null;
  report: { body: string; updatedAt: string } | null;
  items?: { kind: string; payload: unknown; createdAt: string }[];
};
type MerchantSubmission = { id: string; body: string; submittedAt: string; sourceIds: string[]; simulated: true };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const date = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Timestamp unavailable";
const typeLabel: Record<string, string> = { ITEM_NOT_RECEIVED: "Item not received", ITEM_DIFFERENT: "Item different from description", PAYMENT_ISSUE: "Payment issue", OTHER: "Other" };
const sourceState = (source: CaseSource) => source.completeness === "MISSING" ? "Unavailable" : source.label.toLowerCase().includes("merchant note") || source.label.toLowerCase().includes("owner-entered") || source.label.toLowerCase().includes("merchant-provided") ? "Merchant-entered · not independently verified" : source.label.toLowerCase().includes("customer complaint") ? "Customer statement · preserved as written" : "Connected record · details shown as stored";

export default function CaseDetailClient({ caseId, merchantName, origin, mode = "admin", waitForStatus = false, onClose, onStatusChange }: { caseId: string; merchantName: string; origin?: string; mode?: "admin" | "merchant"; waitForStatus?: boolean; onClose?: () => void; onStatusChange?: (status: string, responseSubmitted?: boolean) => void }) {
  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [snapshot, setSnapshot] = useState<CaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [focusedSource, setFocusedSource] = useState("");
  const pageRef = useRef<HTMLElement>(null);
  const [note, setNote] = useState("");
  const [noteBusy, setNoteBusy] = useState(false);
  const [customerDraft, setCustomerDraft] = useState("");
  const [customerDraftId, setCustomerDraftId] = useState("");
  const [customerDraftReviewed, setCustomerDraftReviewed] = useState(false);
  const [customerDraftSaving, setCustomerDraftSaving] = useState(false);
  const [customerDraftSaved, setCustomerDraftSaved] = useState(false);
  const [closingReview, setClosingReview] = useState(false);
  const [customerDraftSources, setCustomerDraftSources] = useState<string[]>([]);
  const [responseReport, setResponseReport] = useState("");
  const [responseSources, setResponseSources] = useState<string[]>([]);
  const [submission, setSubmission] = useState<MerchantSubmission | null>(null);
  const [submissionConfirmed, setSubmissionConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const sources = snapshot?.sources ?? [];
  useEffect(() => {
    const dialog = pageRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])'));
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose?.(); }
      if (event.key !== "Tab") return;
      const items = focusable(); const first = items[0]; const last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    dialog.addEventListener("keydown", onKeyDown);
    return () => { dialog.removeEventListener("keydown", onKeyDown); previousFocus?.focus(); };
  }, [onClose, loading]);
  const paymentSource = sources.find((source) => source.label === "Payment event" || source.label === "Payment result");

  useEffect(() => {
    if (waitForStatus) return;
    let active = true;
    void fetch("/api/owner/cases/" + encodeURIComponent(caseId), { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Case details could not be loaded.");
        if (active) {
          setRecord(data.case);
          setSnapshot(data.snapshot);
          setCustomerDraftSaved(false);
          setSubmission(data.submission ?? null);
          setResponseReport(data.case.report?.body ?? data.submission?.body ?? "");
        }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Case details could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [caseId, waitForStatus]);

  async function draftCustomerReply() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/cases/" + encodeURIComponent(caseId) + "/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draft", kind: "customer_status_update" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "A reply draft could not be prepared.");
      setCustomerDraft(data.draft.body);
      setCustomerDraftId(data.draft.id);
      setCustomerDraftSources(data.sourceIds ?? []);
      setCustomerDraftSaved(false);
      setCustomerDraftReviewed(false);
      setCustomerDraftSources([]);
      setNotice("Reply draft ready. Review and edit it before copying.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "A reply draft could not be prepared."); }
    finally { setBusy(false); }
  }

  async function prepareResponse() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/cases/" + encodeURIComponent(caseId) + "/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "response_draft" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The merchant response could not be prepared.");
      const starter = [
        "MERCHANT RESPONSE",
        "Case: " + caseId + " · Order: " + (snapshot?.orderId ?? "unavailable"),
        "Connected records: " + (paymentSource?.detail ?? "No payment event is available in this case."),
        "Customer statement: " + (snapshot?.complaint?.originalText ?? "No customer complaint is attached."),
        "Merchant response: " + data.body,
      ].join("\n\n");
      setResponseReport(starter);
      setResponseSources(data.sourceIds ?? []);
      setSubmissionConfirmed(false);
      setNotice("Response draft ready. Review and edit it before submitting to PayPal.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The merchant response could not be prepared."); }
    finally { setBusy(false); }
  }
  async function saveResponse() {
    if (saving || !responseReport.trim()) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/owner/cases/" + encodeURIComponent(caseId), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ report: responseReport }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The response draft could not be saved.");
      setNotice("Merchant response draft saved " + date(data.updatedAt) + ".");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The response draft could not be saved."); }
    finally { setSaving(false); }
  }
  async function submitResponseToPayPal() {
    if (submitting || isClosed || !submissionConfirmed || !responseReport.trim()) return;
    setSubmitting(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/cases/" + encodeURIComponent(caseId) + "/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: responseReport, sourceIds: responseSources }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The response could not be submitted to PayPal.");
      setSubmission(data.submission);
      setResponseReport(data.submission.body);
      setSubmissionConfirmed(false);
      setRecord((current) => current ? { ...current, status: "REVIEWED" } : current);
      onStatusChange?.("REVIEWED", true);
      setNotice("Response submitted to PayPal (simulated). PayProof admin can now review and close this case.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The response could not be submitted to PayPal."); }
    finally { setSubmitting(false); }
  }
  async function copyReviewedReply() {
    try { await navigator.clipboard.writeText(customerDraft); setNotice("Reviewed customer reply copied. No message was sent."); }
    catch { setError("Clipboard access is unavailable. Select and copy the reviewed draft."); }
  }
  async function saveCustomerReplyDraft() {
    if (!customerDraftId || customerDraftSaving || !customerDraft.trim()) return;
    setCustomerDraftSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/cases/" + encodeURIComponent(caseId) + "/drafts/" + encodeURIComponent(customerDraftId), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ body: customerDraft }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The customer reply draft could not be saved.");
      setCustomerDraft(data.draft.body);
      setCustomerDraftSaved(true);
      onStatusChange?.(record?.status ?? "OPEN");
      setNotice("Customer reply draft saved. It remains unsent.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The customer reply draft could not be saved."); }
    finally { setCustomerDraftSaving(false); }
  }
  async function closeReview() {
    if (!record || record.status === "CLOSED" || !submission || closingReview) return;
    setClosingReview(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/owner/cases/" + encodeURIComponent(caseId) + "/close", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The review could not be closed.");
      setRecord((current) => current ? { ...current, status: "CLOSED" } : current);
      onStatusChange?.("CLOSED", true);
      setNotice("Review closed. The case remains available in the case queue.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The review could not be closed."); }
    finally { setClosingReview(false); }
  }
  function revealSource(id: string) {
    setFocusedSource(id);
    window.setTimeout(() => document.getElementById("case-source-" + id)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "center" }), 40);
  }
  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!note.trim() || noteBusy) return;
    setNoteBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/owner/cases/" + encodeURIComponent(caseId) + "/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The note could not be saved.");
      const source: CaseSource = { id: "merchant-note:" + data.note.id, label: "Merchant note · merchant-provided, unverified", detail: data.note.text, completeness: "PRESENT", occurredAt: data.note.createdAt };
      setSnapshot((current) => current ? { ...current, sources: [...current.sources, source] } : current);
      setNote("");
      setNotice("Merchant note added. It is labeled as merchant-provided and unverified.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The note could not be saved."); }
    finally { setNoteBusy(false); }
  }
  async function createRecoveryLink() {
    if (recoveryBusy) return;
    setRecoveryBusy(true); setRecoveryLink(""); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/owner/cases/${encodeURIComponent(caseId)}/recovery-link`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "A recovery link could not be created.");
      setRecoveryLink(data.url);
      setNotice("A seven-day simulated checkout link is ready. Nothing was sent to the customer.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "A recovery link could not be created."); }
    finally { setRecoveryBusy(false); }
  }
  async function copyRecoveryLink() {
    try { await navigator.clipboard.writeText(recoveryLink); setNotice("Recovery link copied. Share it with the customer after review."); }
    catch { setError("Clipboard access is unavailable. Select and copy the recovery link."); }
  }
  function downloadCasePacket() {
    if (!record || !snapshot) return;
    const issueTitle = snapshot.complaint ? typeLabel[snapshot.complaint.type] ?? snapshot.complaint.type : record.cause;
    const lines = [
      "PAYPROOF CASE PACKET — MERCHANT PREPARATION",
      record.simulated ? "SIMULATED CASE DATA" : "STORE RECORDS",
      "Not submitted to a payment provider. PayProof does not make dispute decisions.",
      "",
      `Case: ${caseId}`,
      `Issue: ${issueTitle}`,
      `Order: ${snapshot.orderId} · ${snapshot.order.status} · ${money(snapshot.order.total)}`,
      `Case status: ${record.status}`,
      `Prepared: ${new Date().toLocaleString()}`,
      "",
      "CUSTOMER STATEMENT (ORIGINAL)",
      snapshot.complaint?.originalText ?? "No customer complaint is attached.",
      "",
      "CONNECTED RECORDS — NEWEST FIRST",
      ...[...sources].sort((a, b) => Date.parse(b.occurredAt ?? "") - Date.parse(a.occurredAt ?? "")).flatMap((source) => [`[${date(source.occurredAt)}] ${source.label} · ${sourceState(source)}`, source.detail, ""]),
      "MISSING INFORMATION",
      ...sources.filter((source) => source.completeness === "MISSING").map((source) => `• ${source.label}: ${source.detail}`),
      ...(sources.some((source) => source.completeness === "MISSING") ? [] : ["No sources are marked unavailable in the current case snapshot."]),
      "",
      "MERCHANT RESPONSE DRAFT",
      responseReport || "No merchant response draft has been prepared.",
      "",
      "This packet contains the records available in this case workspace. Payment records do not establish delivery or customer intent. Review all contents before using it.",
    ];
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `payproof-case-packet-${caseId}.txt`; anchor.click(); URL.revokeObjectURL(url);
  }
  if (loading) return <div className="pp-owner-modal-backdrop pp-case-detail-backdrop"><section ref={pageRef} className="pp-owner-modal pp-case-workspace-modal pp-owner-cases pp-chat-page" role="dialog" aria-modal="true" aria-label="Loading case workspace"><button className="pp-owner-modal-close" onClick={onClose} aria-label="Close case workspace">×</button><div className="pp-case-modal-loading" role="status"><div className="pp-case-loading-mark"><i/><i/><i/></div><p>Loading scoped case records…</p></div></section></div>;
  if (error && !snapshot) return <div className="pp-owner-modal-backdrop pp-case-detail-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}><section ref={pageRef} className="pp-owner-modal pp-case-workspace-modal pp-owner-cases pp-chat-page" role="dialog" aria-modal="true" aria-labelledby="case-modal-title"><button className="pp-owner-modal-close" onClick={onClose} aria-label="Close case workspace">×</button><div className="pp-case-error"><h1 id="case-modal-title">Case unavailable</h1><p>{error}</p><button onClick={onClose}>Back to cases</button></div></section></div>;
  if (!snapshot || !record) return null;

  const issueTitle = snapshot.complaint ? typeLabel[snapshot.complaint.type] ?? snapshot.complaint.type : record.cause;
  const visibleSources = focusedSource ? sources.filter((source) => source.id === focusedSource) : sources;
  const failedOrder = snapshot.order.status.toLowerCase() === "failed";
  const isClosed = record.status === "CLOSED";
  const showReviewSide = mode === "merchant" || failedOrder;
  return <div className="pp-owner-modal-backdrop pp-case-detail-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
    <section ref={pageRef} className="pp-owner-modal pp-case-workspace-modal pp-owner-cases pp-case-detail-page pp-chat-page" role="dialog" aria-modal="true" aria-labelledby="case-modal-title">
      <header className="pp-case-modal-header">
        <div className="pp-case-modal-title">
          <span className="pp-case-modal-merchant">{merchantName} · {snapshot.orderId}</span>
          <div className="pp-case-modal-heading-row">
            <h1 id="case-modal-title">{issueTitle}</h1>
            {mode === "admin" && <button type="button" className="pp-case-close-review-circle" onClick={() => void closeReview()} disabled={record.status === "CLOSED" || !submission || closingReview} aria-label={record.status === "CLOSED" ? "Review closed" : closingReview ? "Closing review" : submission ? "Close review" : "Waiting for the merchant to submit a response"} title={record.status === "CLOSED" ? "Review closed" : closingReview ? "Closing review…" : submission ? "Close review" : "Waiting for the merchant to submit a response"}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 12 4 4 8-8"/></svg></button>}
          </div>
          <div className="pp-case-modal-facts"><span>{caseId}</span><span>Order {snapshot.orderId}</span><strong>{money(snapshot.order.total)}</strong><span>{snapshot.order.status.toLowerCase()}</span><span>{origin === "AGENT" ? "Agent checkout" : origin === "HUMAN" ? "Confirmed human checkout" : "Origin unknown"}</span><span className={`pp-case-status ${record.status.toLowerCase()}`}>{record.status.toLowerCase()}</span>{record.simulated && <span className="pp-case-sim">DEMO · SIMULATED</span>}</div>
        </div>
        <div className="pp-case-modal-header-actions">
          <button className="pp-owner-modal-close" onClick={onClose} aria-label="Close case workspace">×</button>
        </div>
      </header>
      <div className="pp-case-modal-body">
        {mode === "merchant" ? (isClosed ? <div className="pp-case-mode-banner is-admin"><b>Case review closed</b><p>This case is read-only. PayProof admin can reopen it if you need to submit again.</p></div> : <div className="pp-case-mode-banner is-merchant"><b>Respond to this case</b><p>Add store evidence, draft a response with the agent, and submit it to PayPal for review. PayProof admin closes the case after reviewing your submission.</p></div>) : <div className="pp-case-mode-banner is-admin"><b>Admin review</b><p>Review the merchant&apos;s submitted response and case evidence before closing. Closing is a human decision.</p></div>}

        <div className={`pp-case-review-grid${showReviewSide ? "" : " is-single"}`}>
          <div className="pp-case-review-main">
            <aside className="pp-evidence-panel" aria-label="Evidence and case timeline">
              <div className="pp-evidence-head">
                <div><h2>Case evidence</h2><p>{sources.length} attached records · details shown as stored</p></div>
                <div className="pp-evidence-head-actions">
                  <button type="button" onClick={downloadCasePacket}>Download packet</button>
                  {focusedSource && <button type="button" onClick={() => setFocusedSource("")}>All records</button>}
                </div>
              </div>
              <div className="pp-evidence-list">
                {visibleSources.map((source) => (
                  <details key={source.id} id={"case-source-" + source.id} className="pp-evidence-record" open={focusedSource === source.id}>
                    <summary>
                      <span className="pp-evidence-source-icon" aria-hidden="true">{source.completeness === "MISSING" ? "?" : "↗"}</span>
                      <span className="pp-evidence-source-copy"><b>{source.label}</b><small>{date(source.occurredAt)}</small></span>
                      <span className="pp-evidence-state">{source.completeness === "MISSING" ? "Missing" : source.label.toLowerCase().includes("note") ? "Merchant note" : record.simulated ? "Demo" : "Record"}</span>
                    </summary>
                    <div className="pp-evidence-detail"><small>{sourceState(source)}</small><p>{source.detail}</p></div>
                  </details>
                ))}
              </div>
              {!focusedSource && <details className="pp-evidence-timeline"><summary>Expand full timeline</summary><ol>{[...sources].sort((a, b) => Date.parse(b.occurredAt ?? "") - Date.parse(a.occurredAt ?? "")).map((source) => <li key={source.id}><time>{date(source.occurredAt)}</time><button type="button" onClick={() => revealSource(source.id)}>{source.label} ↗</button></li>)}</ol></details>}
              {snapshot.complaint && <details className="pp-evidence-complaint"><summary>Original customer statement</summary><blockquote>{snapshot.complaint.originalText}</blockquote><small>Customer-provided · preserved as written</small></details>}
            </aside>

            {mode === "merchant" ? <>
              <section className="pp-case-draft-card pp-case-submit-card">
                <div className="pp-case-section-heading">
                  <div><h2>Response to PayPal</h2><p>Use the agent to draft a response, review the evidence, then submit it.</p></div>
                  <div className="pp-case-draft-head-actions">
                    {submission && <span className="pp-case-submitted-badge">SUBMITTED</span>}
                    {!submission && responseReport && <span className="pp-case-draft-badge">DRAFT</span>}
                    <button type="button" className="pp-case-primary-button" onClick={() => void prepareResponse()} disabled={busy || isClosed}>{busy ? "Drafting…" : responseReport ? "Draft again" : "Draft with agent"}</button>
                  </div>
                </div>
                {isClosed ? <div className="pp-case-submission-state is-readonly"><b>Submitted to PayPal · simulated</b><p>{submission ? `${date(submission.submittedAt)} · Case closed.` : "This case was closed before a response was submitted."}</p></div> : submission && <div className="pp-case-submission-state" role="status"><b>Submitted to PayPal · simulated</b><p>{date(submission.submittedAt)} · PayProof admin can now review and close this case.</p></div>}
                {responseReport ? <>
                  <textarea aria-label="Edit response to PayPal" value={responseReport} readOnly={isClosed} onChange={(event) => { setResponseReport(event.target.value); setSubmissionConfirmed(false); }} maxLength={12000}/>
                  {responseSources.length > 0 && <details><summary>Show records used</summary><div>{responseSources.map((id) => { const source = sources.find((item) => item.id === id); return source ? <button key={id} type="button" onClick={() => revealSource(id)}>{source.label} ↗</button> : null; })}</div></details>}
                  <div className="pp-case-response-actions">
                    <button type="button" onClick={() => void saveResponse()} disabled={saving || isClosed || !responseReport.trim()}>{saving ? "Saving…" : "Save draft"}</button>
                    <button type="button" onClick={() => navigator.clipboard.writeText(responseReport).then(() => setNotice("Response copied for your review."), () => setError("Clipboard access is unavailable."))}>Copy draft</button>
                    <button type="button" onClick={() => { const url = URL.createObjectURL(new Blob([responseReport], { type: "text/plain;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "payproof-merchant-response-" + caseId + ".txt"; anchor.click(); URL.revokeObjectURL(url); }}>Download</button>
                  </div>
                  <label className="pp-case-review-check"><input type="checkbox" checked={submissionConfirmed} disabled={isClosed} onChange={(event) => setSubmissionConfirmed(event.target.checked)}/> I reviewed this response and confirm the evidence is accurate.</label>
                  <button type="button" className="pp-case-primary-button pp-case-submit-button" onClick={() => void submitResponseToPayPal()} disabled={isClosed || !submissionConfirmed || submitting || !responseReport.trim() || Boolean(submission && responseReport.trim() === submission.body.trim())}>{submitting ? "Submitting…" : submission ? (responseReport.trim() === submission.body.trim() ? "Submitted to PayPal" : "Submit updated response") : "Submit response to PayPal"}</button>
                  <p className="pp-case-submit-note">Simulated demo submission only. No real PayPal dispute is filed.</p>
                </> : <p className="pp-case-draft-empty">No response yet. Ask the agent for a draft, then review and submit it to PayPal.</p>}
              </section>

              <section className="pp-case-draft-card">
                <div className="pp-case-section-heading">
                  <div><h2>Customer reply draft</h2><p>Optional · review and edit before copying. Nothing is sent.</p></div>
                  <div className="pp-case-draft-head-actions">
                    {customerDraft && <span className="pp-case-draft-badge">DRAFT</span>}
                    <button type="button" className="pp-case-primary-button" onClick={() => void draftCustomerReply()} disabled={busy}>{busy ? "Drafting…" : customerDraft ? "Draft again" : "Draft customer reply"}</button>
                  </div>
                </div>
                {customerDraft ? <>
                  <textarea aria-label="Edit customer reply draft" value={customerDraft} onChange={(event) => { setCustomerDraft(event.target.value); setCustomerDraftSaved(false); setCustomerDraftReviewed(false); }} maxLength={1800}/>
                  {customerDraftSources.length > 0 && <details><summary>Show records used</summary><div>{customerDraftSources.map((id) => { const source = sources.find((item) => item.id === id); return source ? <button key={id} type="button" onClick={() => revealSource(id)}>{source.label} ↗</button> : null; })}</div></details>}
                  <div className="pp-case-response-actions"><button type="button" onClick={() => void saveCustomerReplyDraft()} disabled={customerDraftSaving}>{customerDraftSaving ? "Saving…" : "Save draft"}</button>{customerDraftSaved && <span role="status">Saved</span>}</div>
                  <label className="pp-case-review-check"><input type="checkbox" checked={customerDraftReviewed} onChange={(event) => setCustomerDraftReviewed(event.target.checked)}/> I reviewed this reply and its wording.</label>
                  <button type="button" className="pp-case-primary-button" disabled={!customerDraftReviewed} onClick={() => void copyReviewedReply()}>Copy reviewed reply</button>
                </> : <p className="pp-case-draft-empty">No customer reply yet. Prepare one, then edit, save, and copy it when you are ready.</p>}
              </section>
            </> : (
              <section className="pp-case-draft-card pp-case-submission-readonly">
                <div className="pp-case-section-heading">
                  <div><h2>Merchant submission</h2><p>Read-only · submitted by the merchant for PayProof review.</p></div>
                  {submission && <span className="pp-case-submitted-badge">SUBMITTED</span>}
                </div>
                {submission ? <>
                  <div className="pp-case-submission-state is-readonly"><b>Submitted to PayPal · simulated</b><p>{date(submission.submittedAt)}</p></div>
                  <pre>{submission.body}</pre>
                </> : <p className="pp-case-draft-empty">The merchant has not submitted a response yet. The close review control stays disabled until they do.</p>}
              </section>
            )}
          </div>

          {showReviewSide && <div className="pp-case-review-side">
            {mode === "merchant" && <details className="pp-case-context">
              <summary>Add evidence</summary>
              <p>Add what you checked, a store observation, or context the records do not contain. Evidence is stored as merchant-provided and unverified. Do not add full payment card details, security codes, passwords, or API keys.</p>
              <form onSubmit={addNote}>
                <label className="sr-only" htmlFor="merchant-case-note">Merchant evidence or context</label>
                <textarea id="merchant-case-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} placeholder="Add what you checked, a store observation, or context the records do not contain…"/>
                <button type="submit" disabled={noteBusy || !note.trim()}>{noteBusy ? "Saving evidence…" : "Save evidence"}</button>
              </form>
            </details>}

            {failedOrder && <details className="pp-case-winback">
              <summary>Recover this sale <small>Owner-approved · simulated checkout</small></summary>
              <p>Create a fresh checkout for the same order items. This does not retry the original payment or send anything to the customer.</p>
              <button type="button" onClick={() => void createRecoveryLink()} disabled={recoveryBusy}>{recoveryBusy ? "Creating link…" : recoveryLink ? "Create a new link" : "Create recovery link"}</button>
              {recoveryLink && <div className="pp-case-recovery-link"><input aria-label="Simulated recovery link" readOnly value={recoveryLink}/><button type="button" onClick={() => void copyRecoveryLink()}>Copy</button><a href={recoveryLink} target="_blank" rel="noreferrer">Preview</a><small>Expires in 7 days · checkout is simulated</small></div>}
            </details>}
          </div>}
        </div>

        {error && <p className="pp-case-inline-error" role="alert">{error}</p>}{notice && <p className="pp-case-inline-notice" role="status">{notice}</p>}
      </div>
    </section>
  </div>;
}
