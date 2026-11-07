"use client";
import { useCallback, useEffect, useMemo, useState } from "react";

type Incident = {
  id: string;
  type: "FAILURE_SPIKE" | "CARDING_PATTERN" | "AGENT_REVIEW_REQUIRED" | "CASE_THRESHOLD_EXCEEDED";
  merchantName: string;
  merchantId: string;
  summary: string;
  detail: string;
  confidence: string;
  detectedAt: string;
  actions: ("NOTIFY_MERCHANT" | "FLAG_FOR_MONITORING" | "DISMISS")[];
  caseCount?: number;
  oldestCaseAgeHours?: number;
};
type NotificationDraft = { subject: string; body: string };
type DeliveryChannel = "EMAIL" | "CHATBOX";
const defaultDemoRecipient = "raox58@gmail.com";
const labels: Record<Incident["type"], string> = {
  FAILURE_SPIKE: "Failure spike",
  CARDING_PATTERN: "Possible carding pattern",
  AGENT_REVIEW_REQUIRED: "Agent review required",
  CASE_THRESHOLD_EXCEEDED: "Open case threshold exceeded",
};

export function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [dismissing, setDismissing] = useState<Set<string>>(() => new Set());
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, NotificationDraft>>({});
  const [expandedDrafts, setExpandedDrafts] = useState<Set<string>>(() => new Set());
  const [recipients, setRecipients] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<Record<string, DeliveryChannel>>({});
  const [loadingAction, setLoadingAction] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/incidents", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Incidents could not be loaded.");
      const next = Array.isArray(body) ? body as Incident[] : [];
      const ids = new Set(next.map((incident) => incident.id));
      setIncidents(next);
      setDismissed((current) => new Set([...current].filter((id) => ids.has(id))));
      setFlagged((current) => new Set([...current].filter((id) => ids.has(id))));
      setDrafts((current) => Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))));
      setRecipients((current) => Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))));
      setChannels((current) => Object.fromEntries(Object.entries(current).filter(([id]) => ids.has(id))));
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Incidents could not be loaded.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const visibleIncidents = useMemo(() => incidents.filter((incident) => !dismissed.has(incident.id)), [incidents, dismissed]);

  const performAction = async (incident: Incident, action: "NOTIFY_MERCHANT" | "FLAG_FOR_MONITORING" | "DISMISS") => {
    setLoadingAction((current) => ({ ...current, [incident.id]: true }));
    setError("");
    try {
      const response = await fetch("/api/admin/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ incidentId: incident.id, action, merchantId: incident.merchantId }),
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The incident action could not be completed.");
      if (action === "NOTIFY_MERCHANT") {
        setDrafts((current) => ({ ...current, [incident.id]: body as NotificationDraft }));
      } else if (action === "FLAG_FOR_MONITORING") {
        setFlagged((current) => new Set(current).add(incident.id));
      } else {
        setDismissing((current) => new Set(current).add(incident.id));
        window.setTimeout(() => {
          setDismissed((current) => new Set(current).add(incident.id));
          setDismissing((current) => { const next = new Set(current); next.delete(incident.id); return next; });
        }, 220);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The incident action could not be completed.");
    } finally {
      setLoadingAction((current) => ({ ...current, [incident.id]: false }));
    }
  };

  const copyDraft = async (incidentId: string, subject: string, body: string) => {
    try {
      await navigator.clipboard.writeText(`${subject}\n\n${body}`);
      setCopied((current) => new Set(current).add(incidentId));
      window.setTimeout(() => setCopied((current) => { const next = new Set(current); next.delete(incidentId); return next; }), 1800);
    } catch {
      setError("Could not copy the draft. Check clipboard access and try again.");
    }
  };

  if (!visibleIncidents.length) return null;
  return <section className="pp-incidents" aria-labelledby="pp-incidents-title" aria-live="polite">
    <header className="pp-incidents-header"><h2 id="pp-incidents-title">Active Incidents</h2><span className="pp-incidents-count">{visibleIncidents.length}</span></header>
    {error && <p className="pp-incidents-error" role="alert">{error}</p>}
    <div className="pp-incidents-list">{visibleIncidents.map((incident) => {
      const draft = drafts[incident.id];
      const busy = Boolean(loadingAction[incident.id]);
      const recipient = recipients[incident.id] ?? defaultDemoRecipient;
      const channel = channels[incident.id] ?? "EMAIL";
      const validRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());
      const demoSubject = draft ? `[PayProof Demo] ${draft.subject}` : "";
      const demoBody = draft ? `PayProof demo notification for judges. This is a demonstration draft, not a live merchant alert.\n\n${draft.body}` : "";
      const mailto = draft && validRecipient ? `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(demoSubject)}&body=${encodeURIComponent(demoBody)}` : undefined;
      return <article key={incident.id} className={`pp-incident-card ${incident.type.toLowerCase().replaceAll("_", "-")}${dismissing.has(incident.id) ? " is-dismissing" : ""}`}>
        <div className="pp-incident-topline"><span className="pp-incident-type">{labels[incident.type]}</span><time dateTime={incident.detectedAt}>Detected {new Date(incident.detectedAt).toLocaleString()}</time></div>
        <h3>{incident.merchantName}</h3>
        <p className="pp-incident-summary">{incident.summary}</p>
        <p className="pp-incident-detail">{incident.detail}</p>
        <p className="pp-incident-confidence">Confidence: {incident.confidence}</p>
        <div className="pp-incident-actions">
          {incident.actions.includes("NOTIFY_MERCHANT") && <button type="button" onClick={() => void performAction(incident, "NOTIFY_MERCHANT")} disabled={busy}>{busy ? "Working…" : "Notify Merchant"}</button>}
          {incident.actions.includes("FLAG_FOR_MONITORING") && <button type="button" onClick={() => void performAction(incident, "FLAG_FOR_MONITORING")} disabled={busy || flagged.has(incident.id)}>{flagged.has(incident.id) ? "Flagged" : "Flag for Monitoring"}</button>}
          {incident.actions.includes("DISMISS") && <button type="button" className="pp-incident-dismiss" onClick={() => void performAction(incident, "DISMISS")} disabled={busy}>Dismiss</button>}
        </div>
        {draft && <div className="pp-incident-draft">
          <button type="button" className="pp-incident-draft-toggle" aria-expanded={expandedDrafts.has(incident.id)} onClick={() => setExpandedDrafts((current) => { const next = new Set(current); if (next.has(incident.id)) next.delete(incident.id); else next.add(incident.id); return next; })}>Draft ready — {demoSubject}<span>{expandedDrafts.has(incident.id) ? "Collapse draft" : "Expand draft"}</span></button>
          {expandedDrafts.has(incident.id) && <>
          <div className="pp-incident-demo-label">DEMO FOR JUDGES · NOTHING IS SENT AUTOMATICALLY</div>
          <div><span>Subject</span><b>{demoSubject}</b></div>
          <div><span>Message draft</span><p>{demoBody}</p></div>
          <div className="pp-incident-delivery-controls">
            <label>Delivery option<select aria-label="Notification delivery option" value={channel} onChange={(event) => setChannels((current) => ({ ...current, [incident.id]: event.target.value as DeliveryChannel }))}><option value="EMAIL">Email draft</option><option value="CHATBOX">Chatbox copy</option></select></label>
            {channel === "EMAIL" ? <label>Demo merchant email<input type="email" value={recipient} onChange={(event) => setRecipients((current) => ({ ...current, [incident.id]: event.target.value }))} placeholder="merchant@example.com"/></label> : <p className="pp-incident-chat-handoff">Copy the draft and paste it into your demo chatbox. No chat service is connected.</p>}
          </div>
          <div className="pp-incident-draft-actions">
            {channel === "EMAIL" && (mailto ? <a href={mailto}>Open email draft</a> : <span className="pp-incident-invalid-email">Enter a valid email address to open the draft.</span>)}
            <button type="button" onClick={() => void copyDraft(incident.id, demoSubject, demoBody)}>{copied.has(incident.id) ? "Copied" : channel === "EMAIL" ? "Copy email draft" : "Copy for chatbox"}</button>
            <small>Demo only · PayProof has not contacted this merchant.</small>
          </div>
          </>}
        </div>}
      </article>;
    })}</div>
  </section>;
}
