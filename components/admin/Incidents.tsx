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
  flagged?: boolean;
  actions: ("NOTIFY_MERCHANT" | "FLAG_FOR_MONITORING" | "DISMISS")[];
  caseCount?: number;
  oldestCaseAgeHours?: number;
  autoNotified?: boolean;
  autoNotifiedAt?: string;
  autoNotifiedChannel?: string;
  autoNotifyError?: string;
  sentSubject?: string;
  sentBody?: string;
  sentRecipient?: string;
};
type NotificationDraft = { subject: string; body: string; recipientEmail?: string };
type SentEmail = { to: string; emailId: string };
type DeliveryChannel = "EMAIL" | "CHATBOX";
const labels: Record<Incident["type"], string> = {
  FAILURE_SPIKE: "Failure spike",
  CARDING_PATTERN: "Possible carding pattern",
  AGENT_REVIEW_REQUIRED: "Agent review required",
  CASE_THRESHOLD_EXCEEDED: "Open case threshold exceeded",
};

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return "just now";
  const past = new Date(dateString).getTime();
  if (Number.isNaN(past)) return "just now";
  const diffSec = Math.max(0, Math.floor((Date.now() - past) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function Incidents() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [dismissing, setDismissing] = useState<Set<string>>(() => new Set());
  const [flagged, setFlagged] = useState<Set<string>>(() => new Set());
  const [drafts, setDrafts] = useState<Record<string, NotificationDraft>>({});
  const [recipients, setRecipients] = useState<Record<string, string>>({});
  const [channels, setChannels] = useState<Record<string, DeliveryChannel>>({});
  const [sentEmails, setSentEmails] = useState<Record<string, SentEmail>>({});
  const [loadingAction, setLoadingAction] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<Set<string>>(() => new Set());
  const [error, setError] = useState("");
  const [activeModalIncidentId, setActiveModalIncidentId] = useState<string | null>(null);
  const [modalViewMode, setModalViewMode] = useState<Record<string, "sent" | "draft">>({});

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

  // Lock body scroll when modal is open and handle Escape key
  useEffect(() => {
    if (!activeModalIncidentId) return;
    document.body.style.overflow = "hidden";
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActiveModalIncidentId(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [activeModalIncidentId]);

  const visibleIncidents = useMemo(() => incidents.filter((incident) => !dismissed.has(incident.id)), [incidents, dismissed]);
  const activeIncident = useMemo(() => visibleIncidents.find((i) => i.id === activeModalIncidentId) ?? null, [visibleIncidents, activeModalIncidentId]);

  const performAction = async (incident: Incident, action: "NOTIFY_MERCHANT" | "SEND_EMAIL" | "FLAG_FOR_MONITORING" | "DISMISS") => {
    setLoadingAction((current) => ({ ...current, [incident.id]: true }));
    setError("");
    try {
      const response = await fetch("/api/admin/incidents", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          incidentId: incident.id,
          action,
          merchantId: incident.merchantId,
          ...(action === "SEND_EMAIL" ? {
            email: {
              to: recipients[incident.id] ?? drafts[incident.id]?.recipientEmail ?? defaultIncidentRecipient(incident.merchantId),
              subject: drafts[incident.id]?.subject,
              text: drafts[incident.id]?.body,
            },
          } : {}),
        }),
        cache: "no-store",
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "The incident action could not be completed.");
      if (action === "NOTIFY_MERCHANT") {
        const draftData = body as NotificationDraft;
        setDrafts((current) => ({ ...current, [incident.id]: draftData }));
        if (draftData.recipientEmail) {
          setRecipients((current) => ({ ...current, [incident.id]: draftData.recipientEmail! }));
        }
      } else if (action === "SEND_EMAIL") {
        setSentEmails((current) => ({ ...current, [incident.id]: { to: recipients[incident.id] ?? drafts[incident.id]?.recipientEmail ?? defaultIncidentRecipient(incident.merchantId), emailId: body.emailId } }));
      } else if (action === "FLAG_FOR_MONITORING") {
        setFlagged((current) => new Set(current).add(incident.id));
      } else {
        setDismissing((current) => new Set(current).add(incident.id));
        if (activeModalIncidentId === incident.id) setActiveModalIncidentId(null);
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

  const openModal = (incident: Incident) => {
    setActiveModalIncidentId(incident.id);
    setError("");
    if (incident.autoNotified) {
      setModalViewMode((curr) => ({ ...curr, [incident.id]: "sent" }));
    } else {
      setModalViewMode((curr) => ({ ...curr, [incident.id]: "draft" }));
      if (!drafts[incident.id]) {
        void performAction(incident, "NOTIFY_MERCHANT");
      }
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

  return (
    <section className="pp-incidents" aria-labelledby="pp-incidents-title" aria-live="polite">
      <header className="pp-incidents-header">
        <h2 id="pp-incidents-title">Active Incidents</h2>
        <span className="pp-incidents-count">{visibleIncidents.length}</span>
      </header>
      {error && !activeIncident && <p className="pp-incidents-error" role="alert">{error}</p>}

      <div className="pp-incidents-list">
        {visibleIncidents.map((incident) => {
          const draft = drafts[incident.id];
          const busy = Boolean(loadingAction[incident.id]);
          return (
            <article
              key={incident.id}
              className={`pp-incident-card ${incident.type.toLowerCase().replaceAll("_", "-")}${dismissing.has(incident.id) ? " is-dismissing" : ""}`}
            >
              <div className="pp-incident-topline">
                <span className="pp-incident-type">{labels[incident.type]}</span>
                <time dateTime={incident.detectedAt}>Detected {new Date(incident.detectedAt).toLocaleString()}</time>
              </div>
              <h3>{incident.merchantName}</h3>
              {incident.autoNotified === true && (
                <div className="pp-incident-auto-notified-badge" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#64748b", margin: "2px 0 6px" }}>
                  <span style={{ color: "#22c55e", fontSize: "10px" }}>●</span>
                  <span>✉ Merchant notified automatically · {formatRelativeTime(incident.autoNotifiedAt)}</span>
                </div>
              )}
              {incident.autoNotified === false && (
                <div className="pp-incident-auto-notify-failed-badge" style={{ display: "flex", alignItems: "center", gap: "5px", fontSize: "11px", color: "#f59e0b", margin: "2px 0 6px" }}>
                  <span>⚠ Auto-notification failed · {(incident.autoNotifyError ?? "Send error").slice(0, 60)}</span>
                </div>
              )}
              <p className="pp-incident-summary">{incident.summary}</p>
              <p className="pp-incident-detail">{incident.detail}</p>
              <p className="pp-incident-confidence">Confidence: {incident.confidence}</p>
              <div className="pp-incident-actions">
                {incident.actions.includes("NOTIFY_MERCHANT") && (
                  <button
                    type="button"
                    onClick={() => openModal(incident)}
                    disabled={busy && activeModalIncidentId !== incident.id}
                  >
                    {incident.autoNotified ? (
                      "Merchant was automatically notified · View sent message"
                    ) : draft ? (
                      <>
                        Review response draft
                        <span className="pp-incident-draft-indicator" title="Draft ready" />
                      </>
                    ) : (
                      "Prepare merchant response"
                    )}
                  </button>
                )}
                {incident.actions.includes("FLAG_FOR_MONITORING") && (
                  <button
                    type="button"
                    onClick={() => void performAction(incident, "FLAG_FOR_MONITORING")}
                    disabled={busy || incident.flagged || flagged.has(incident.id)}
                  >
                    {incident.flagged || flagged.has(incident.id) ? "Flagged" : "Flag for Monitoring"}
                  </button>
                )}
                {incident.actions.includes("DISMISS") && (
                  <button
                    type="button"
                    className="pp-incident-dismiss"
                    onClick={() => void performAction(incident, "DISMISS")}
                    disabled={busy}
                  >
                    Dismiss
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>

      {/* Modern Incident Response Modal */}
      {activeIncident && (
        <div
          className="pp-incident-modal-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) setActiveModalIncidentId(null);
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="pp-modal-title"
        >
          <div className="pp-incident-modal">
            {/* Modal Header */}
            <header className="pp-incident-modal-header">
              <div className="pp-incident-modal-top">
                <div className="pp-incident-modal-badges">
                  <span className="pp-incident-type">{labels[activeIncident.type]}</span>
                  <span style={{ fontSize: "11px", color: "#64748b", fontWeight: 600 }}>
                    {activeIncident.merchantName}
                  </span>
                </div>
                <button
                  type="button"
                  className="pp-incident-modal-close"
                  onClick={() => setActiveModalIncidentId(null)}
                  aria-label="Close modal"
                >
                  ×
                </button>
              </div>
              <h2 id="pp-modal-title" className="pp-incident-modal-title">
                Merchant Incident Response
              </h2>
              <p className="pp-incident-modal-sub">
                Detected {new Date(activeIncident.detectedAt).toLocaleString()} • {activeIncident.summary}
              </p>
            </header>

            {/* Modal Content: Sent Read-Only vs Loading State vs Draft Editor */}
            {activeIncident.autoNotified === true && modalViewMode[activeIncident.id] !== "draft" ? (
              <>
                <div className="pp-incident-modal-body">
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "rgba(34, 197, 94, 0.08)",
                      border: "1px solid rgba(34, 197, 94, 0.25)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      marginBottom: "16px",
                      color: "#15803d",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    <span style={{ color: "#22c55e", fontSize: "14px" }}>●</span>
                    <span>
                      Dispatched automatically via Resend to <b>{activeIncident.sentRecipient ?? "raox58@gmail.com"}</b> at{" "}
                      {activeIncident.autoNotifiedAt
                        ? new Date(activeIncident.autoNotifiedAt).toLocaleString()
                        : new Date(activeIncident.detectedAt).toLocaleString()}
                    </span>
                  </div>

                  <div className="pp-incident-field-group">
                    <label className="pp-incident-field-label">
                      <span>Recipient Address (Read-only)</span>
                    </label>
                    <input
                      type="text"
                      className="pp-incident-modal-input"
                      readOnly
                      value={activeIncident.sentRecipient ?? "raox58@gmail.com"}
                      style={{ background: "#f8fafc", color: "#334155", cursor: "default" }}
                    />
                  </div>

                  <div className="pp-incident-field-group">
                    <label className="pp-incident-field-label">
                      <span>Subject Line (Read-only)</span>
                    </label>
                    <input
                      type="text"
                      className="pp-incident-modal-input"
                      readOnly
                      value={
                        activeIncident.sentSubject ??
                        (activeIncident.type === "CARDING_PATTERN"
                          ? `⚠️ Security alert — possible carding attack detected on ${activeIncident.merchantName}`
                          : `⚠️ Payment alert — elevated failure rate detected on ${activeIncident.merchantName}`)
                      }
                      style={{ background: "#f8fafc", color: "#334155", cursor: "default", fontWeight: 600 }}
                    />
                  </div>

                  <div className="pp-incident-field-group">
                    <div className="pp-incident-field-label">
                      <span>Sent Message Body (Read-only)</span>
                      <button
                        type="button"
                        className="pp-incident-field-label-action"
                        onClick={() =>
                          void copyDraft(
                            activeIncident.id,
                            activeIncident.sentSubject ?? "",
                            activeIncident.sentBody ?? ""
                          )
                        }
                      >
                        {copied.has(activeIncident.id) ? "✓ Copied" : "📋 Copy message"}
                      </button>
                    </div>
                    <textarea
                      className="pp-incident-modal-textarea"
                      readOnly
                      rows={8}
                      value={activeIncident.sentBody ?? ""}
                      style={{ background: "#f8fafc", color: "#334155", cursor: "default" }}
                    />
                  </div>
                </div>

                <footer className="pp-incident-modal-footer">
                  <div className="pp-incident-modal-footer-left">
                    <span style={{ fontSize: "11px", color: "#64748b" }}>
                      Automated dispatch archive
                    </span>
                  </div>
                  <div className="pp-incident-modal-footer-right">
                    <button
                      type="button"
                      className="pp-modal-btn-secondary"
                      onClick={() => setActiveModalIncidentId(null)}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      className="pp-modal-btn-primary"
                      onClick={() => {
                        setModalViewMode((curr) => ({ ...curr, [activeIncident.id]: "draft" }));
                        if (!drafts[activeIncident.id]) {
                          void performAction(activeIncident, "NOTIFY_MERCHANT");
                        }
                      }}
                    >
                      Send follow-up
                    </button>
                  </div>
                </footer>
              </>
            ) : loadingAction[activeIncident.id] || !drafts[activeIncident.id] ? (
              <div className="pp-agent-loading-state">
                <div className="pp-agent-glow-orb" />
                <h3 className="pp-agent-hover-heading">
                  Agent is preparing the draft...
                </h3>
                <p className="pp-agent-shimmer-sub">
                  Synthesizing incident signals, evaluating checkout decline patterns, and drafting tailored merchant guidance.
                </p>
                <div className="pp-agent-steps-pill">
                  <span className="pp-agent-pulse-dot" />
                  <span>Synthesizing incident telemetry &amp; drafting instructions</span>
                </div>
              </div>
            ) : (
              (() => {
                const draft = drafts[activeIncident.id];
                const busy = Boolean(loadingAction[activeIncident.id]);
                const defaultRecipient = defaultIncidentRecipient(activeIncident.merchantId);
                const recipient = recipients[activeIncident.id] ?? draft?.recipientEmail ?? defaultRecipient;
                const channel = channels[activeIncident.id] ?? "EMAIL";
                const validRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim());
                const recipientDomain = recipient.trim().split("@").pop()?.toLowerCase() ?? "";
                const placeholderRecipient =
                  recipientDomain === "example.com" ||
                  recipientDomain.endsWith(".example.com") ||
                  /\.(demo|example|test|invalid|localhost)$/.test(recipientDomain);
                const demoSubject = draft?.subject ?? "";
                const demoBody = draft?.body ?? "";
                const mailto =
                  draft && validRecipient
                    ? `mailto:${encodeURIComponent(recipient.trim())}?subject=${encodeURIComponent(demoSubject)}&body=${encodeURIComponent(demoBody)}`
                    : undefined;

                return (
                  <>
                    <div className="pp-incident-modal-body">
                      {activeIncident.autoNotified === false && (
                        <div
                          style={{
                            background: "rgba(245, 158, 11, 0.12)",
                            border: "1px solid rgba(245, 158, 11, 0.3)",
                            borderRadius: "8px",
                            padding: "10px 14px",
                            marginBottom: "16px",
                            color: "#b45309",
                            fontSize: "12px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                          }}
                        >
                          <span>⚠️</span>
                          <span>Auto-notification failed — draft a manual response below.</span>
                        </div>
                      )}
                      {/* Delivery Channel Selector */}
                      <div className="pp-incident-channel-tabs">
                        <button
                          type="button"
                          className={`pp-incident-channel-tab ${channel === "EMAIL" ? "is-active" : ""}`}
                          onClick={() => setChannels((curr) => ({ ...curr, [activeIncident.id]: "EMAIL" }))}
                        >
                          <span>✉️</span> Email Dispatch (Resend)
                        </button>
                        <button
                          type="button"
                          className={`pp-incident-channel-tab ${channel === "CHATBOX" ? "is-active" : ""}`}
                          onClick={() => setChannels((curr) => ({ ...curr, [activeIncident.id]: "CHATBOX" }))}
                        >
                          <span>💬</span> Chatbox / Direct Copy
                        </button>
                      </div>

                      {/* Email Recipient Input */}
                      {channel === "EMAIL" && (
                        <div className="pp-incident-field-group">
                          <label htmlFor="pp-recipient-input" className="pp-incident-field-label">
                            <span>Merchant Recipient Email</span>
                            {validRecipient && !placeholderRecipient && (
                              <span style={{ color: "#16a34a", fontSize: "10.5px", fontWeight: 700 }}>
                                ✓ Ready to send
                              </span>
                            )}
                          </label>
                          <input
                            id="pp-recipient-input"
                            type="email"
                            className="pp-incident-modal-input"
                            value={recipient}
                            onChange={(e) => setRecipients((curr) => ({ ...curr, [activeIncident.id]: e.target.value }))}
                            placeholder="merchant@domain.com"
                          />
                          {placeholderRecipient && (
                            <div className="pp-incident-modal-note">
                              <span>⚠️</span>
                              <span>
                                In Resend test mode, emails can only be sent to your verified Resend email (e.g. <code>raox58@gmail.com</code>). Replace the demo address before sending.
                              </span>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Subject Line (Editable) */}
                      <div className="pp-incident-field-group">
                        <label htmlFor="pp-subject-input" className="pp-incident-field-label">
                          <span>Subject Line</span>
                        </label>
                        <input
                          id="pp-subject-input"
                          type="text"
                          className="pp-incident-modal-input"
                          value={demoSubject}
                          onChange={(e) =>
                            setDrafts((curr) => ({
                              ...curr,
                              [activeIncident.id]: { ...curr[activeIncident.id], subject: e.target.value },
                            }))
                          }
                          placeholder="Incident notification subject..."
                        />
                      </div>

                      {/* Neatly Designed Text Box Content (Editable Message Draft) */}
                      <div className="pp-incident-field-group">
                        <div className="pp-incident-field-label">
                          <span>Response Content (Editable)</span>
                          <button
                            type="button"
                            className="pp-incident-field-label-action"
                            onClick={() => void copyDraft(activeIncident.id, demoSubject, demoBody)}
                          >
                            {copied.has(activeIncident.id) ? "✓ Copied" : "📋 Copy message"}
                          </button>
                        </div>
                        <textarea
                          className="pp-incident-modal-textarea"
                          value={demoBody}
                          onChange={(e) =>
                            setDrafts((curr) => ({
                              ...curr,
                              [activeIncident.id]: { ...curr[activeIncident.id], body: e.target.value },
                            }))
                          }
                          rows={8}
                          placeholder="Type or edit the incident response message here..."
                        />
                      </div>

                      {/* Sent Success Feedback */}
                      {sentEmails[activeIncident.id] && (
                        <div className="pp-incident-modal-success" role="status">
                          <span>✓</span>
                          <span>
                            Notification email successfully dispatched via Resend to <b>{sentEmails[activeIncident.id].to}</b> (ID: {sentEmails[activeIncident.id].emailId}).
                          </span>
                        </div>
                      )}

                      {/* Modal Error Alert */}
                      {error && (
                        <div className="pp-incident-modal-error" role="alert">
                          <span>⚠️</span>
                          <span>{error}</span>
                        </div>
                      )}
                    </div>

                    {/* Modal Footer Actions */}
                    <footer className="pp-incident-modal-footer">
                      <div className="pp-incident-modal-footer-left">
                        <button
                          type="button"
                          className="pp-modal-btn-secondary"
                          onClick={() => void performAction(activeIncident, "NOTIFY_MERCHANT")}
                          disabled={busy}
                        >
                          ↻ Regenerate with AI
                        </button>
                      </div>
                      <div className="pp-incident-modal-footer-right">
                        <button
                          type="button"
                          className="pp-modal-btn-secondary"
                          onClick={() => setActiveModalIncidentId(null)}
                        >
                          Close
                        </button>
                        {channel === "CHATBOX" ? (
                          <button
                            type="button"
                            className="pp-modal-btn-primary"
                            onClick={() => void copyDraft(activeIncident.id, demoSubject, demoBody)}
                          >
                            {copied.has(activeIncident.id) ? "✓ Copied to Clipboard" : "Copy to Clipboard"}
                          </button>
                        ) : (
                          <>
                            {mailto && (
                              <a href={mailto} className="pp-modal-btn-secondary">
                                Open Mail Client
                              </a>
                            )}
                            <button
                              type="button"
                              className="pp-modal-btn-primary"
                              onClick={() => void performAction(activeIncident, "SEND_EMAIL")}
                              disabled={busy || !validRecipient || placeholderRecipient}
                            >
                              {busy ? "Sending via Resend…" : "Send Email via Resend"}
                            </button>
                          </>
                        )}
                      </div>
                    </footer>
                  </>
                );
              })()
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function defaultIncidentRecipient(merchantId: string) {
  return merchantId === "fieldform" ? "fieldform@payproof.demo" : "northstar@payproof.demo";
}
