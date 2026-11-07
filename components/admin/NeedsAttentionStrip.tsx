"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

type Incident = { id: string };
type LatestDiagnosis = { patternDetected: string; createdAt: string } | null;
type AgentAction = { createdAt: string };

const DISMISS_KEY = "payproof-admin-attention-dismissed";

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function NeedsAttentionStrip() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [diagnosis, setDiagnosis] = useState<LatestDiagnosis>(null);
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [incRes, diagRes, actRes] = await Promise.all([
        fetch("/api/admin/incidents", { cache: "no-store" }),
        fetch("/api/admin/simulate/latest-diagnosis", { cache: "no-store" }),
        fetch("/api/admin/agent-actions", { cache: "no-store" }),
      ]);
      if (incRes.ok) {
        const body = await incRes.json();
        setIncidents(Array.isArray(body) ? body : []);
      }
      if (diagRes.ok) {
        const body = (await diagRes.json()) as { diagnosis?: { patternDetected?: string; createdAt?: string } | null };
        setDiagnosis(body.diagnosis?.patternDetected ? { patternDetected: body.diagnosis.patternDetected, createdAt: body.diagnosis.createdAt || "" } : null);
      }
      if (actRes.ok) {
        const body = (await actRes.json()) as { actions?: AgentAction[] };
        setActions(Array.isArray(body.actions) ? body.actions : []);
      }
    } catch {
      // Keep previous values; strip is informational.
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const actionsToday = useMemo(() => {
    const start = startOfToday();
    return actions.filter((a) => new Date(a.createdAt).getTime() >= start).length;
  }, [actions]);

  const hasAttention = incidents.length > 0 || Boolean(diagnosis) || actionsToday > 0;
  if (dismissed || !hasAttention) return null;

  const dismiss = () => {
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {}
    setDismissed(true);
  };

  return (
    <section className="pp-attention-strip" aria-label="Payment network status" aria-live="polite">
      <Link href="/admin/network" className={`pp-attention-item pp-attention-incidents ${incidents.length > 0 ? "is-alert" : "is-clear"}`}>
        <span className="pp-attention-badge">{incidents.length > 0 ? `${incidents.length} active incident${incidents.length === 1 ? "" : "s"}` : "No active incidents"}</span>
      </Link>
      {diagnosis && (
        <Link href="/admin/network" className="pp-attention-item">
          <span className="pp-attention-label">Latest insight:</span>
          <span className="pp-attention-text">{diagnosis.patternDetected}</span>
          {diagnosis.createdAt && <time dateTime={diagnosis.createdAt}>{new Date(diagnosis.createdAt).toLocaleString()}</time>}
        </Link>
      )}
      <Link href="/admin/network" className="pp-attention-item">
        <span className="pp-attention-label">{actionsToday} agent action{actionsToday === 1 ? "" : "s"} recorded today</span>
      </Link>
      <Link href="/admin/network" className="pp-attention-cta">Review network health</Link>
      <button type="button" className="pp-attention-dismiss" onClick={dismiss} aria-label="Dismiss for this session">×</button>
    </section>
  );
}
