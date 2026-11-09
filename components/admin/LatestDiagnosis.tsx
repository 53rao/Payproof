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

function InsightMark() {
  return (
    <span className="pp-latest-mark" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3.5 13.6 9l5.4 1.6-5.4 1.6L12 17.7l-1.6-5.5L5 10.6 10.4 9 12 3.5Z" />
        <path d="M18.5 16.5 19.2 18.6l2.3.7-2.3.7-.7 2.1-.7-2.1-2.3-.7 2.3-.7.7-2.1Z" />
      </svg>
    </span>
  );
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

  if (!loaded) {
    return (
      <section className="pp-panel pp-latest-diagnosis" aria-labelledby="pp-latest-diagnosis-title" aria-busy="true">
        <header className="pp-latest-diagnosis-head">
          <div className="pp-latest-heading">
            <InsightMark />
            <div>
              <h2 id="pp-latest-diagnosis-title">Latest diagnostic insight</h2>
              <p className="pp-latest-sub">What PayProof concluded from the most recent simulation</p>
            </div>
          </div>
        </header>
        <div className="pp-latest-body">
          <div className="pp-network-buffer" role="status" aria-live="polite">
            <div className="pp-agent-glow-orb" aria-hidden="true" />
            <h3 className="pp-agent-hover-heading">Reading the latest diagnosis…</h3>
            <p className="pp-agent-shimmer-sub">
              Reconstructing checkout evidence, decline patterns, and the most likely cause behind the latest simulation.
            </p>
            <div className="pp-agent-steps-pill">
              <span className="pp-agent-pulse-dot" aria-hidden="true" />
              <span>Buffering diagnostic insight</span>
            </div>
          </div>
        </div>
      </section>
    );
  }
  if (!diagnosis) {
    return (
      <section className="pp-panel pp-latest-diagnosis" aria-labelledby="pp-latest-diagnosis-title">
        <header className="pp-latest-diagnosis-head">
          <div className="pp-latest-heading">
            <InsightMark />
            <div>
              <h2 id="pp-latest-diagnosis-title">Latest diagnostic insight</h2>
              <p className="pp-latest-sub">What PayProof concluded from the most recent simulation</p>
            </div>
          </div>
        </header>
        <div className="pp-latest-body is-empty">
          <div className="pp-latest-empty">
            <span className="pp-latest-empty-dot" aria-hidden="true" />
            <p>No diagnostic run yet. Run a failure simulation from Demo Tools on the Merchant Desk to generate your first insight.</p>
          </div>
        </div>
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
        <div className="pp-latest-heading">
          <InsightMark />
          <div>
            <h2 id="pp-latest-diagnosis-title">Latest diagnostic insight</h2>
            <p className="pp-latest-sub">Generated {new Date(diagnosis.createdAt).toLocaleString()}</p>
          </div>
        </div>
        <div className="pp-latest-pill">
          <span className="pp-latest-pill-label">Confidence</span>
          <ConfidenceBadge confidence={diagnosis.confidence} />
        </div>
      </header>

      <div className="pp-latest-body">
        <div className="pp-latest-finding">
          <div className="pp-latest-merchant-row">
            <span className="pp-latest-merchant-label">Merchant</span>
            <span className="pp-latest-merchant-name">{diagnosis.merchantName}</span>
          </div>
          <p className="pp-latest-pattern">{diagnosis.patternDetected}</p>
          <div className="pp-latest-cause">
            <span className="pp-latest-cause-label">Likely cause</span>
            <p>{diagnosis.likelyCause}</p>
          </div>
        </div>

        <div className="pp-latest-grid">
          <article className="pp-latest-block">
            <span className="pp-latest-block-label">Hypothesis</span>
            <p>{diagnosis.hypothesis}</p>
          </article>
          <article className="pp-latest-block">
            <span className="pp-latest-block-label">Recommended action</span>
            <p>{diagnosis.recommendedAction}</p>
          </article>
        </div>
      </div>

      <div className="pp-latest-footer">
        <div className="pp-latest-reason">
          <span className="pp-latest-reason-label">Why this confidence</span>
          <p>{diagnosis.confidenceReason}</p>
        </div>
        <div className="pp-latest-actions">
          <button type="button" className="pp-latest-button is-secondary" onClick={() => scrollToSimulation(false)}>Run new diagnostic</button>
          <button type="button" className="pp-latest-button is-primary" onClick={() => scrollToSimulation(true)}>View full analysis</button>
        </div>
      </div>
    </section>
  );
}
