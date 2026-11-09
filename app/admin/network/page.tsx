"use client";
import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { SectionRail } from "@/components/admin/SectionRail";
import { DashboardHeader } from "@/components/admin/DashboardHeader";
import { Incidents } from "@/components/admin/Incidents";
import { LatestDiagnosis } from "@/components/admin/LatestDiagnosis";
import { AgentActions } from "@/components/admin/AgentActions";
import { MerchantHealthSummary } from "@/components/admin/MerchantHealthSummary";
import "../admin.css";
import "./network.css";

const ORIGINS = ["HUMAN", "AGENT", "UNKNOWN"] as const;
type Origin = typeof ORIGINS[number];

type CheckoutOrigins = {
  totals: Record<Origin, number> & { total: number };
  byMerchant: Array<Record<Origin, number> & { merchantId: string; merchantName: string }>;
};

type AgentCommerce = {
  totalAgentOrders: number;
  failedAgentOrders: number;
  agentFailureRate: number;
  casesCreated: number;
  merchantBreakdown: Array<{
    merchantId: string;
    merchantName: string;
    total: number;
    failed: number;
    failureRate: number;
    openCases: number;
  }>;
};

type CasePressure = {
  totalOpenCases: number;
  merchants: Array<{
    merchantId: string;
    merchantName: string;
    openCases: number;
    oldestCaseAgeHours: number;
    humanCasesNeedingAction: number;
  }>;
};

const emptyOrigins: CheckoutOrigins = { totals: { HUMAN: 0, AGENT: 0, UNKNOWN: 0, total: 0 }, byMerchant: [] };
const emptyAgentCommerce: AgentCommerce = {
  totalAgentOrders: 0,
  failedAgentOrders: 0,
  agentFailureRate: 0,
  casesCreated: 0,
  merchantBreakdown: [],
};
const emptyCasePressure: CasePressure = { totalOpenCases: 0, merchants: [] };

function usePolledJson<T>(url: string, initial: T) {
  const [data, setData] = useState<T>(initial);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch(url, { cache: "no-store" });
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error ?? "Could not load this insight.");
        if (active) {
          setData(body as T);
          setError("");
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Could not load this insight.");
      } finally {
        if (active) setLoading(false);
      }
    };
    void load();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 30_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [url]);

  return { data, error, loading };
}

function percent(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

function failureTone(rate: number) {
  if (rate > 60) return "is-red";
  if (rate >= 30) return "is-amber";
  return "is-green";
}

function openCaseTone(count: number) {
  if (count > 10) return "is-red";
  if (count >= 5) return "is-amber";
  return "is-green";
}

function caseAgeTone(hours: number) {
  if (hours > 24) return "is-red";
  if (hours >= 12) return "is-amber";
  return "is-muted";
}

function InsightHead({ id, title, sub, badge }: { id: string; title: string; sub: string; badge?: string }) {
  return <header className="pp-panel-head">
    <div>
      <h2 id={id}>{title}</h2>
      <p>{sub}</p>
    </div>
    {badge && <span className="pp-insight-badge">{badge}</span>}
  </header>;
}

function InsightEmpty({ children }: { children: ReactNode }) {
  return <p className="pp-insight-empty"><span aria-hidden="true">○</span><span>{children}</span></p>;
}

function InsightBuffer({ heading, sub, step }: { heading: string; sub: string; step: string }) {
  return <div className="pp-network-buffer" role="status" aria-live="polite">
    <div className="pp-agent-glow-orb" aria-hidden="true" />
    <h3 className="pp-agent-hover-heading">{heading}</h3>
    <p className="pp-agent-shimmer-sub">{sub}</p>
    <div className="pp-agent-steps-pill">
      <span className="pp-agent-pulse-dot" aria-hidden="true" />
      <span>{step}</span>
    </div>
  </div>;
}

function OriginSkeleton() {
  return <div className="pp-origin-layout pp-origin-skeleton" aria-hidden="true">
    <div className="pp-origin-tiles">
      {[0, 1, 2].map((tile) => <div className="pp-origin-tile" key={tile}>
        <span className="pp-skeleton pp-skeleton-line" style={{ width: "52%" }} />
        <span className="pp-skeleton pp-skeleton-line" style={{ width: "40%", height: 26 }} />
        <span className="pp-skeleton pp-skeleton-line" style={{ width: "68%" }} />
      </div>)}
    </div>
    <div className="pp-origin-bars">
      {[0, 1, 2, 3, 4].map((row) => <div className="pp-origin-bar-row" key={row}>
        <span className="pp-skeleton pp-skeleton-line" style={{ width: row % 2 ? "64%" : "82%" }} />
        <span className="pp-skeleton pp-origin-skeleton-bar" />
      </div>)}
    </div>
  </div>;
}

function AgentCommerceSkeleton() {
  return <div className="pp-commerce-skeleton" aria-hidden="true">
    <div className="pp-stat-row">
      {[0, 1, 2, 3].map((tile) => <div className="pp-stat-tile" key={tile}>
        <span className="pp-skeleton pp-skeleton-line" style={{ width: "72%" }} />
        <span className="pp-skeleton pp-skeleton-line" style={{ width: "38%", height: 22 }} />
      </div>)}
    </div>
    <div className="pp-insight-table-wrap">
      <table className="pp-insight-table">
        <thead><tr><th /><th /><th /><th /><th /></tr></thead>
        <tbody>
          {[0, 1, 2, 3].map((row) => <tr key={row}>
            {[0, 1, 2, 3, 4].map((cell) => <td key={cell}>
              <span className="pp-skeleton pp-skeleton-line" style={{ width: cell === 0 ? "78%" : "52%" }} />
            </td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  </div>;
}

function CasePressureSkeleton() {
  return <div className="pp-pressure-skeleton" aria-hidden="true">
    <span className="pp-skeleton pp-skeleton-line" style={{ width: "44%", height: 16, marginTop: 16 }} />
    <div className="pp-pressure-list">
      {[0, 1, 2, 3, 4].map((row) => <div className="pp-pressure-row" key={row}>
        <span className="pp-skeleton pp-skeleton-line" style={{ width: "74%" }} />
        <span className="pp-skeleton pp-skeleton-line" style={{ width: 32, height: 20, borderRadius: 999 }} />
        <span className="pp-skeleton pp-skeleton-line" style={{ width: 58 }} />
        <span className="pp-skeleton pp-skeleton-line" style={{ width: 34 }} />
      </div>)}
    </div>
  </div>;
}

function CheckoutOriginPanel() {
  const { data, error, loading } = usePolledJson("/api/admin/checkout-origins", emptyOrigins);

  return <section className="pp-panel pp-insight-panel" aria-labelledby="pp-origin-title" aria-busy={loading}>
    <InsightHead
      id="pp-origin-title"
      title="Checkout origin breakdown"
      sub="HUMAN · AGENT · UNKNOWN across all merchants · last 48 hours"
    />
    {error ? <p className="pp-insight-error" role="alert">{error}</p> : <div className="pp-insight-body is-origins">
      {loading ? <OriginSkeleton /> : data.totals.total ? (
      <div className="pp-origin-layout">
        <div className="pp-origin-tiles">
          {ORIGINS.map((origin) => <div
            key={origin}
            className={`pp-origin-tile${origin === "AGENT" && data.totals.AGENT > 0 ? " is-active" : ""}`}
          >
            <span className="pp-origin-tile-label">{origin}</span>
            <b>{data.totals[origin]}</b>
            <small>{percent(data.totals[origin], data.totals.total)}% of total</small>
          </div>)}
        </div>
        <div className="pp-origin-bars">
          {data.byMerchant.map((merchant) => {
            const total = merchant.HUMAN + merchant.AGENT + merchant.UNKNOWN;
            return <div className="pp-origin-bar-row" key={merchant.merchantId}>
              <span className="pp-origin-merchant" title={merchant.merchantName}>{merchant.merchantName}</span>
              <div
                className="pp-origin-bar"
                role="img"
                aria-label={`${merchant.merchantName}: ${merchant.HUMAN} human, ${merchant.AGENT} agent, ${merchant.UNKNOWN} unknown`}
              >
                {merchant.HUMAN > 0 && <i className="is-human" style={{ width: `${(merchant.HUMAN / total) * 100}%` }} />}
                {merchant.AGENT > 0 && <i className="is-agent" style={{ width: `${(merchant.AGENT / total) * 100}%` }} />}
                {merchant.UNKNOWN > 0 && <i className="is-unknown" style={{ width: `${(merchant.UNKNOWN / total) * 100}%` }} />}
              </div>
            </div>;
          })}
        </div>
      </div>
    ) : <InsightEmpty>No orders recorded in the last 48 hours</InsightEmpty>}
    </div>}
  </section>;
}

function AgentCommercePanel() {
  const { data, error, loading } = usePolledJson("/api/admin/agent-commerce", emptyAgentCommerce);

  return <section className="pp-panel pp-insight-panel" aria-labelledby="pp-agent-commerce-title" aria-busy={loading}>
    <InsightHead
      id="pp-agent-commerce-title"
      title="Agent commerce"
      sub="Agent-initiated checkout outcomes · last 48 hours"
    />
    {error ? <p className="pp-insight-error" role="alert">{error}</p> : <div className="pp-insight-body is-commerce">
      {loading ? <InsightBuffer
        heading="Reading agent commerce…"
        sub="Correlating agent-initiated checkouts with declines, recovery guards, and case creation."
        step="Buffering agent checkout telemetry"
      /> : data.totalAgentOrders ? <>
      <div className="pp-stat-row">
        <div className="pp-stat-tile"><span>Total agent orders</span><b>{data.totalAgentOrders}</b></div>
        <div className="pp-stat-tile"><span>Failed agent orders</span><b>{data.failedAgentOrders}</b></div>
        <div className="pp-stat-tile"><span>Agent failure rate</span><b className={data.agentFailureRate > 50 ? "is-red" : undefined}>{Math.round(data.agentFailureRate)}%</b></div>
        <div className="pp-stat-tile"><span>Cases created from agent failures</span><b>{data.casesCreated}</b></div>
      </div>
      <div className="pp-insight-table-wrap">
        <table className="pp-insight-table">
          <thead>
            <tr><th scope="col">Merchant</th><th scope="col">Agent orders</th><th scope="col">Failed</th><th scope="col">Failure rate</th><th scope="col">Open cases</th></tr>
          </thead>
          <tbody>
            {data.merchantBreakdown.map((merchant) => <tr key={merchant.merchantId}>
              <th scope="row">{merchant.merchantName}</th>
              <td>{merchant.total}</td>
              <td>{merchant.failed}</td>
              <td className={failureTone(merchant.failureRate)}>{Math.round(merchant.failureRate)}%</td>
              <td>{merchant.openCases}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </> : <InsightEmpty>No agent checkouts in the last 48 hours · Use the connector endpoint to simulate agent commerce</InsightEmpty>}
    </div>}
  </section>;
}

function CasePressurePanel() {
  const { data, error, loading } = usePolledJson("/api/admin/case-pressure", emptyCasePressure);

  return <section className="pp-panel pp-insight-panel" aria-labelledby="pp-case-pressure-title" aria-busy={loading}>
    <InsightHead
      id="pp-case-pressure-title"
      title="Case resolution pressure"
      sub="Open case age by merchant · unresolved cases accumulate disputes"
    />
    {error ? <p className="pp-insight-error" role="alert">{error}</p> : <div className="pp-insight-body is-pressure">
      {loading ? <CasePressureSkeleton /> : data.totalOpenCases ? <>
      <p className="pp-pressure-total"><b>{data.totalOpenCases}</b> total open cases across all merchants</p>
      <div className="pp-pressure-list">
        <div className="pp-pressure-row pp-pressure-head" aria-hidden="true">
          <span>Merchant</span><span>Open cases</span><span>Oldest case</span><span>Human cases needing action</span>
        </div>
        {data.merchants.map((merchant) => <div className="pp-pressure-row" key={merchant.merchantId}>
          <span className="pp-pressure-merchant">{merchant.merchantName}</span>
          <span><b className={`pp-case-pill ${openCaseTone(merchant.openCases)}`}>{merchant.openCases}</b></span>
          <span className={`pp-case-age ${caseAgeTone(merchant.oldestCaseAgeHours)}`}>{merchant.oldestCaseAgeHours} {merchant.oldestCaseAgeHours === 1 ? "hour" : "hours"}</span>
          <span className="pp-pressure-human">{merchant.humanCasesNeedingAction}</span>
        </div>)}
      </div>
    </> : <InsightEmpty>No open cases · all merchant cases resolved</InsightEmpty>}
    </div>}
  </section>;
}

function CrossMerchantPanel() {
  return <section className="pp-panel pp-insight-panel" aria-labelledby="pp-cross-merchant-title">
    <InsightHead
      id="pp-cross-merchant-title"
      title="Cross-merchant signals"
      sub="Same card or agent channel failing across multiple merchants · M13A"
      badge="COMING IN M13A"
    />
    <div className="pp-insight-empty-block">
      <p className="pp-insight-empty"><span aria-hidden="true">○</span><span>No cross-merchant signals detected</span></p>
      <p className="pp-insight-empty-copy">Run a network incident simulation across 3 or more merchants to generate a cross-merchant signal. Cross-merchant detection (M13A) will surface shared card or channel patterns here automatically once implemented.</p>
    </div>
  </section>;
}

function StudioPlaceholder() {
  return <section className="pp-studio-placeholder" aria-labelledby="pp-studio-title">
    <span className="pp-insight-badge pp-studio-badge">M18</span>
    <h2 id="pp-studio-title">Network analytics dashboard</h2>
    <p className="pp-studio-sub">AG Studio embedded dashboard · coming in M18</p>
    <p className="pp-studio-copy">AG Studio dashboard will be embedded here in M18. Self-serve charts, cross-filtering, and natural language widget generation powered by the Studio Agent Framework.</p>
  </section>;
}

export default function AdminNetworkPage() {
  const signOut = useCallback(async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) return;
    window.location.replace("/login");
  }, []);

  return (
    <main className="pp-shell pp-network-shell">
      <SectionRail />
      <div className="pp-app">
        <DashboardHeader onSignOut={signOut} />
        <div className="pp-workspace pp-network-workspace">
          <div className="pp-content">
            <section className="pp-screen pp-network-screen" aria-labelledby="pp-network-page-title">
              <div className="pp-hero">
                <div className="pp-title">
                  <h1 id="pp-network-page-title">Network Health</h1>
                </div>
              </div>
              <div className="pp-network-live-link-row">
                <p>Inspect the latest payment as soon as its capture is recorded.</p>
                <Link href="/admin/live-transaction" className="pp-network-live-link">Open Live Transaction <span aria-hidden="true">↗</span></Link>
              </div>
              <Incidents />
              <LatestDiagnosis />
              <CheckoutOriginPanel />
              <AgentCommercePanel />
              <CasePressurePanel />
              <CrossMerchantPanel />
              <StudioPlaceholder />
              <AgentActions variant="panel" />
              <MerchantHealthSummary />
            </section>
            <footer className="pp-footer">
              <span>DEMO LEDGER · NEON-POSTGRES</span>
              <span>PAYPROOF NETWORK ADMIN</span>
              <span>FICTIONAL PAYMENT AND CUSTOMER DATA</span>
            </footer>
          </div>
        </div>
      </div>
    </main>
  );
}
