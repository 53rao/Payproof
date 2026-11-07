"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AllCommunityModule, themeQuartz, type ColDef, type ICellRendererParams, type IsFullWidthRowParams } from "ag-grid-community";
import { AgGridProvider, AgGridReact } from "ag-grid-react";

type FailureType = "processor_decline" | "instrument_expired" | "duplicate_invoice" | "network_timeout";
type MerchantId = "northstar" | "fieldform";
type OriginMode = "HUMAN" | "AGENT" | "MIXED";
type Compression = "compressed" | "spread";

type SimulationRow = {
  id: string;
  orderId?: string;
  simulationId?: string | null;
  scenario?: string;
  failureType?: string;
  merchantId?: string;
  origin: "HUMAN" | "AGENT" | "UNKNOWN";
  outcome: string;
  transactionId?: string | null;
  caseId?: string | null;
  caseCreated: boolean;
  createdAt: string;
};

type Diagnosis = {
  pattern_detected: string;
  likely_cause: string;
  evidence: string[];
  hypothesis: string;
  recommended_action: string;
  confidence: "high" | "medium" | "low";
  confidence_reason: string;
};

type AnalyzeResponse = {
  simulationId: string;
  merchantId: string;
  merchantName: string;
  diagnosis: Diagnosis;
  analyzedAt: string;
};

type DiagnosticResult = {
  simulationId: string;
  merchantId: string;
  failureCount: number;
  failureType: FailureType;
  origin: OriginMode;
  timeCompression: Compression;
  transactions: SimulationRow[];
  transactionIds: string[];
  caseIds: string[];
};

type GridRow = SimulationRow & { __detail?: false; __detailFor?: never; diagnosis?: never };
type DetailRow = { id: string; __detail: true; __detailFor: string; diagnosis: Diagnosis; merchantName: string; analyzedAt: string; simulationId: string };
type DisplayRow = GridRow | DetailRow;

const failureTypeOptions: { value: FailureType; label: string }[] = [
  { value: "processor_decline", label: "Processor decline" },
  { value: "instrument_expired", label: "Instrument expired" },
  { value: "duplicate_invoice", label: "Duplicate invoice" },
  { value: "network_timeout", label: "Network timeout" },
];
const merchantOptions: { value: MerchantId; label: string }[] = [
  { value: "northstar", label: "Northstar Goods" },
  { value: "fieldform", label: "Field & Form" },
];
const originOptions: { value: OriginMode; label: string }[] = [
  { value: "HUMAN", label: "Human" },
  { value: "AGENT", label: "Agent" },
  { value: "MIXED", label: "Mixed (alternates human and agent across the sequence)" },
];
const compressionOptions: { value: Compression; label: string }[] = [
  { value: "compressed", label: "Compressed — all fire immediately back to back" },
  { value: "spread", label: "Spread — 2 second delay between each transaction" },
];

const communityModules = [AllCommunityModule];
const simulationTheme = themeQuartz.withParams({
  backgroundColor: "#17243b",
  foregroundColor: "#f3f1e9",
  accentColor: "#e8ee60",
  borderColor: "#39485f",
  headerBackgroundColor: "#1d2d47",
  rowHoverColor: "#253650",
  browserColorScheme: "dark",
  fontFamily: "inherit",
  fontSize: 12,
  headerFontSize: 10,
  spacing: 6,
});

function formatFailureType(value: unknown) {
  const labels: Record<string, string> = {
    processor_decline: "Processor decline",
    instrument_expired: "Instrument expired",
    duplicate_invoice: "Duplicate invoice",
    network_timeout: "Network timeout",
    legacy: "Legacy",
  };
  const key = String(value ?? "");
  return labels[key] || key.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) || "—";
}

function ConfidenceBadge({ confidence }: { confidence: Diagnosis["confidence"] }) {
  return <span className={`pp-diagnosis-confidence pp-diagnosis-confidence-${confidence}`}>{confidence}</span>;
}

function DiagnosisCard({
  merchantName,
  analyzedAt,
  diagnosis,
}: {
  merchantName: string;
  analyzedAt: string;
  diagnosis: Diagnosis;
}) {
  return (
    <article className="pp-diagnosis-card" aria-label="Diagnostic result">
      <header className="pp-diagnosis-card-head">
        <div>
          <h4>Diagnostic result — {merchantName} — {new Date(analyzedAt).toLocaleString()}</h4>
        </div>
      </header>
      <p className="pp-diagnosis-pattern">{diagnosis.pattern_detected}</p>
      <p className="pp-diagnosis-cause">
        <strong>Likely cause.</strong> {diagnosis.likely_cause}
      </p>
      <div className="pp-diagnosis-section">
        <strong>Evidence</strong>
        <ul>
          {(diagnosis.evidence || []).map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="pp-diagnosis-hypothesis">
        <strong>Hypothesis</strong>
        <p>{diagnosis.hypothesis}</p>
      </div>
      <div className="pp-diagnosis-section">
        <strong>Recommended action</strong>
        <p>{diagnosis.recommended_action}</p>
      </div>
      <div className="pp-diagnosis-confidence-row">
        <ConfidenceBadge confidence={diagnosis.confidence} />
        <small className="pp-diagnosis-confidence-reason">{diagnosis.confidence_reason}</small>
      </div>
    </article>
  );
}

function DetailCellRenderer(props: ICellRendererParams<DetailRow>) {
  const data = props.data;
  if (!data?.__detail) return null;
  return <div className="pp-diagnosis-detail-row"><DiagnosisCard merchantName={data.merchantName} analyzedAt={data.analyzedAt} diagnosis={data.diagnosis} /></div>;
}

export function TransactionSimulations() {
  const [failureCount, setFailureCount] = useState(3);
  const [failureType, setFailureType] = useState<FailureType>("processor_decline");
  const [merchantId, setMerchantId] = useState<MerchantId>("northstar");
  const [origin, setOrigin] = useState<OriginMode>("HUMAN");
  const [timeCompression, setTimeCompression] = useState<Compression>("compressed");
  const [history, setHistory] = useState<SimulationRow[]>([]);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState("");
  const [diagnoses, setDiagnoses] = useState<Record<string, AnalyzeResponse>>({});
  const [latestDiagnosisKey, setLatestDiagnosisKey] = useState<string | null>(null);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/demo/simulations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Diagnostic history could not be loaded.");
      setHistory(body.simulations ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Diagnostic history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const onExpand = (event: Event) => {
      const detail = (event as CustomEvent<{ simulationId?: string; diagnosis?: Record<string, unknown> }>).detail;
      if (!detail?.simulationId) return;
      const simId = detail.simulationId;
      if (detail.diagnosis && typeof detail.diagnosis === "object") {
        const d = detail.diagnosis as Record<string, unknown>;
        setDiagnoses((prev) => {
          if (prev[simId]) return prev;
          return {
            ...prev,
            [simId]: {
              simulationId: simId,
              merchantId: String(d.merchantId ?? ""),
              merchantName: String(d.merchantName ?? d.merchantId ?? "Merchant"),
              analyzedAt: String(d.createdAt ?? new Date().toISOString()),
              diagnosis: {
                pattern_detected: String(d.patternDetected ?? d.pattern_detected ?? ""),
                likely_cause: String(d.likelyCause ?? d.likely_cause ?? ""),
                evidence: Array.isArray(d.evidence) ? (d.evidence as string[]) : [],
                hypothesis: String(d.hypothesis ?? ""),
                recommended_action: String(d.recommendedAction ?? d.recommended_action ?? ""),
                confidence: (d.confidence === "high" || d.confidence === "medium" || d.confidence === "low" ? d.confidence : "low") as Diagnosis["confidence"],
                confidence_reason: String(d.confidenceReason ?? d.confidence_reason ?? ""),
              },
            },
          };
        });
      }
      setExpandedKeys((prev) => new Set([...prev, simId]));
    };
    window.addEventListener("payproof:expand-diagnosis", onExpand as EventListener);
    return () => window.removeEventListener("payproof:expand-diagnosis", onExpand as EventListener);
  }, []);

  const diagnosisKeyForRow = useCallback((row: SimulationRow) => row.simulationId || row.id, []);

  const toggleExpanded = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const runAnalysis = useCallback(async (diagnostic: DiagnosticResult) => {
    setAnalyzing(true);
    setAnalysisError("");
    try {
      const response = await fetch("/api/admin/simulate/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          simulationId: diagnostic.simulationId,
          merchantId: diagnostic.merchantId,
          failureCount: diagnostic.failureCount,
          failureType: diagnostic.failureType,
          origin: diagnostic.origin,
          transactionIds: diagnostic.transactionIds,
          caseIds: diagnostic.caseIds,
          orderIds: diagnostic.transactions.map((t) => t.orderId || t.id),
        }),
        cache: "no-store",
      });
      const body = (await response.json()) as AnalyzeResponse & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Diagnostic analysis could not be completed.");
      setDiagnoses((prev) => ({ ...prev, [body.simulationId]: body }));
      setLatestDiagnosisKey(body.simulationId);
    } catch (cause) {
      setAnalysisError(cause instanceof Error ? cause.message : "Diagnostic analysis could not be completed.");
    } finally {
      setAnalyzing(false);
    }
  }, []);

  const run = async () => {
    if (running) return;
    const count = Math.max(1, Math.min(20, Math.floor(Number(failureCount) || 1)));
    setFailureCount(count);
    setRunning(true);
    setError("");
    setAnalysisError("");
    setResult(null);
    try {
      const response = await fetch("/api/demo/simulations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ failureCount: count, failureType, merchantId, origin, timeCompression }),
        cache: "no-store",
      });
      const body = (await response.json()) as DiagnosticResult & { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Sandbox diagnostic could not be completed.");
      setResult(body);
      await fetchHistory();
      void runAnalysis(body);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sandbox diagnostic could not be completed.");
    } finally {
      setRunning(false);
    }
  };

  const latest = result?.transactions[result.transactions.length - 1] ?? null;
  const latestDiagnosis = latestDiagnosisKey ? diagnoses[latestDiagnosisKey] : null;

  const displayRows = useMemo(() => {
    const rows: DisplayRow[] = [];
    for (const row of history) {
      rows.push(row as GridRow);
      const key = diagnosisKeyForRow(row);
      const entry = diagnoses[key];
      if (entry && expandedKeys.has(key)) {
        rows.push({ id: `detail-${row.id}`, __detail: true, __detailFor: row.id, diagnosis: entry.diagnosis, merchantName: entry.merchantName, analyzedAt: entry.analyzedAt, simulationId: entry.simulationId });
      }
    }
    return rows;
  }, [history, diagnoses, expandedKeys, diagnosisKeyForRow]);

  const columnDefs = useMemo<ColDef<DisplayRow>[]>(() => [
    {
      headerName: "Diagnosis",
      minWidth: 220,
      flex: 1.2,
      valueGetter: (params) => {
        const data = params.data as SimulationRow | DetailRow | undefined;
        if (!data || (data as DetailRow).__detail) return "";
        const key = diagnosisKeyForRow(data as SimulationRow);
        const entry = diagnoses[key];
        if (!entry) return latestDiagnosisKey && key === latestDiagnosisKey && analyzing ? "Analyzing…" : "Pending";
        const expanded = expandedKeys.has(key);
        return `${expanded ? "▾" : "▸"} ${entry.diagnosis.pattern_detected}`;
      },
      cellStyle: (params) => {
        const data = params.data as DetailRow | undefined;
        if (data?.__detail) return undefined;
        return { cursor: "pointer" };
      },
    },
    { field: "scenario", headerName: "Scenario", minWidth: 140, flex: 1, valueGetter: (p) => ((p.data as DetailRow)?.__detail ? "" : (p.data as SimulationRow)?.scenario), valueFormatter: ({ value }) => (value ? formatFailureType(value) : "") },
    { field: "failureType", headerName: "Failure type", minWidth: 140, flex: 1, valueGetter: (p) => ((p.data as DetailRow)?.__detail ? "" : (p.data as SimulationRow)?.failureType), valueFormatter: ({ value }) => (value ? formatFailureType(value) : "") },
    { field: "origin", headerName: "Origin", width: 105, valueGetter: (p) => ((p.data as DetailRow)?.__detail ? "" : (p.data as SimulationRow)?.origin) },
    { field: "outcome", headerName: "Outcome", width: 120, valueGetter: (p) => ((p.data as DetailRow)?.__detail ? "" : (p.data as SimulationRow)?.outcome) },
    { field: "transactionId", headerName: "Transaction ID", minWidth: 170, flex: 1, valueGetter: (p) => ((p.data as DetailRow)?.__detail ? "" : (p.data as SimulationRow)?.transactionId), valueFormatter: ({ value }) => (value ? String(value) : "") },
    { field: "caseCreated", headerName: "Case created", width: 120, valueGetter: (p) => ((p.data as DetailRow)?.__detail ? "" : (p.data as SimulationRow)?.caseCreated), valueFormatter: ({ value }) => (value === "" || value == null ? "" : value ? "Yes" : "No") },
    { field: "createdAt", headerName: "Timestamp", minWidth: 160, valueGetter: (p) => ((p.data as DetailRow)?.__detail ? "" : (p.data as SimulationRow)?.createdAt), valueFormatter: ({ value }) => (value ? new Date(String(value)).toLocaleString() : "") },
  ], [diagnoses, expandedKeys, analyzing, latestDiagnosisKey, diagnosisKeyForRow]);

  return (
    <section id="pp-diagnostic-simulation" className="pp-simulation-panel" aria-labelledby="pp-simulation-title">
      <header className="pp-simulation-head">
        <div>
          <h2 id="pp-simulation-title">Transaction simulations</h2>
          <p>Run a configurable diagnostic failure sequence against the Braintree Sandbox.</p>
        </div>
        <span>BRAINTREE SANDBOX</span>
      </header>

      <form
        className="pp-simulation-config"
        onSubmit={(event) => {
          event.preventDefault();
          void run();
        }}
      >
        <div className="pp-simulation-field">
          <label htmlFor="pp-sim-failure-count">Number of failures</label>
          <input id="pp-sim-failure-count" type="number" min={1} max={20} value={failureCount} onChange={(event) => setFailureCount(Number(event.target.value))} disabled={running} />
        </div>
        <div className="pp-simulation-field">
          <label htmlFor="pp-sim-failure-type">Failure type</label>
          <select id="pp-sim-failure-type" value={failureType} onChange={(event) => setFailureType(event.target.value as FailureType)} disabled={running}>
            {failureTypeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="pp-simulation-field">
          <label htmlFor="pp-sim-merchant">Merchant</label>
          <select id="pp-sim-merchant" value={merchantId} onChange={(event) => setMerchantId(event.target.value as MerchantId)} disabled={running}>
            {merchantOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="pp-simulation-field">
          <label htmlFor="pp-sim-origin">Origin</label>
          <select id="pp-sim-origin" value={origin} onChange={(event) => setOrigin(event.target.value as OriginMode)} disabled={running}>
            {originOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="pp-simulation-field pp-simulation-field-wide">
          <label htmlFor="pp-sim-compression">Time compression</label>
          <select id="pp-sim-compression" value={timeCompression} onChange={(event) => setTimeCompression(event.target.value as Compression)} disabled={running}>
            {compressionOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div className="pp-simulation-field pp-simulation-actions">
          <button type="submit" disabled={running}>{running ? "Running diagnostic…" : "Run diagnostic"}</button>
        </div>
      </form>

      {error && <p className="pp-simulation-error" role="alert">{error}</p>}
      {analysisError && <p className="pp-simulation-error" role="alert">{analysisError}</p>}

      {result && latest && (
        <article className="pp-simulation-result" aria-live="polite">
          <div className="pp-simulation-result-head">
            <b>Latest diagnostic result</b>
            <span>BRAINTREE SANDBOX</span>
          </div>
          <div className="pp-simulation-result-grid">
            <span>Simulation<strong className="pp-simulation-id">{result.simulationId.slice(0, 8)}</strong></span>
            <span>Failure type<strong>{formatFailureType(result.failureType)}</strong></span>
            <span>Merchant<strong>{merchantOptions.find((m) => m.value === result.merchantId)?.label ?? result.merchantId}</strong></span>
            <span>Sequence<strong>{result.failureCount} failures · {result.origin} · {result.timeCompression}</strong></span>
            <span>Latest transaction<strong className="pp-simulation-id">{latest.transactionId || "Unavailable"}</strong></span>
            <span>Latest origin<strong><i className={`pp-origin-badge ${String(latest.origin).toLowerCase()}`}>{latest.origin}</i></strong></span>
            <span>Latest outcome<strong>{latest.outcome}</strong></span>
            <span>Cases created<strong>{result.transactions.filter((t) => t.caseCreated).length} / {result.transactions.length}</strong></span>
          </div>
        </article>
      )}

      {analyzing && result && <p className="pp-diagnosis-loading" role="status">Analyzing pattern across {result.transactions.length} transactions…</p>}

      {latestDiagnosis && !analyzing && (
        <DiagnosisCard
          merchantName={latestDiagnosis.merchantName}
          analyzedAt={latestDiagnosis.analyzedAt}
          diagnosis={latestDiagnosis.diagnosis}
        />
      )}

      <div className="pp-simulation-history-head">
        <h3>Diagnostic history</h3>
        <span>{loading ? "Loading…" : `${history.length} runs`}</span>
      </div>
      <AgGridProvider modules={communityModules}>
        <div className="pp-simulation-grid">
          <AgGridReact<DisplayRow>
            rowData={displayRows}
            columnDefs={columnDefs}
            theme={simulationTheme}
            defaultColDef={{ sortable: true, resizable: true }}
            getRowId={(params) => params.data.id}
            isFullWidthRow={(params: IsFullWidthRowParams<DisplayRow>) => Boolean((params.rowNode.data as DetailRow | undefined)?.__detail)}
            fullWidthCellRenderer={DetailCellRenderer}
            getRowHeight={(params) => ((params.data as DetailRow | undefined)?.__detail ? 320 : undefined)}
            onRowClicked={(event) => {
              const data = event.data as DisplayRow | undefined;
              if (!data || (data as DetailRow).__detail) return;
              const key = diagnosisKeyForRow(data as SimulationRow);
              if (diagnoses[key]) toggleExpanded(key);
            }}
            animateRows={false}
            loading={loading}
            localeText={{ noRowsToShow: "No dashboard diagnostics have run yet." }}
          />
        </div>
      </AgGridProvider>
    </section>
  );
}
