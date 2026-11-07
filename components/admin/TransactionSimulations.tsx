"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AllCommunityModule, themeQuartz, type ColDef } from "ag-grid-community";
import { AgGridProvider, AgGridReact } from "ag-grid-react";

type ScenarioName = "HUMAN_SUCCESS" | "HUMAN_FAILURE" | "AGENT_SUCCESS" | "AGENT_FAILURE";
type SimulationRow = { id: string; scenario: string; origin: "HUMAN" | "AGENT"; outcome: string; transactionId?: string | null; caseCreated: boolean; createdAt: string };
const scenarioOptions: { value: ScenarioName; label: string }[] = [
  { value: "HUMAN_SUCCESS", label: "Human success" },
  { value: "HUMAN_FAILURE", label: "Human failure" },
  { value: "AGENT_SUCCESS", label: "Agent success" },
  { value: "AGENT_FAILURE", label: "Agent failure" },
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
const columnDefs: ColDef<SimulationRow>[] = [
  { field: "scenario", headerName: "Scenario", minWidth: 150, flex: 1, valueFormatter: ({ value }) => String(value ?? "").replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) },
  { field: "origin", headerName: "Origin", width: 105 },
  { field: "outcome", headerName: "Outcome", width: 120 },
  { field: "transactionId", headerName: "Transaction ID", minWidth: 180, flex: 1, valueFormatter: ({ value }) => value || "—" },
  { field: "caseCreated", headerName: "Case created", width: 125, cellDataType: "text", valueFormatter: ({ value }) => value ? "Yes" : "No" },
  { field: "createdAt", headerName: "Timestamp", minWidth: 165, valueFormatter: ({ value }) => value ? new Date(value).toLocaleString() : "—" },
];

export function TransactionSimulations() {
  const [scenario, setScenario] = useState<ScenarioName>("HUMAN_SUCCESS");
  const [history, setHistory] = useState<SimulationRow[]>([]);
  const [result, setResult] = useState<SimulationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/demo/simulations", { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Simulation history could not be loaded.");
      setHistory(body.simulations ?? []);
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Simulation history could not be loaded.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  const run = async () => {
    if (running) return;
    setRunning(true); setError("");
    try {
      const response = await fetch("/api/demo/simulations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenario }), cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "Sandbox simulation could not be completed.");
      setResult(body.simulation);
      await fetchHistory();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Sandbox simulation could not be completed."); }
    finally { setRunning(false); }
  };

  const rowData = useMemo(() => history, [history]);
  return <section className="pp-simulation-panel" aria-labelledby="pp-simulation-title">
    <header className="pp-simulation-head"><div><h2 id="pp-simulation-title">Transaction simulations</h2><p>Run an owner initiated scenario against the Braintree Sandbox.</p></div><span>BRAINTREE SANDBOX</span></header>
    <div className="pp-simulation-controls"><label htmlFor="pp-simulation-scenario">Scenario</label><select id="pp-simulation-scenario" value={scenario} onChange={(event) => setScenario(event.target.value as ScenarioName)} disabled={running}>{scenarioOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><button type="button" onClick={() => void run()} disabled={running}>{running ? "Running…" : "Run simulation"}</button></div>
    {error && <p className="pp-simulation-error" role="alert">{error}</p>}
    {result && <article className="pp-simulation-result" aria-live="polite"><div className="pp-simulation-result-head"><b>Latest result</b><span>BRAINTREE SANDBOX</span></div><div className="pp-simulation-result-grid"><span>Scenario<strong>{scenarioOptions.find((item) => item.value.toLowerCase() === result.scenario)?.label ?? result.scenario}</strong></span><span>Origin<strong><i className={`pp-origin-badge ${result.origin.toLowerCase()}`}>{result.origin}</i></strong></span><span>Outcome<strong>{result.outcome}</strong></span><span>Braintree transaction ID<strong className="pp-simulation-id">{result.transactionId || "Unavailable"}</strong></span><span>Case created<strong>{result.caseCreated ? "Yes" : "No"}</strong></span></div></article>}
    <div className="pp-simulation-history-head"><h3>Simulation history</h3><span>{loading ? "Loading…" : `${history.length} runs`}</span></div>
    <AgGridProvider modules={communityModules}><div className="pp-simulation-grid"><AgGridReact<SimulationRow> rowData={rowData} columnDefs={columnDefs} theme={simulationTheme} defaultColDef={{ sortable: true, resizable: true }} getRowId={({ data }) => data.id} animateRows={false} loading={loading} localeText={{ noRowsToShow: "No dashboard simulations have run yet." }}/></div></AgGridProvider>
  </section>;
}
