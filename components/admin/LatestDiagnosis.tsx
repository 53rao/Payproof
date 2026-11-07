"use client";
import { useCallback, useEffect, useState } from "react";

type LatestDiagnosisRecord = {
  id: string;
  simulationId: string;
  merchantId: string;
  merchantName: string;
  patternDetected: string;
  likelyCause: string;
  evidence: string[];
  hypothesis: string;
  recommendedAction: string;
  confidence: "high" | "medium" | "low" | string;
  confidenceReason: string;
  createdAt: string;
};

function ConfidenceBadge({ confidence }: { confidence: string }) {
  const level = confidence === "high" || confidence === "medium" || confidence === "low" ? confidence : "low";
  return <span className={`pp-diagnosis-confidence pp-diagnosis-confidence-${level}`}>{level}</span>;
}

export function LatestDiagnosis() {
  const [diagnosis, setDiagnosis] = useState<LatestDiagnosisRecord | null>(null);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/simulate/latest-diagnosis", { cache: "no-store" });
      if (!response.ok) return;
      const body = (await response.json()) as { diagnosis?: LatestDiagnosisRecord | null };
      setDiagnosis(body.diagnosis ?? null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  if (!loaded) return null;
  if (!diagnosis) {
    return (
      <section className="pp-panel pp-latest-diagnosis" aria-labelledby="pp-latest-diagnosis-title">
        <header className="pp-latest-diagnosis-head">
          <div>
            <h2 id="pp-latest-diagnosis-title">Latest diagnostic insight</h2>
            <p>No diagnostic run yet. Configure a failure pattern in Demo Tools below to generate your first insight.</p>
          </div>
        </header>
      </section>
    );
  }

  const scrollToSimulation = (expand: boolean) => {
    document.getElementById("pp-diagnostic-simulation")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (expand) window.dispatchEvent(new CustomEvent("payproof:expand-diagnosis", { detail: { simulationId: diagnosis.simulationId, diagnosis } }));
  };

  return (
    <section className="pp-panel pp-latest-diagnosis" aria-labelledby="pp-latest-diagnosis-title">
      <header className="pp-latest-diagnosis-head">
        <div>
          <h2 id="pp-latest-diagnosis-title">Latest diagnostic insight</h2>
          <p className="pp-latest-diagnosis-meta">Generated {new Date(diagnosis.createdAt).toLocaleString()}</p>
        </div>
      </header>
      <p className="pp-latest-diagnosis-merchant">{diagnosis.merchantName}</p>
      <p className="pp-latest-diagnosis-pattern">{diagnosis.patternDetected}</p>
      <p className="pp-latest-diagnosis-cause"><strong>Likely cause.</strong> {diagnosis.likelyCause}</p>
      <div className="pp-diagnosis-hypothesis">
        <strong>Hypothesis</strong>
        <p>{diagnosis.hypothesis}</p>
      </div>
      <div className="pp-diagnosis-section">
        <strong>Recommended action</strong>
        <p>{diagnosis.recommendedAction}</p>
      </div>
      <div className="pp-diagnosis-confidence-row">
        <ConfidenceBadge confidence={diagnosis.confidence} />
      </div>
      <div className="pp-latest-diagnosis-actions">
        <button type="button" className="pp-link-button" onClick={() => scrollToSimulation(false)}>Run new diagnostic</button>
        <button type="button" className="pp-link-button" onClick={() => scrollToSimulation(true)}>View full analysis</button>
      </div>
    </section>
  );
}
