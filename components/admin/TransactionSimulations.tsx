"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DEMO_MERCHANTS } from "@/lib/merchants";

type FailureType = "processor_decline" | "instrument_expired" | "duplicate_invoice" | "network_timeout" | "avs_mismatch";
type OriginMode = "HUMAN" | "AGENT" | "MIXED";
type Compression = "compressed" | "spread";

type LatestDiagnosisRecord = {
  id?: string;
  simulationId: string;
  merchantId: string;
  merchantName?: string;
  patternDetected: string;
  likelyCause: string;
  evidence?: string[];
  hypothesis?: string;
  recommendedAction?: string;
  confidence: "high" | "medium" | "low" | string;
  confidenceReason?: string;
  createdAt: string;
};

type FeedRow =
  | {
      id: string;
      kind: "request";
      index: number;
      total: number;
      merchant: string;
      amount: string;
      currency: string;
      failureType: string;
      origin: string;
      cardType: string;
      last4: string;
    }
  | {
      id: string;
      kind: "response";
      index: number;
      total: number;
      transactionId: string;
      outcome: string;
      processorResponseCode: string;
      processorResponseText: string;
      processorResponseType?: string;
      gatewayRejectionReason?: string | null;
      avsPostalCode: string;
      avsStreetAddress: string;
      cvv: string;
      caseId?: string | null;
      caseCreated: boolean;
    };

type MerchantFeed = {
  merchantId: string;
  merchantName: string;
  rows: FeedRow[];
  complete: boolean;
  totalTransactions?: number;
  simulationId?: string;
  status: "idle" | "streaming" | "analyzing" | "ready" | "error";
  error?: string;
};

const FAILURE_TYPE_OPTIONS: { value: FailureType; label: string }[] = [
  { value: "processor_decline", label: "Processor decline" },
  { value: "instrument_expired", label: "Instrument expired" },
  { value: "duplicate_invoice", label: "Duplicate invoice" },
  { value: "network_timeout", label: "Gateway timeout" },
  { value: "avs_mismatch", label: "AVS mismatch" },
];

const NETWORK_SCENARIOS = [
  {
    id: "paypal_braintree_outage",
    label: "PayPal / Braintree infrastructure outage",
    defaultFailureType: "network_timeout" as FailureType,
  },
  {
    id: "carding_attack",
    label: "Coordinated carding attack",
    defaultFailureType: "processor_decline" as FailureType,
    defaultOrigin: "HUMAN" as OriginMode,
  },
  {
    id: "avs_degradation",
    label: "AVS service degradation",
    defaultFailureType: "avs_mismatch" as FailureType,
  },
  {
    id: "gateway_timeout_network",
    label: "Gateway timeout (network-wide)",
    defaultFailureType: "network_timeout" as FailureType,
  },
];

const ALL_MERCHANTS: { value: string; label: string }[] = DEMO_MERCHANTS.map((m) => ({
  value: m.id,
  label: m.name,
})).sort((a, b) => a.label.localeCompare(b.label));

const ORIGIN_OPTIONS: { value: OriginMode; label: string }[] = [
  { value: "HUMAN", label: "Human" },
  { value: "AGENT", label: "Agent" },
  { value: "MIXED", label: "Mixed (alternates human and agent across the sequence)" },
];

const COMPRESSION_OPTIONS: { value: Compression; label: string }[] = [
  { value: "compressed", label: "Compressed — all fire immediately back to back" },
  { value: "spread", label: "Spread — 2 second delay between each transaction" },
];

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return "";
  const past = new Date(dateString).getTime();
  if (Number.isNaN(past)) return "";
  const diffSec = Math.max(0, Math.floor((Date.now() - past) / 1000));
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

async function streamSimulation(
  payload: Record<string, unknown>,
  onEvent: (event: any) => void,
) {
  const response = await fetch("/api/demo/simulations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });
  if (!response.ok || !response.body) {
    const errorText = await response.text();
    throw new Error(errorText || "Simulation request failed.");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completePayload: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line.trim());
        onEvent(ev);
        if (ev.type === "complete") completePayload = ev;
      } catch {
        // ignore partial parse errors
      }
    }
  }

  if (buffer.trim()) {
    try {
      const ev = JSON.parse(buffer.trim());
      onEvent(ev);
      if (ev.type === "complete") completePayload = ev;
    } catch {
      // ignore
    }
  }

  return completePayload;
}

export function TransactionSimulations() {
  // Configurator state
  const [networkMode, setNetworkMode] = useState(false);
  const [networkScenario, setNetworkScenario] = useState(NETWORK_SCENARIOS[0].id);
  const [autoFilledHint, setAutoFilledHint] = useState(false);
  const [merchantError, setMerchantError] = useState("");
  const [selectedMerchants, setSelectedMerchants] = useState<string[]>(DEMO_MERCHANTS.map((m) => m.id));
  const [merchantId, setMerchantId] = useState<string>("northstar");
  const [failureCount, setFailureCount] = useState(3);
  const [failureType, setFailureType] = useState<FailureType>("processor_decline");
  const [origin, setOrigin] = useState<OriginMode>("HUMAN");
  const [timeCompression, setTimeCompression] = useState<Compression>("compressed");

  // Run & Diagnosis state
  const [running, setRunning] = useState(false);
  const [runActive, setRunActive] = useState(false);
  const [error, setError] = useState("");
  const [analysisError, setAnalysisError] = useState("");
  const [latestDiagnosis, setLatestDiagnosis] = useState<LatestDiagnosisRecord | null>(null);
  const [showHypothesis, setShowHypothesis] = useState(false);

  // Live stream feed state
  const [feedState, setFeedState] = useState<"idle" | "running" | "analyzing">("idle");
  const [feeds, setFeeds] = useState<Record<string, MerchantFeed>>({});

  const handleResetFeed = useCallback(() => {
    setFeeds({});
    setFeedState("idle");
    setRunActive(false);
  }, []);

  const fetchLatestDiagnosis = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/simulate/latest-diagnosis", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { diagnosis?: LatestDiagnosisRecord | null };
      setLatestDiagnosis(body.diagnosis ?? null);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void fetchLatestDiagnosis();
  }, [fetchLatestDiagnosis]);

  const handleScenarioChange = (scenarioId: string) => {
    setNetworkScenario(scenarioId);
    setAutoFilledHint(true);
    if (scenarioId === "paypal_braintree_outage") {
      setFailureType("network_timeout");
      setOrigin("HUMAN");
    } else if (scenarioId === "carding_attack") {
      setFailureType("processor_decline");
      setOrigin("HUMAN");
      setFailureCount(6);
    } else if (scenarioId === "avs_degradation") {
      setFailureType("avs_mismatch");
      setOrigin("HUMAN");
    } else if (scenarioId === "gateway_timeout_network") {
      setFailureType("network_timeout");
      setTimeCompression("compressed");
    }
  };

  const toggleSelectAllMerchants = () => {
    if (selectedMerchants.length === ALL_MERCHANTS.length) {
      setSelectedMerchants([]);
    } else {
      setSelectedMerchants(ALL_MERCHANTS.map((m) => m.value));
    }
    setMerchantError("");
  };

  const toggleMerchantCheck = (mId: string) => {
    setSelectedMerchants((prev) => {
      const next = prev.includes(mId) ? prev.filter((id) => id !== mId) : [...prev, mId];
      if (next.length > 0) setMerchantError("");
      return next;
    });
  };

  const run = async () => {
    if (running) return;

    if (networkMode && selectedMerchants.length === 0) {
      setMerchantError("Select at least one merchant to run a network incident.");
      return;
    }
    setMerchantError("");

    const merchantsToRun = networkMode ? selectedMerchants : [merchantId];
    if (merchantsToRun.length === 0) return;

    setRunning(true);
    setRunActive(true);
    setError("");
    setAnalysisError("");
    setFeedState("running");

    // Initialize or preserve sub-feeds for all merchants (do not wipe existing feed events)
    setFeeds((prev) => {
      const nextFeeds: Record<string, MerchantFeed> = { ...prev };
      for (const mId of merchantsToRun) {
        const mName = DEMO_MERCHANTS.find((m) => m.id === mId)?.name ?? mId;
        nextFeeds[mId] = {
          merchantId: mId,
          merchantName: mName,
          rows: nextFeeds[mId]?.rows ?? [],
          complete: false,
          status: "streaming",
        };
      }
      return nextFeeds;
    });

    const count = Math.max(1, Math.min(20, Math.floor(Number(failureCount) || 1)));
    const batchId = networkMode ? crypto.randomUUID() : undefined;
    const scenarioLabel = networkMode
      ? NETWORK_SCENARIOS.find((s) => s.id === networkScenario)?.label ?? networkScenario
      : undefined;

    const completedRuns: Array<{
      simulationId: string;
      merchantId: string;
      totalTransactions: number;
      transactionIds: string[];
      caseIds: string[];
      orderIds: string[];
    }> = [];

    try {
      await Promise.all(
        merchantsToRun.map(async (mId) => {
          try {
            const completeEv = await streamSimulation(
              {
                failureCount: count,
                failureType,
                merchantId: mId,
                origin,
                timeCompression,
                networkBatchId: batchId,
                scenarioName: scenarioLabel,
                networkScenario: scenarioLabel,
              },
              (ev) => {
                setFeeds((prev) => {
                  const mName = DEMO_MERCHANTS.find((m) => m.id === mId)?.name ?? mId;
                  const current = prev[mId] ?? {
                    merchantId: mId,
                    merchantName: mName,
                    rows: [],
                    complete: false,
                    status: "streaming",
                  };
                  if (ev.type === "request") {
                    const row: FeedRow = {
                      id: `req-${mId}-${ev.index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      kind: "request",
                      index: ev.index,
                      total: ev.total,
                      merchant: ev.merchant,
                      amount: ev.amount,
                      currency: ev.currency,
                      failureType: ev.failureType,
                      origin: ev.origin,
                      cardType: ev.cardType,
                      last4: ev.last4,
                    };
                    const nextRows = [...current.rows, row];
                    return {
                      ...prev,
                      [mId]: {
                        ...current,
                        rows: nextRows.length > 100 ? nextRows.slice(1) : nextRows,
                      },
                    };
                  }
                  if (ev.type === "response") {
                    const row: FeedRow = {
                      id: `resp-${mId}-${ev.index}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      kind: "response",
                      index: ev.index,
                      total: ev.total,
                      transactionId: ev.transactionId,
                      outcome: ev.outcome,
                      processorResponseCode: ev.processorResponseCode,
                      processorResponseText: ev.processorResponseText,
                      processorResponseType: ev.processorResponseType,
                      gatewayRejectionReason: ev.gatewayRejectionReason,
                      avsPostalCode: ev.avsPostalCode,
                      avsStreetAddress: ev.avsStreetAddress,
                      cvv: ev.cvv,
                      caseId: ev.caseId,
                      caseCreated: ev.caseCreated,
                    };
                    const nextRows = [...current.rows, row];
                    return {
                      ...prev,
                      [mId]: {
                        ...current,
                        rows: nextRows.length > 100 ? nextRows.slice(1) : nextRows,
                      },
                    };
                  }
                  if (ev.type === "complete") {
                    return {
                      ...prev,
                      [mId]: {
                        ...current,
                        complete: true,
                        totalTransactions: ev.totalTransactions,
                        simulationId: ev.simulationId,
                      },
                    };
                  }
                  return prev;
                });
              },
            );

            if (completeEv?.simulationId) {
              completedRuns.push({
                simulationId: completeEv.simulationId,
                merchantId: mId,
                totalTransactions: completeEv.totalTransactions ?? count,
                transactionIds: completeEv.transactionIds ?? [],
                caseIds: completeEv.caseIds ?? [],
                orderIds: (completeEv.transactions ?? []).map((t: any) => t.orderId || t.id),
              });
            }
          } catch (mErr) {
            setFeeds((prev) => {
              const cur = prev[mId];
              if (!cur) return prev;
              return { ...prev, [mId]: { ...cur, status: "error", error: mErr instanceof Error ? mErr.message : "Error" } };
            });
          }
        }),
      );

      // Fire POST /api/admin/simulate/analyze once per merchant sequentially
      for (const runItem of completedRuns) {
        setFeeds((prev) => {
          const cur = prev[runItem.merchantId];
          if (!cur) return prev;
          return { ...prev, [runItem.merchantId]: { ...cur, status: "analyzing" } };
        });

        try {
          const analyzeRes = await fetch("/api/admin/simulate/analyze", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              simulationId: runItem.simulationId,
              merchantId: runItem.merchantId,
              failureCount: runItem.totalTransactions,
              failureType,
              origin,
              transactionIds: runItem.transactionIds,
              caseIds: runItem.caseIds,
              orderIds: runItem.orderIds,
            }),
            cache: "no-store",
          });
          if (analyzeRes.ok) {
            setFeeds((prev) => {
              const cur = prev[runItem.merchantId];
              if (!cur) return prev;
              return { ...prev, [runItem.merchantId]: { ...cur, status: "ready" } };
            });
          }
        } catch {
          // ignore analyze error and continue sequential execution
        }
      }

      // Refresh data
      await fetchLatestDiagnosis();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Diagnostic run could not be completed.");
    } finally {
      setRunning(false);
    }
  };

  const feedList = useMemo(() => Object.values(feeds), [feeds]);

  return (
    <section id="pp-diagnostic-simulation" className="pp-simulation-panel" aria-labelledby="pp-simulation-title">
      <header className="pp-simulation-head">
        <div>
          <h2 id="pp-simulation-title">Transaction simulations</h2>
          <p>Run a configurable diagnostic failure sequence against the Braintree Sandbox.</p>
        </div>
        <span>BRAINTREE SANDBOX</span>
      </header>

      {/* Two-Column Layout */}
      <div className="pp-sim-split">
        {/* Left Column — Configurator */}
        <div className="pp-sim-col-config">
          {/* Network Incident Mode Toggle */}
          <div className="pp-net-toggle-row">
            <div className="pp-net-toggle-left">
              <svg className="pp-net-globe-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
              <span className="pp-net-toggle-label">Network incident mode</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={networkMode}
              className={`pp-net-toggle-switch ${networkMode ? "is-active" : ""}`}
              onClick={() => {
                setNetworkMode((prev) => {
                  const next = !prev;
                  if (next) {
                    handleScenarioChange(networkScenario);
                  }
                  return next;
                });
                setMerchantError("");
              }}
              disabled={running}
              aria-label="Toggle network incident mode"
            >
              <span className="pp-net-toggle-slider" />
            </button>
          </div>

          <form
            className="pp-sim-form"
            onSubmit={(event) => {
              event.preventDefault();
              void run();
            }}
          >
            <div className="pp-sim-form-grid">
              <div className="pp-sim-field">
                <label htmlFor="pp-sim-failure-count" className="pp-sim-field-label">Number of failures</label>
                <input
                  id="pp-sim-failure-count"
                  type="number"
                  min={1}
                  max={20}
                  className="pp-sim-input"
                  value={failureCount}
                  onChange={(event) => setFailureCount(Number(event.target.value))}
                  disabled={running}
                />
              </div>

              <div className="pp-sim-field">
                <label htmlFor="pp-sim-failure-type" className="pp-sim-field-label">Failure type</label>
                <select
                  id="pp-sim-failure-type"
                  className="pp-sim-select"
                  value={failureType}
                  onChange={(event) => {
                    setFailureType(event.target.value as FailureType);
                    setAutoFilledHint(false);
                  }}
                  disabled={running}
                >
                  {FAILURE_TYPE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                {autoFilledHint && (
                  <p className="pp-sim-autofill-hint">Set by scenario — you can override this.</p>
                )}
              </div>

              {/* Dynamic Mode Section (150ms height transition) */}
              <div className={`pp-sim-mode-container ${networkMode ? "is-network" : "is-single"}`}>
                {/* Scenario dropdown (visible only in Network Incident Mode, between Failure type and merchant checklist) */}
                {networkMode && (
                  <div className="pp-sim-field pp-sim-field-span2">
                    <label htmlFor="pp-sim-scenario" className="pp-sim-field-label">SCENARIO</label>
                    <select
                      id="pp-sim-scenario"
                      className="pp-sim-select"
                      value={networkScenario}
                      onChange={(event) => handleScenarioChange(event.target.value)}
                      disabled={running}
                    >
                      {NETWORK_SCENARIOS.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>{scenario.label}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Merchant Selection: Dropdown in single mode vs Checkbox list in network mode */}
                {!networkMode ? (
                  <div className="pp-sim-field pp-sim-field-span2">
                    <label htmlFor="pp-sim-merchant" className="pp-sim-field-label">Merchant</label>
                    <select
                      id="pp-sim-merchant"
                      className="pp-sim-select"
                      value={merchantId}
                      onChange={(event) => setMerchantId(event.target.value)}
                      disabled={running}
                    >
                      {ALL_MERCHANTS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="pp-sim-field pp-sim-field-span2">
                    <label className="pp-sim-field-label">Target Merchants</label>
                    <div className="pp-merchant-checklist-card">
                      <label className="pp-merchant-check-row">
                        <input
                          type="checkbox"
                          checked={selectedMerchants.length === ALL_MERCHANTS.length}
                          onChange={toggleSelectAllMerchants}
                          disabled={running}
                        />
                        <strong style={{ color: "#ffffff" }}>Select all merchants</strong>
                      </label>
                      <div className="pp-merchant-check-divider" />
                      {ALL_MERCHANTS.map((m) => (
                        <label key={m.value} className="pp-merchant-check-row">
                          <input
                            type="checkbox"
                            checked={selectedMerchants.includes(m.value)}
                            onChange={() => toggleMerchantCheck(m.value)}
                            disabled={running}
                          />
                          <span>{m.label}</span>
                        </label>
                      ))}
                    </div>
                    {merchantError && (
                      <p className="pp-merchant-error-text">{merchantError}</p>
                    )}
                  </div>
                )}
              </div>

              <div className="pp-sim-field">
                <label htmlFor="pp-sim-origin" className="pp-sim-field-label">Origin</label>
                <select
                  id="pp-sim-origin"
                  className="pp-sim-select"
                  value={origin}
                  onChange={(event) => setOrigin(event.target.value as OriginMode)}
                  disabled={running}
                >
                  {ORIGIN_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div className="pp-sim-field">
                <label htmlFor="pp-sim-compression" className="pp-sim-field-label">Time compression</label>
                <select
                  id="pp-sim-compression"
                  className="pp-sim-select"
                  value={timeCompression}
                  onChange={(event) => setTimeCompression(event.target.value as Compression)}
                  disabled={running}
                >
                  {COMPRESSION_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              className={`pp-sim-run-btn ${running ? "is-running" : ""}`}
              disabled={running}
            >
              {running
                ? networkMode
                  ? "Running network incident…"
                  : "Running diagnostic…"
                : networkMode
                  ? "Run network incident"
                  : "Run diagnostic"}
            </button>
          </form>

          {error && <p className="pp-simulation-error" role="alert">{error}</p>}
          {analysisError && <p className="pp-simulation-error" role="alert">{analysisError}</p>}
        </div>

        {/* Right Column — Live Stream Feed vs Idle Last Diagnosis Card */}
        <div className="pp-sim-col-diagnosis">
          {runActive || feedState !== "idle" ? (
            /* STATE 2 & STATE 3: Dark Terminal Feed Panel */
            <div className="pp-sim-feed-panel" role="log" aria-live="polite">
              <div className="pp-sim-feed-header">
                <span>{networkMode ? "Live Network Feed · Parallel Streams" : "Live Diagnostic Stream"}</span>
                {!running ? (
                  <button
                    type="button"
                    className="pp-sim-feed-dismiss"
                    onClick={handleResetFeed}
                    aria-label="Dismiss feed"
                  >
                    ✕
                  </button>
                ) : (
                  <span style={{ color: "var(--pp-orange)", fontWeight: 700 }}>● Active</span>
                )}
              </div>

              <div className="pp-sim-feed-scroll">
                {feedList.map((f) => (
                  <div key={f.merchantId} className="pp-sim-subfeed">
                    {networkMode && (
                      <div className="pp-sim-subfeed-title">
                        <span aria-hidden="true">🏢</span>
                        <span>{f.merchantName}</span>
                      </div>
                    )}

                    {f.rows.map((row) => {
                      if (row.kind === "request") {
                        return (
                          <div key={row.id} className="pp-sim-feed-row pp-sim-feed-req">
                            <span className="pp-sim-feed-dot" />
                            <span>
                              → [{row.index}/{row.total}] {row.merchant} {row.cardType} ····{row.last4} ${row.amount} {row.origin}
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div key={row.id} className="pp-sim-feed-row pp-sim-feed-resp">
                          <span>
                            ← [{row.index}/{row.total}]
                          </span>
                          <span className="pp-sim-feed-badge-failed">FAILED</span>
                          <span>
                            {row.processorResponseCode} · {row.processorResponseText}
                          </span>
                          <span style={{ color: "#64748b" }}>
                            CVV: {row.cvv} AVS: {row.avsPostalCode}/{row.avsStreetAddress}
                          </span>
                          {row.caseId && <span style={{ color: "#94a3b8" }}>Case: {row.caseId}</span>}
                        </div>
                      );
                    })}

                    {f.complete && f.status === "analyzing" && (
                      <div className="pp-sim-feed-analyzing">
                        <span>Analyzing pattern…</span>
                      </div>
                    )}

                    {f.status === "ready" && (
                      <div className="pp-sim-feed-ready">
                        <span>✓ Diagnosis ready</span>
                      </div>
                    )}

                    {f.complete && f.status !== "analyzing" && f.status !== "ready" && (
                      <div className="pp-sim-feed-complete">
                        <span>✓ Scenario complete — {f.totalTransactions ?? failureCount} transactions captured · Analyzing pattern...</span>
                      </div>
                    )}

                    {f.status === "error" && (
                      <div style={{ color: "#f87171", fontSize: "11px", marginTop: "4px" }}>
                        ⚠️ {f.error}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            /* STATE 1: Resting Last Diagnosis Card */
            <div className="pp-last-diag-card">
              {latestDiagnosis ? (
                <div className="pp-last-diag-content">
                  <div className="pp-last-diag-header">
                    <span className="pp-last-diag-merchant-pill">
                      {DEMO_MERCHANTS.find((m) => m.id === latestDiagnosis.merchantId)?.name ?? latestDiagnosis.merchantName ?? latestDiagnosis.merchantId}
                    </span>
                    <span className={`pp-diagnosis-confidence pp-diagnosis-confidence-${latestDiagnosis.confidence.toLowerCase()}`}>
                      {latestDiagnosis.confidence}
                    </span>
                  </div>

                  <h3 className="pp-last-diag-headline">{latestDiagnosis.patternDetected}</h3>
                  <p className="pp-last-diag-subtitle">{latestDiagnosis.likelyCause}</p>

                  {latestDiagnosis.confidenceReason && (
                    <span className="pp-last-diag-conf-reason">{latestDiagnosis.confidenceReason}</span>
                  )}

                  {latestDiagnosis.recommendedAction && (
                    <div className="pp-last-diag-action-block">
                      <span className="pp-last-diag-action-label">
                        <span aria-hidden="true">→</span> Recommended action
                      </span>
                      <p className="pp-last-diag-action-text">{latestDiagnosis.recommendedAction}</p>
                    </div>
                  )}

                  {latestDiagnosis.hypothesis && (
                    <div className="pp-last-diag-hypothesis-wrapper">
                      <button
                        type="button"
                        className="pp-hypothesis-toggle"
                        onClick={() => setShowHypothesis((prev) => !prev)}
                      >
                        {showHypothesis ? "Hide hypothesis" : "Show hypothesis"}
                      </button>
                      {showHypothesis && (
                        <p className="pp-hypothesis-text">{latestDiagnosis.hypothesis}</p>
                      )}
                    </div>
                  )}

                  <div className="pp-last-diag-footer">
                    <span className="pp-last-diag-time">
                      {formatRelativeTime(latestDiagnosis.createdAt)}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="pp-last-diag-empty">
                  <p>No diagnosis yet — run a simulation to generate your first insight.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
