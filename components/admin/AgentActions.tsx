"use client";
import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type AgentAction = {
  id: string;
  type: "RESERVATION_RELEASED" | "CASE_ESCALATED" | "RECOVERY_SUPPRESSED";
  merchantId: string;
  merchantName: string;
  detail: string;
  createdAt: string;
};

const labels: Record<AgentAction["type"], string> = {
  RESERVATION_RELEASED: "Reservation released",
  CASE_ESCALATED: "Case escalated",
  RECOVERY_SUPPRESSED: "Recovery suppressed",
};
const actionIcons: Record<AgentAction["type"], "box" | "alert" | "minus"> = {
  RESERVATION_RELEASED: "box",
  CASE_ESCALATED: "alert",
  RECOVERY_SUPPRESSED: "minus",
};

export function AgentActions({ variant = "panel" }: { variant?: "panel" | "rail" }) {
  const [actions, setActions] = useState<AgentAction[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch("/api/admin/agent-actions", { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "Agent actions could not be loaded.");
        if (active) { setActions(body.actions ?? []); setError(""); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Agent actions could not be loaded.");
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  const isRail = variant === "rail";
  return <aside className={isRail ? "pp-feed pp-agent-actions-feed" : "pp-agent-actions"} aria-labelledby="pp-agent-actions-title" aria-live="polite">
    <header className={isRail ? "pp-agent-actions-rail-heading" : undefined}><div><h2 id="pp-agent-actions-title">Agent Actions</h2><p>Automatic responses taken by PayProof</p></div></header>
    {error ? <p className="pp-agent-actions-error" role="alert">{error}</p> : actions.length ? <ol className={`pp-agent-actions-list${isRail ? " pp-feed-list" : ""}`}>
      {actions.map((action) => <li key={action.id} className={`pp-agent-action ${action.type.toLowerCase().replaceAll("_", "-")}${isRail ? " pp-feed-event" : ""}`}>
        {isRail ? <>
          <span className={`pp-feed-marker pp-agent-action-marker ${action.type.toLowerCase().replaceAll("_", "-")}`}><Icon name={actionIcons[action.type]}/></span>
          <div className="pp-feed-copy"><div><b>{labels[action.type]}</b></div><p>{action.detail}</p><time dateTime={action.createdAt}>{new Date(action.createdAt).toLocaleString()}</time></div>
        </> : <><div><b>{labels[action.type]}</b><time dateTime={action.createdAt}>{new Date(action.createdAt).toLocaleString()}</time></div><p>{action.detail}</p></>}
      </li>)}
    </ol> : <p className="pp-agent-actions-empty">No automatic actions recorded yet.</p>}
  </aside>;
}
