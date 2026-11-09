"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { SectionRail } from "@/components/admin/SectionRail";
import { DashboardHeader } from "@/components/admin/DashboardHeader";
import { Icon } from "@/components/admin/Icon";
import "../admin.css";
import "./live-transaction.css";

type TraceLine = { level: "INFO" | "WARN" | "SUCCESS" | "ALERT"; message: string; reference: string };
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

  useEffect(() => {
    if (streamBodyRef.current) {
      streamBodyRef.current.scrollTop = streamBodyRef.current.scrollHeight;
    }
  }, [trace]);

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

  return <main className="pp-shell pp-live-transaction-shell">
    <SectionRail data={null}/>
    <div className="pp-app">
      <DashboardHeader data={null} onSignOut={signOut}/>
      <div className="pp-workspace pp-live-workspace">
        <div className="pp-content">
          <section className="pp-screen pp-live-screen" aria-labelledby="pp-live-title">
            <div className="pp-live-back"><Link href="/admin/network" className="pp-back-link">← Network Health</Link></div>
            <div className="pp-live-heading-row">
              <div><h1 id="pp-live-title">Live Transaction</h1><p>New payment captures are checked automatically against their recorded order and processor signals.</p></div>
              <span className={`pp-live-connection ${connection}`}><i/>{connection === "connecting" ? "Connecting" : connection === "error" ? "Feed paused" : "Watching"}</span>
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
                  <div className={`pp-live-cause ${isFailed ? "failed" : "success"}`}><b>{isFailed ? "Payment needs review" : "Payment completed"}</b><p>{transaction.likelyCause}</p>{transaction.caseId && <Link href={`/owner/cases?caseId=${encodeURIComponent(transaction.caseId)}`}>Open case {transaction.caseId} →</Link>}</div>
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
function SparkIcon() { return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 2 1.8 7.2L21 11l-7.2 1.8L12 20l-1.8-7.2L3 11l7.2-1.8L12 2Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></svg>; }
