"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type AgentAction = {
  id: string;
  type: "CASE_ESCALATED" | "RECOVERY_SUPPRESSED";
  merchantId: string;
  merchantName: string;
  detail: string;
  createdAt: string;
};

const labels: Record<AgentAction["type"], string> = {
  CASE_ESCALATED: "Case escalated",
  RECOVERY_SUPPRESSED: "Recovery suppressed",
};
const actionIcons: Record<AgentAction["type"], "box" | "alert" | "minus"> = {
  CASE_ESCALATED: "alert",
  RECOVERY_SUPPRESSED: "minus",
};

export function AgentActions({ variant = "panel" }: { variant?: "panel" | "rail" }) {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/admin/agent-actions", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Agent actions could not be loaded.");
        if (active) {
          const supported = Array.isArray(body.actions)
            ? (body.actions as AgentAction[]).filter((action) => Object.hasOwn(labels, action.type))
            : [];
          setActions(variant === "rail" ? supported.slice(0, 5) : supported);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Agent actions could not be loaded.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [variant]);

  const isRail = variant === "rail";
  return <aside className={isRail ? "pp-feed pp-agent-actions-feed" : "pp-agent-actions pp-agent-actions-panel"} aria-labelledby="pp-agent-actions-title" aria-live="polite">
    <header className={isRail ? "pp-agent-actions-rail-heading" : "pp-agent-actions-panel-heading"}><div><h2 id="pp-agent-actions-title">Agent Actions</h2><p>Escalations and recovery safeguards recorded by PayProof.</p></div></header>
    {error ? <p className="pp-agent-actions-error" role="alert">{error}</p> : loading && !actions.length ? <AgentActionsSkeleton variant={isRail ? "rail" : "panel"}/> : actions.length ? <ol className={`pp-agent-actions-list${isRail ? " pp-feed-list" : ""}`}>
      {actions.map((action) => <li key={action.id} className={`pp-agent-action ${action.type.toLowerCase().replaceAll("_", "-")}${isRail ? " pp-feed-event" : ""}`}>
        <span className={`pp-feed-marker pp-agent-action-marker ${action.type.toLowerCase().replaceAll("_", "-")}`}><Icon name={actionIcons[action.type]}/></span>
        <div className={isRail ? "pp-feed-copy" : "pp-agent-action-copy"}>
          <div className="pp-agent-action-heading"><b>{labels[action.type]}</b><time dateTime={action.createdAt}>{new Date(action.createdAt).toLocaleString()}</time></div>
          <span className="pp-agent-action-merchant">{action.merchantName}</span>
          <p>{actionSummary(action)}</p>
        </div>
      </li>)}
    </ol> : <p className="pp-agent-actions-empty">No automatic actions recorded yet.</p>}
  </aside>;
}

function AgentActionsSkeleton({ variant }: { variant: "rail" | "panel" }) {
  return <div className={`pp-agent-actions-loading${variant === "panel" ? " is-panel" : ""}`} role="status" aria-label="Loading agent actions">
    {[0, 1, 2, 3, 4].map((row) => <div className="pp-agent-action-skeleton" key={row}>
      <span className="pp-skeleton pp-skeleton-marker"/>
      <span className="pp-agent-action-copy">
        <span className="pp-skeleton pp-skeleton-line" style={{ width: "62%" }}/>
        <span className="pp-skeleton pp-skeleton-line" style={{ width: "44%" }}/>
        <span className="pp-skeleton pp-skeleton-line" style={{ width: "88%" }}/>
      </span>
    </div>)}
  </div>;
}

function actionSummary(action: AgentAction) {
  if (action.type === "RECOVERY_SUPPRESSED") {
    return "Customer recovery was withheld because the checkout was agent-initiated.";
  }
  const caseId = action.detail.match(/Case ([A-Z0-9-]+) opened/)?.[1];
  return caseId ? `Case ${caseId} was routed for human review.` : "A payment failure was routed for human review.";
}
