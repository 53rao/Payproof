"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SectionRail } from "@/components/admin/SectionRail";
import { DashboardHeader } from "@/components/admin/DashboardHeader";
import { Icon } from "@/components/admin/Icon";
import "../admin.css";
import "./live-transaction.css";

type TraceLine = { level: "INFO" | "WARN" | "SUCCESS" | "ALERT" | "ACTION"; message: string; reference: string };
type LiveTransaction = {
  eventId: string;
  createdAt: string;
  orderId: string;
  amount: number;
  status: string;
  issue: string | null;
  debugId: string | null;
  transactionId: string | null;
  simulated: boolean;
  origin: string;
  merchants: { id: string; name: string }[] | string[];
  items: { id: string; name?: string; quantity: number }[];
  caseId: string | null;
  likelyCause: string;
  confidence: string;
  evidence: {
    processorCode: string | null;
    processorText: string | null;
    issue: string | null;
    avs: string | null;
    cvv: string | null;
    recentAttempts: number;
    recentFailures: number;
    failureRate: number;
    metadataGaps: string[];
  };
  trace: TraceLine[];
};
type PipelineStep = { title: string; detail: string; reference: string };
type AgentAction = {
  id: string;
  type: "CASE_ESCALATED" | "MERCHANT_NOTIFICATION_EMAIL_SENT" | string;
  merchantId: string;
  merchantName: string;
  detail: string;
  createdAt: string;
};

const agentActionTones: Record<string, string> = {
  CASE_ESCALATED: "tag-amber",
  MERCHANT_NOTIFICATION_EMAIL_SENT: "tag-cyan",
};

const AGENT_ACTION_WINDOW_MS = 30 * 60_000;

const agentActionTone = (type: string) => agentActionTones[type] ?? "tag-gray";

function relativeTime(value: string, now: number) {
  const seconds = Math.max(0, Math.floor((now - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1 day ago" : `${days} days ago`;
}

function agentActionDescription(action: AgentAction) {
  if (action.type === "CASE_ESCALATED") {
    const caseId = action.detail.match(/Case ([A-Z0-9-]+)/)?.[1];
    return caseId ? `Case ${caseId} · routed for review` : "Case routed for review";
  }
  if (action.type === "MERCHANT_NOTIFICATION_EMAIL_SENT") {
    const incidentType = action.detail.match(/\(([A-Z0-9_]+)\)/)?.[1];
    return incidentType ? `Auto-notified · ${incidentType}` : "Auto-notified";
  }
  return action.detail;
}

const stepsFor = (transaction: LiveTransaction): PipelineStep[] => [
  { title: "Payment event", detail: `${transaction.status} result found in the payment ledger.`, reference: "CAPTURE_RESULT" },
  { title: "Order context", detail: `${transaction.origin} checkout · ${merchantNames(transaction).join(", ") || "merchant unavailable"}.`, reference: transaction.orderId },
  { title: "Processor response", detail: transaction.evidence.processorCode || transaction.issue || transaction.evidence.processorText || "No processor response code stored.", reference: transaction.transactionId || transaction.debugId || "response fields" },
  { title: "Merchant activity", detail: `${transaction.evidence.recentFailures} failures among ${transaction.evidence.recentAttempts} recent capture events.`, reference: "last 15 minutes" },
  { title: "Case context", detail: transaction.caseId ? `Linked case ${transaction.caseId}.` : "No case is linked to this transaction.", reference: transaction.caseId || "case lookup" },
  { title: "Evidence summary", detail: transaction.likelyCause, reference: `${transaction.confidence} confidence` },
];

function merchantNames(transaction: LiveTransaction) {
  return transaction.merchants.map((merchant) => typeof merchant === "string" ? merchant : merchant.name);
}

function clockTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function money(value: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
}

export default function LiveTransactionPage() {
  const [transaction, setTransaction] = useState<LiveTransaction | null>(null);
  const [activeStep, setActiveStep] = useState(-1);
  const [completedSteps, setCompletedSteps] = useState(0);
  const [trace, setTrace] = useState<(TraceLine & { time: string })[]>([]);
  const [connection, setConnection] = useState<"connecting" | "watching" | "error">("connecting");
  const [error, setError] = useState("");
  const [lastCheckedAt, setLastCheckedAt] = useState("");
  const cursorRef = useRef<{ time: string; id: string } | null>(null);
  const seenRef = useRef(new Set<string>());
  const queueRef = useRef<LiveTransaction[]>([]);
  const scanningRef = useRef(false);
  const streamBodyRef = useRef<HTMLDivElement>(null);
  const injectedIncidentIdsRef = useRef<Set<string>>(new Set());
  const [agentActions, setAgentActions] = useState<AgentAction[]>([]);
  const [agentActionsError, setAgentActionsError] = useState("");
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    if (streamBodyRef.current) {
      streamBodyRef.current.scrollTop = streamBodyRef.current.scrollHeight;
    }
  }, [trace]);

  useEffect(() => {
    let active = true;
    let loading = false;
    const load = async () => {
      if (!active) return;
      setNowTick(Date.now());
      if (loading) return;
      loading = true;
      try {
        const response = await fetch("/api/admin/agent-actions", { cache: "no-store" });
        const body = await response.json() as { actions?: AgentAction[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Agent actions could not be loaded.");
        const incoming = Array.isArray(body.actions) ? body.actions : [];
        if (!active) return;
        setAgentActions((previous) => {
          const existingIds = new Set(previous.map((action) => action.id));
          const fresh = incoming.filter((action) => !existingIds.has(action.id));
          return fresh.length ? [...fresh, ...previous].slice(0, 100) : previous;
        });
        setNowTick(Date.now());
        setAgentActionsError("");
      } catch (cause) {
        if (active) setAgentActionsError(cause instanceof Error ? cause.message : "Agent actions could not be loaded.");
      } finally {
        loading = false;
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 8_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const scanTransaction = useCallback(async (next: LiveTransaction) => {
    scanningRef.current = true;
    setTransaction(next);
    setCompletedSteps(0);
    setActiveStep(0);
    const currentTrace = next.trace.map((line) => ({ ...line, time: next.createdAt }));
    for (let index = 0; index < currentTrace.length; index++) {
      setActiveStep(Math.min(index, 5));
      await new Promise((resolve) => window.setTimeout(resolve, 420));
      setTrace((lines) => [...lines.slice(-200), currentTrace[index]]);
      setCompletedSteps(index + 1);
    }
    setActiveStep(-1);

    const producedAlert = currentTrace.some((line) => line.level === "ALERT" && line.reference === "SCAN SUMMARY");
    if (producedAlert && next.status === "FAILED") {
      const merchantName = merchantNames(next)[0] ?? "Merchant";
      const actionRows: (TraceLine & { time: string })[] = [];

      if (next.origin === "AGENT") {
        actionRows.push({
          level: "ACTION",
          message: `Case escalated for human review · ${next.caseId ?? "No linked case"}`,
          reference: "Requires merchant action",
          time: new Date().toISOString(),
        });
      }

      try {
        const response = await fetch("/api/admin/incidents", { cache: "no-store" });
        if (response.ok) {
          const incidents = await response.json() as Array<{ id: string; merchantId: string; merchantName?: string; type: string; autoNotified?: boolean }>;
          const merchantIds = next.merchants
            .map((merchant) => typeof merchant === "string" ? merchant : merchant.id)
            .filter(Boolean);
          for (const merchantId of merchantIds) {
            const incident = incidents.find((item) => item.merchantId === merchantId && item.autoNotified === true);
            if (!incident || injectedIncidentIdsRef.current.has(incident.id)) continue;
            injectedIncidentIdsRef.current.add(incident.id);
            actionRows.push({
              level: "ACTION",
              message: `Merchant notified automatically · ${incident.merchantName ?? merchantName}`,
              reference: `✉ Sent to raox58@gmail.com · ${incident.type}`,
              time: new Date().toISOString(),
            });
          }
        }
      } catch {
        // Auto-notification lookup is advisory; keep the scan stream moving.
      }

      if (actionRows.length) setTrace((lines) => [...lines.slice(-200), ...actionRows]);
    }

    scanningRef.current = false;
  }, []);

  useEffect(() => {
    let active = true;
    let polling = false;
    const poll = async () => {
      if (!active || polling) return;
      polling = true;
      try {
        const cursor = cursorRef.current;
        const query = cursor ? `?afterTime=${encodeURIComponent(cursor.time)}&afterId=${encodeURIComponent(cursor.id)}` : "";
        const response = await fetch(`/api/admin/live-transactions${query}`, { cache: "no-store" });
        const body = await response.json() as { events?: LiveTransaction[]; error?: string };
        if (!response.ok) throw new Error(body.error ?? "Live transaction feed could not be loaded.");
        const events = Array.isArray(body.events) ? body.events : [];
        for (const event of events) {
          cursorRef.current = { time: event.createdAt, id: event.eventId };
          if (seenRef.current.has(event.eventId)) continue;
          seenRef.current.add(event.eventId);
          queueRef.current.push(event);
        }
        if (active) {
          setConnection("watching");
          setError("");
          setLastCheckedAt(new Date().toISOString());
        }
        if (!scanningRef.current && queueRef.current.length) {
          void scanTransaction(queueRef.current.shift()!);
        }
      } catch (cause) {
        if (active) {
          setConnection("error");
          setError(cause instanceof Error ? cause.message : "Live transaction feed could not be loaded.");
        }
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, 4_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [scanTransaction]);

  useEffect(() => {
    if (scanningRef.current || !queueRef.current.length) return;
    void scanTransaction(queueRef.current.shift()!);
  }, [activeStep, completedSteps, scanTransaction]);

  const signOut = useCallback(async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) { setError("Could not sign out. Refresh the desk and try again."); return; }
    window.location.replace("/login");
  }, []);

  const steps = transaction ? stepsFor(transaction) : [];
  const isFailed = transaction?.status === "FAILED";
  const visibleAgentActions = agentActions.filter((action) => action.type !== "RECOVERY_SUPPRESSED" && nowTick - new Date(action.createdAt).getTime() <= AGENT_ACTION_WINDOW_MS);

  return <main className="pp-shell pp-live-transaction-shell">
    <SectionRail/>
    <div className="pp-app">
      <DashboardHeader onSignOut={signOut}/>
      <div className="pp-workspace pp-live-workspace">
        <div className="pp-content">
          <section className="pp-screen pp-live-screen" aria-labelledby="pp-live-title">
            <div className="pp-live-heading-row">
              <div><h1 id="pp-live-title">Live Payment Monitor</h1><p>Payment captures are scanned automatically as they are recorded. Agent actions and incident triggers appear in real time.</p></div>
            </div>

            {error && <div className="pp-live-error" role="alert"><Icon name="alert"/><span>{error}</span></div>}

            <div className="pp-live-grid">
              <section className="pp-live-panel pp-live-pipeline" aria-labelledby="pp-live-pipeline-title">
                <div className="pp-live-panel-heading"><div><h2 id="pp-live-pipeline-title">Transaction scan</h2><p>{transaction ? `Order ${transaction.orderId}` : "Waiting for a recorded payment capture"}</p></div>{transaction && <span className={`pp-live-outcome ${isFailed ? "failed" : "success"}`}>{transaction.status}</span>}</div>
                {transaction ? <ol className="pp-live-steps">{steps.map((step, index) => {
                  const done = index < completedSteps;
                  const running = index === activeStep;
                  return <li key={step.title} className={`${done ? "done" : ""} ${running ? "running" : ""}`}>
                    <span className="pp-live-step-marker" aria-hidden="true">{done ? <CheckIcon/> : running ? <i/> : <span/>}</span>
                    <div className="pp-live-step-copy"><div><b>{step.title}</b><span>{done ? "Checked" : running ? "Reviewing" : "Queued"}</span></div><p>{step.detail}</p><small>{step.reference}</small></div>
                  </li>;
                })}</ol> : <div className="pp-live-empty"><span className="pp-live-empty-mark"><PulseIcon/></span><b>No captured transactions yet</b><p>This page will start a scan when a new payment result is recorded.</p></div>}
                <div className="pp-live-watch-note"><i/><span>Watching payment records</span><small>{lastCheckedAt ? `Checked ${clockTime(lastCheckedAt)}` : "Checking every 4 seconds"}</small></div>
              </section>

              <div className="pp-live-right-column">
                <section className="pp-live-stream" aria-labelledby="pp-live-stream-title" aria-live="polite">
                  <header><div><TerminalIcon/><h2 id="pp-live-stream-title">Live scan stream</h2></div><span className={connection}><i/>{connection === "watching" ? "Watching" : connection === "error" ? "Reconnecting" : "Connecting"}</span></header>
                  <div className="pp-live-stream-body" ref={streamBodyRef}>
                    {trace.length ? trace.map((line, index) => <p className={`pp-live-log ${line.level.toLowerCase()}`} key={`${line.time}-${line.reference}-${index}`}><time>{clockTime(line.time)}</time><b>[{line.level}]</b><span>{line.message}</span><small>{line.reference}</small></p>) : <div className="pp-live-stream-empty"><span>Listening for a new CAPTURE_RESULT event…</span><i/></div>}
                  </div>
                </section>

                {transaction ? <section className="pp-live-decision" aria-labelledby="pp-live-decision-title">
                  <header><div><SparkIcon/><h2 id="pp-live-decision-title">Recorded transaction summary</h2></div><span>{transaction.simulated ? "SIMULATED" : "BRAINTREE SANDBOX"}</span></header>
                  <div className="pp-live-transaction-facts">
                    <div className="pp-live-risk"><span>CONFIDENCE</span><b>{transaction.confidence}</b><small>Based on stored fields</small></div>
                    <div className="pp-live-order-fact"><span className={`pp-live-outcome ${isFailed ? "failed" : "success"}`}>{isFailed ? "FAILED" : "COMPLETED"}</span><b>{money(transaction.amount)}</b><small>{clockTime(transaction.createdAt)}</small></div>
                    <div className="pp-live-order-meta"><b>{transaction.orderId}</b><span>{merchantNames(transaction).join(" · ") || "Merchant unavailable"}</span><small>{transaction.origin} checkout{transaction.transactionId ? ` · Transaction ${transaction.transactionId}` : ""}</small></div>
                  </div>
                  <div className={`pp-live-cause ${isFailed ? "failed" : "success"}`}><b>{isFailed ? "Payment needs review" : "Payment completed"}</b><p>{transaction.likelyCause}</p>{transaction.caseId && <Link href={`/admin/cases?caseId=${encodeURIComponent(transaction.caseId)}`}>Open case {transaction.caseId} →</Link>}</div>
                  <details className="pp-live-evidence"><summary>View transaction evidence <span>{transaction.evidence.metadataGaps.length ? `${transaction.evidence.metadataGaps.length} fields unavailable` : "Processor and activity signals"}</span></summary><dl>
                    <div><dt>Processor code</dt><dd>{transaction.evidence.processorCode ?? "Not recorded"}</dd></div>
                    <div><dt>Processor response</dt><dd>{transaction.evidence.processorText ?? "Not recorded"}</dd></div>
                    <div><dt>AVS / CVV</dt><dd>{transaction.evidence.avs ?? "AVS unavailable"} / {transaction.evidence.cvv ?? "CVV unavailable"}</dd></div>
                    <div><dt>Recent merchant failures</dt><dd>{transaction.evidence.recentFailures} of {transaction.evidence.recentAttempts} ({transaction.evidence.failureRate}%)</dd></div>
                    {transaction.debugId && <div><dt>Debug ID</dt><dd>{transaction.debugId}</dd></div>}
                  </dl></details>
                </section> : <section className="pp-live-decision pp-live-decision-empty"><SparkIcon/><p>When a payment capture is recorded, its outcome, evidence gaps, and linked case will appear here.</p></section>}
              </div>
            </div>
            <section className="pp-live-agent-actions" aria-labelledby="pp-live-agent-actions-title">
              <header>
                <div>
                  <AgentIcon/>
                  <div>
                    <h2 id="pp-live-agent-actions-title">Recent agent actions</h2>
                    <p>Actions recorded in the last 30 minutes · auto-refreshes</p>
                  </div>
                </div>
                {agentActionsError && <span className="pp-live-agent-actions-status">{agentActionsError}</span>}
              </header>
              <div className="pp-live-agent-actions-body">
                {visibleAgentActions.length ? visibleAgentActions.map((action) => {
                  const age = nowTick - new Date(action.createdAt).getTime();
                  const ageClass = age < 60_000 ? "age-now" : age < 5 * 60_000 ? "age-new" : "age-old";
                  return <article key={action.id} className={`pp-live-agent-action ${ageClass}`}>
                    <div className="pp-live-agent-action-top">
                      <span className={`pp-live-agent-tag ${agentActionTone(action.type)}`}>{action.type.replaceAll("_", " ")}</span>
                      <b>{action.merchantName}</b>
                      <time dateTime={action.createdAt}>{relativeTime(action.createdAt, nowTick)}</time>
                    </div>
                    <p>{agentActionDescription(action)}</p>
                  </article>;
                }) : <p className="pp-live-agent-actions-empty" style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center", margin: 0, padding: 0, textAlign: "center", color: "#7e8992" }}>○&nbsp;&nbsp;No actions recorded in the last 30 minutes</p>}
              </div>
            </section>
            <p className="pp-live-footnote">The scan summarizes stored payment records. Missing processor fields stay marked unavailable; this is advisory and does not change or retry a payment.</p>
          </section>
          <footer className="pp-footer"><span>PAYMENT RECORDS · AUTO-REFRESH</span><span>PAYPROOF NETWORK ADMIN</span><span>DIAGNOSTIC SUMMARY · NO PAYMENT ACTIONS</span></footer>
        </div>
      </div>
    </div>
  </main>;
}

function CheckIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 10 4 4 8-8"/></svg>; }
function PulseIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h4l3-7 5 14 3-7h5"/></svg>; }
function TerminalIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m3 5 5 5-5 5M10 15h7"/></svg>; }
function AgentIcon() { return <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5 16 5v4.5c0 3.6-2.4 6.3-6 8-3.6-1.7-6-4.4-6-8V5l6-2.5Z"/><path d="m7.5 10 1.7 1.7 3.3-3.4"/></svg>; }
function SparkIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.8 7.2L21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8L12 2Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></svg>; }
