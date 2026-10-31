"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { gsap } from "gsap";
import Link from "next/link";
import type { CaseSnapshot, CaseSource, IncidentExplanation } from "@/lib/case-assistant";
import "../owner-cases.css";
import "./case-detail.css";

type CaseRecord = {
  id: string; orderId: string; type: string; status: string; cause: string; simulated: boolean;
  complaint: { id: string; type: string; originalText: string; createdAt: string } | null;
  report: { body: string; updatedAt: string } | null;
  items?: { kind: string; payload: unknown; createdAt: string }[];
};
type Exchange = { question: string; explanation: IncidentExplanation; showEvidence: boolean };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const date = (value?: string | null) => value ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Timestamp unavailable";
const typeLabel: Record<string, string> = { ITEM_NOT_RECEIVED: "Item not received", ITEM_DIFFERENT: "Item different from description", PAYMENT_ISSUE: "Payment issue", OTHER: "Other" };
const sourceState = (source: CaseSource) => source.completeness === "MISSING" ? "Unavailable" : source.label.toLowerCase().includes("merchant note") || source.label.toLowerCase().includes("owner-entered") ? "Merchant-entered · not independently verified" : source.label.toLowerCase().includes("customer complaint") ? "Customer statement · preserved as written" : "Connected record · details shown as stored";

export default function CaseDetailClient({ caseId }: { caseId: string }) {
  const [record, setRecord] = useState<CaseRecord | null>(null);
  const [snapshot, setSnapshot] = useState<CaseSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [question, setQuestion] = useState("");
  const [exchange, setExchange] = useState<Exchange[]>([]);
  const [showEvidence, setShowEvidence] = useState(true);
  const [progressStep, setProgressStep] = useState(0);
  const [mobileEvidenceOpen, setMobileEvidenceOpen] = useState(false);
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
  const [reportPrepared, setReportPrepared] = useState(false);
  const [recoveryLink, setRecoveryLink] = useState("");
  const [recoveryBusy, setRecoveryBusy] = useState(false);

  const sources = snapshot?.sources ?? [];
  function toggleEvidence() {
    if (window.matchMedia("(max-width: 760px)").matches) {
      setShowEvidence(true);
      setMobileEvidenceOpen((open) => !open);
      return;
    }
    setShowEvidence((open) => !open);
  }
  useEffect(() => {
    if (!busy) { setProgressStep(0); return; }
    const timer = window.setInterval(() => setProgressStep((step) => Math.min(step + 1, 2)), 850);
    return () => window.clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (!mobileEvidenceOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileEvidenceOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileEvidenceOpen]);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const context = gsap.context(() => {
      gsap.fromTo(".pp-chat-message-new", { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.32, ease: "power2.out", clearProps: "transform,opacity" });
      if (showEvidence) gsap.fromTo(".pp-evidence-panel", { x: 12, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28, ease: "power2.out" });
      if (focusedSource) gsap.fromTo("#case-source-" + CSS.escape(focusedSource), { backgroundColor: "#f1f3f4" }, { backgroundColor: "#fff", duration: 1.1, ease: "power2.out" });
    }, pageRef);
    return () => context.revert();
  }, [exchange.length, showEvidence, focusedSource]);
  const customerComplaintSource = sources.find((source) => source.label.startsWith("Customer complaint"));
  const paymentSource = sources.find((source) => source.label === "Payment event" || source.label === "Payment result");
  const initialSummary = useMemo(() => {
    if (!snapshot) return null;
    const failedCapture = paymentSource?.detail.toLowerCase().includes("capture_result") && paymentSource.detail.toLowerCase().includes("failed");
    const captured = sources.some((source) => (source.label === "Payment event" || source.label === "Payment result") && source.detail.toLowerCase().includes("completed"));
    const confirmed = failedCapture ? "The connected records show a failed capture and no successful capture record." : captured ? "The connected records include a successful capture result." : "The connected records show order status " + snapshot.order.status.toLowerCase() + "; a successful capture result is not established here.";
    return {
      confirmed: confirmed + (paymentSource ? " Payment record: " + paymentSource.detail + "." : " No payment event is available in this case."),
      unknown: "These records cannot confirm whether the customer’s account shows a temporary authorization. A customer report of a charge is not proof that PayPal captured the payment.",
      next: "Check the available processor details and transaction reference for an authorization or successful capture record.",
    };
  }, [snapshot, paymentSource, sources]);

  useEffect(() => {
    let active = true;
    void fetch("/api/owner/cases/" + encodeURIComponent(caseId), { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error ?? "Case details could not be loaded.");
        if (active) {
          setRecord(data.case);
          setSnapshot(data.snapshot);
          setCustomerDraftSaved(Boolean(data.canCloseReview));
          setResponseReport(data.case.report?.body ?? "");
          setReportPrepared(Boolean(data.case.report?.body));
        }
      })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Case details could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [caseId]);

  async function askQuestion(prompt: string) {
    if (busy || !prompt.trim()) return;
    const normalized = prompt.trim().toLowerCase();
    if (normalized === "what do the connected records confirm?" || normalized === "what information or records are missing?") {
      const relevant = normalized.startsWith("what do")
        ? sources.filter((source) => source.label === "Order record" || source.label === "Payment event" || source.label === "Payment result" || source.label.startsWith("Stock reservation"))
        : sources.filter((source) => source.completeness === "MISSING");
      const summary = normalized.startsWith("what do")
        ? "The order record shows " + snapshot?.order.status.toLowerCase() + " for " + caseId + ". " + (paymentSource?.detail ?? "No payment event is connected to this case.") + "."
        : relevant.length ? "These records are unavailable in the connected workspace: " + relevant.map((source) => source.label.toLowerCase()).join(", ") + "." : "No sources are marked unavailable in the records currently attached to this case.";
      setExchange((items) => [...items, { question: prompt, showEvidence: false, explanation: { summary, likely_cause: snapshot?.cause ?? "Not established by the available records.", uncertainty: snapshot?.uncertainty ?? "Some case details may be unavailable.", evidence: relevant.map((source) => ({ sourceId: source.id, label: source.label, finding: source.detail })), next_steps: relevant.length && normalized.startsWith("what information") ? ["Check whether the source system has a record that can be attached to this case."] : ["Check the payment processor details and reservation state before replying."], generatedBy: "template" } }]);
      setQuestion("");
      return;
    }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/cases/" + encodeURIComponent(caseId) + "/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "question", question: prompt }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The assistant could not review this question.");
      setExchange((items) => [...items, { question: prompt, explanation: data.explanation, showEvidence: false }]);
      setQuestion("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The assistant could not review this question."); }
    finally { setBusy(false); }
  }
  async function submitQuestion(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); await askQuestion(question); }

  async function draftCustomerReply() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/cases/" + encodeURIComponent(caseId) + "/assistant", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "draft", kind: "customer_status_update" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "A reply draft could not be prepared.");
      setCustomerDraft(data.draft.body);
      setCustomerDraftId(data.draft.id);
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
      const starter = responseReport || [
        "MERCHANT RESPONSE — DRAFT FOR REVIEW",
        "Case: " + caseId + " · Order: " + (snapshot?.orderId ?? "unavailable"),
        "Connected records: " + (paymentSource?.detail ?? "No payment event is available in this case."),
        "Customer statement: " + (snapshot?.complaint?.originalText ?? "No customer complaint is attached."),
        "Merchant response: " + data.body,
        "PayPal is the final decision-maker. This response has not been submitted.",
      ].join("\n\n");
      setResponseReport(starter);
      setReportPrepared(true);
      setCustomerDraftSources(data.sourceIds ?? []);
      setNotice("Merchant response prepared for your review. Nothing was sent or submitted.");
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
      setNotice("Customer reply draft saved. It remains unsent.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The customer reply draft could not be saved."); }
    finally { setCustomerDraftSaving(false); }
  }
  async function closeReview() {
    if (!record || record.status === "CLOSED" || !customerDraftSaved || closingReview) return;
    setClosingReview(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/owner/cases/" + encodeURIComponent(caseId) + "/close", { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "The review could not be closed.");
      setRecord((current) => current ? { ...current, status: "CLOSED" } : current);
      setNotice("Review closed. The case remains available in the case queue.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The review could not be closed."); }
    finally { setClosingReview(false); }
  }
  function revealSource(id: string) {
    setFocusedSource(id);
    setShowEvidence(true);
    setMobileEvidenceOpen(true);
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
      const source: CaseSource = { id: "merchant-note:" + data.note.id, label: "Merchant note · owner-provided, unverified", detail: data.note.text, completeness: "PRESENT", occurredAt: data.note.createdAt };
      setSnapshot((current) => current ? { ...current, sources: [...current.sources, source] } : current);
      setNote("");
      setNotice("Merchant note added. It is labeled as owner-provided and unverified.");
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
      "Not submitted to PayPal. PayPal is the final decision-maker.",
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
  if (loading) return <main className="pp-owner-cases pp-case-loading"><div className="pp-case-loading-mark"><i/><i/><i/></div><p>Loading scoped case records…</p></main>;
  if (error && !snapshot) return <main className="pp-owner-cases"><div className="pp-case-error"><h1>Case unavailable</h1><p>{error}</p><Link href="/owner/cases">Back to cases</Link></div></main>;
  if (!snapshot || !record || !initialSummary) return null;

  const issueTitle = snapshot.complaint ? typeLabel[snapshot.complaint.type] ?? snapshot.complaint.type : record.cause;
  const visibleSources = focusedSource ? sources.filter((source) => source.id === focusedSource) : sources;
  const progressLabels = ["Checking payment record", "Comparing order status", "Preparing answer"];
  return <main ref={pageRef} className="pp-owner-cases pp-case-detail-page pp-chat-page">
    <header className="pp-owner-top"><Link href="/admin" className="pp-owner-brand"><span>p.</span> PayProof <small>MERCHANT DESK</small></Link><div><span className="pp-owner-demo">SIMULATED WORKSPACE</span><Link href="/owner/cases">Case queue ↗</Link></div></header>
    <div className="pp-owner-container">
      <nav className="pp-owner-breadcrumb" aria-label="Breadcrumb"><Link href="/admin">Merchant desk</Link><span>/</span><Link href="/owner/cases">Cases</Link><span>/</span><b>{caseId}</b></nav>
      <section className="pp-case-head pp-compact-case-head"><div><h1>{issueTitle}</h1><p><span>{caseId}</span><span>Order {snapshot.orderId}</span><strong>{money(snapshot.order.total)}</strong></p></div><div className="pp-case-badges"><span className="pp-case-status">{record.status.toLowerCase()}</span>{record.simulated && <span className="pp-case-sim">DEMO · SIMULATED</span>}<button className="pp-evidence-toggle" type="button" onClick={toggleEvidence} aria-expanded={showEvidence}>Evidence <span>{sources.length}</span></button></div></section>
      <div className="pp-case-close-review"><div><b>{record.status === "CLOSED" ? "Review closed" : "Review status"}</b><p>{record.status === "CLOSED" ? "This case is closed. Its records remain available for reference." : customerDraftSaved ? "Your customer reply draft is saved and this review can now be closed." : "Save a customer reply draft to enable closing this review."}</p></div><button type="button" onClick={() => void closeReview()} disabled={!customerDraftSaved || record.status === "CLOSED" || closingReview}>{closingReview ? "Closing review…" : record.status === "CLOSED" ? "Review closed" : "Close review"}</button></div>

      {snapshot.order.status.toLowerCase() === "failed" && <details className="pp-case-winback"><summary>Recover this sale <small>Owner-approved · simulated checkout</small></summary><p>Create a fresh checkout for the same order items. This does not retry the original payment or send anything to the customer.</p><button type="button" onClick={() => void createRecoveryLink()} disabled={recoveryBusy}>{recoveryBusy ? "Creating link…" : recoveryLink ? "Create a new link" : "Create recovery link"}</button>{recoveryLink && <div className="pp-case-recovery-link"><input aria-label="Simulated recovery link" readOnly value={recoveryLink}/><button type="button" onClick={() => void copyRecoveryLink()}>Copy</button><a href={recoveryLink} target="_blank" rel="noreferrer">Preview</a><small>Expires in 7 days · checkout is simulated</small></div>}</details>}

      <div className={"pp-assistant-workspace " + (showEvidence ? "has-evidence" : "") }>
        <section className="pp-assistant-chat" aria-label="PayProof case assistant">
          <div className="pp-conversation-scroll" aria-live="polite">
            <div className="pp-conversation-title"><div><span className="pp-assistant-avatar" aria-hidden="true">P</span><div><h2>PayProof assistant</h2><p>Case records only · {record.simulated ? "Simulated data" : "Connected store data"}</p></div></div><button type="button" onClick={toggleEvidence}>{mobileEvidenceOpen ? "Close evidence" : showEvidence ? "Evidence visible" : "Open evidence"}</button></div>
            <article className="pp-assistant-opening pp-chat-message-new"><p>Here’s what the records show.</p><dl><div><dt>Confirmed</dt><dd>{initialSummary.confirmed}</dd>{paymentSource && <button type="button" onClick={() => revealSource(paymentSource.id)}>Payment record ↗</button>}</div><div><dt>Uncertain</dt><dd>{initialSummary.unknown}</dd>{customerComplaintSource && <button type="button" onClick={() => revealSource(customerComplaintSource.id)}>Customer statement ↗</button>}</div><div><dt>Next useful check</dt><dd>{initialSummary.next}</dd></div></dl><small>Suggestions are not findings. PayPal makes the final decision on any dispute.</small></article>
            {exchange.map((turn, index) => <article className="pp-chat-exchange pp-chat-message-new" key={turn.question + index}><p className="pp-chat-user-bubble">{turn.question}</p><div className="pp-chat-answer"><span>Based on this case</span><p>{turn.explanation.summary}</p><p>{turn.explanation.uncertainty}</p>{turn.explanation.next_steps.length > 0 && <p><b>Next check:</b> {turn.explanation.next_steps.join(" ")}</p>}<div className="pp-chat-citations"><span>Sources</span>{turn.explanation.evidence.length ? turn.explanation.evidence.map((citation) => { const source = sources.find((item) => item.id === citation.sourceId); return source ? <button key={citation.sourceId} type="button" onClick={() => revealSource(citation.sourceId)}>{source.label} · {date(source.occurredAt)} ↗</button> : null; }) : <small>No source records were cited.</small>}<button type="button" onClick={() => { setFocusedSource(""); setShowEvidence(true); setMobileEvidenceOpen(window.matchMedia("(max-width: 900px)").matches); }}>Show evidence</button></div></div></article>)}
            {busy && <div className="pp-progress-state" role="status" aria-live="polite"><span className="pp-progress-pulse" aria-hidden="true"><i/><i/><i/></span><div><b>{progressLabels[progressStep]}</b><small>Reviewing records attached to this case</small></div></div>}
          </div>
          <div className="pp-chat-bottom"><div className="pp-chat-prompts" aria-label="Suggested questions"><button type="button" disabled={busy} onClick={() => void askQuestion("What do the connected records confirm?")}>What do we know?</button><button type="button" disabled={busy} onClick={() => void askQuestion("What information or records are missing?")}>What’s missing?</button><button type="button" onClick={() => { setFocusedSource(""); setShowEvidence(true); setMobileEvidenceOpen(window.matchMedia("(max-width: 900px)").matches); }}>Show evidence</button><button type="button" disabled={busy} onClick={() => void draftCustomerReply()}>Draft a customer reply</button></div><form className="pp-case-ask pp-chat-composer" onSubmit={submitQuestion}><label className="sr-only" htmlFor="case-question">Ask a specific question about this case</label><textarea id="case-question" value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={500} placeholder="Ask a question about this case…" disabled={busy}/><button type="submit" aria-label="Send question" disabled={busy || !question.trim()}><span>↑</span></button></form><p className="pp-chat-privacy">Private case workspace. Questions don’t send messages or change records.</p></div>
        </section>
        {showEvidence && <aside className={"pp-evidence-panel " + (mobileEvidenceOpen ? "is-mobile-open" : "")} aria-label="Evidence and case timeline" role={mobileEvidenceOpen ? "dialog" : undefined} aria-modal={mobileEvidenceOpen || undefined}><div className="pp-evidence-head"><div><h2>Case evidence</h2><p>{sources.length} attached records · details shown as stored</p></div><div className="pp-evidence-head-actions"><button type="button" onClick={downloadCasePacket}>Download packet</button>{focusedSource && <button type="button" onClick={() => setFocusedSource("")}>All records</button>}<button type="button" onClick={() => { setShowEvidence(false); setMobileEvidenceOpen(false); }} aria-label="Close evidence panel">×</button></div></div><div className="pp-evidence-list">{visibleSources.map((source) => <details key={source.id} id={"case-source-" + source.id} className="pp-evidence-record" open={focusedSource === source.id}><summary><span className="pp-evidence-source-icon" aria-hidden="true">{source.completeness === "MISSING" ? "?" : "↗"}</span><span className="pp-evidence-source-copy"><b>{source.label}</b><small>{date(source.occurredAt)}</small></span><span className="pp-evidence-state">{source.completeness === "MISSING" ? "Missing" : source.label.toLowerCase().includes("note") ? "Owner note" : record.simulated ? "Demo" : "Record"}</span></summary><div className="pp-evidence-detail"><small>{sourceState(source)}</small><p>{source.detail}</p></div></details>)}</div>{!focusedSource && <details className="pp-evidence-timeline"><summary>Expand full timeline</summary><ol>{[...sources].sort((a, b) => Date.parse(b.occurredAt ?? "") - Date.parse(a.occurredAt ?? "")).map((source) => <li key={source.id}><time>{date(source.occurredAt)}</time><button type="button" onClick={() => revealSource(source.id)}>{source.label} ↗</button></li>)}</ol></details>}{snapshot.complaint && <details className="pp-evidence-complaint"><summary>Original customer statement</summary><blockquote>{snapshot.complaint.originalText}</blockquote><small>Customer-provided · preserved as written</small></details>}</aside>}
      </div>

      {mobileEvidenceOpen && <button className="pp-evidence-backdrop" aria-label="Close evidence panel" onClick={() => setMobileEvidenceOpen(false)} />}

      {customerDraft && <section className="pp-case-draft-card"><div className="pp-case-section-heading"><div><h2>Customer reply draft</h2><p>Review and edit before copying. Nothing is sent.</p></div><span className="pp-case-draft-badge">DRAFT</span></div><textarea aria-label="Edit customer reply draft" value={customerDraft} onChange={(event) => { setCustomerDraft(event.target.value); setCustomerDraftSaved(false); setCustomerDraftReviewed(false); }} maxLength={1800}/>{customerDraftSources.length > 0 && <details><summary>Show records used</summary><div>{customerDraftSources.map((id) => { const source = sources.find((item) => item.id === id); return source ? <button key={id} type="button" onClick={() => revealSource(id)}>{source.label} ↗</button> : null; })}</div></details>}<div className="pp-case-response-actions"><button type="button" onClick={() => void saveCustomerReplyDraft()} disabled={customerDraftSaving}>{customerDraftSaving ? "Saving…" : "Save draft"}</button>{customerDraftSaved && <span role="status">Saved</span>}</div><label className="pp-case-review-check"><input type="checkbox" checked={customerDraftReviewed} onChange={(event) => setCustomerDraftReviewed(event.target.checked)}/> I reviewed this reply and its wording.</label><button type="button" className="pp-case-primary-button" disabled={!customerDraftReviewed} onClick={() => void copyReviewedReply()}>Copy reviewed reply</button></section>}

      {showEvidence && <section id="case-evidence" className="pp-case-evidence-panel"><div className="pp-case-section-heading"><div><h2>Evidence behind this case</h2><p>Source, time, and the exact stored details. Owner notes are not independently verified.</p></div><button type="button" className="pp-case-text-action" onClick={() => setFocusedSource("")}>{focusedSource ? "Show all sources" : sources.length + " sources"}</button></div>
        <div className="pp-case-evidence-records">{visibleSources.map((source) => <details key={source.id} id={"case-source-" + source.id} open={focusedSource === source.id}><summary><span><b>{source.label}</b><small>{sourceState(source)}</small></span><time>{date(source.occurredAt)}</time></summary><p>{source.detail}</p></details>)}</div>
        {!focusedSource && <details className="pp-case-full-timeline"><summary>Expand full case timeline</summary><ol>{[...sources].sort((a, b) => Date.parse(a.occurredAt ?? "") - Date.parse(b.occurredAt ?? "")).map((source) => <li key={source.id}><time>{date(source.occurredAt)}</time><button type="button" onClick={() => revealSource(source.id)}>{source.label} ↗</button><span>{sourceState(source)}</span></li>)}</ol></details>}
      </section>}

      <details className="pp-case-context pp-below-chat-action"><summary>Add note or evidence</summary><p>Merchant-entered context is stored with this case and labeled as unverified. Do not add full payment card details, security codes, passwords, or API keys.</p><form onSubmit={addNote}><label className="sr-only" htmlFor="merchant-case-note">Merchant note or evidence context</label><textarea id="merchant-case-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={4000} placeholder="Add what you checked, a store observation, or context the records do not contain…"/><button type="submit" disabled={noteBusy || !note.trim()}>{noteBusy ? "Saving note…" : "Save merchant note"}</button></form></details>

      <details className="pp-case-response"><summary>Prepare response for merchant review</summary><div className="pp-case-response-inner"><p>This draft is yours to review and edit. It is not a PayPal finding or decision, and nothing is submitted automatically. PayPal is the final decision-maker.</p><button type="button" className="pp-case-primary-button" onClick={() => void prepareResponse()} disabled={busy}>{busy ? "Preparing…" : "Prepare merchant response"}</button>{reportPrepared && <><label className="sr-only" htmlFor="merchant-response-draft">Edit merchant response</label><textarea id="merchant-response-draft" value={responseReport} onChange={(event) => setResponseReport(event.target.value)} maxLength={12000}/>{customerDraftSources.length > 0 && <details><summary>Show response source records</summary><div>{customerDraftSources.map((id) => { const source = sources.find((item) => item.id === id); return source ? <button key={id} type="button" onClick={() => revealSource(id)}>{source.label} ↗</button> : null; })}</div></details>}<div className="pp-case-response-actions"><button type="button" onClick={() => void saveResponse()} disabled={saving || !responseReport.trim()}>{saving ? "Saving…" : "Save draft"}</button><button type="button" onClick={() => navigator.clipboard.writeText(responseReport).then(() => setNotice("Merchant response copied for your review."), () => setError("Clipboard access is unavailable."))}>Copy draft</button><button type="button" onClick={() => { const url = URL.createObjectURL(new Blob([responseReport], { type: "text/plain;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "payproof-merchant-response-" + caseId + ".txt"; anchor.click(); URL.revokeObjectURL(url); }}>Download</button></div></>}</div></details>

      {error && <p className="pp-case-inline-error" role="alert">{error}</p>}{notice && <p className="pp-case-inline-notice" role="status">{notice}</p>}
      <footer className="pp-owner-foot"><span>Private owner workspace · {record.simulated ? "Fictional demo data" : "Store records"}</span><Link href="/owner/cases">← Back to case queue</Link></footer>
    </div>
  </main>;
}
