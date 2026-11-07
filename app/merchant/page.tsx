"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import "./merchant.css";

type OpenCase = {
  id: string;
  orderId: string;
  status: string;
  type: string;
  cause?: string;
  productName: string;
  origin: "HUMAN" | "AGENT" | "UNKNOWN";
  amount: number;
  createdAt: string;
  needsAction: boolean;
};

type IncidentAlert = {
  id: string;
  type: string;
  summary: string;
  detail: string;
  confidence: string;
  detectedAt: string;
};

type DashboardData = {
  merchant: {
    id: string;
    name: string;
    email: string;
  };
  summary: {
    totalOrders: number;
    failedOrders: number;
    failureRate: number;
  };
  cases: OpenCase[];
  casesNeedingActionCount: number;
  incidents: IncidentAlert[];
};

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

export default function MerchantDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/merchant/dashboard", { cache: "no-store" });
      if (res.status === 401) {
        window.location.replace("/merchant/login");
        return;
      }
      if (!res.ok) throw new Error("Could not load merchant dashboard.");
      const json = await res.json();
      setData(json);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 15_000);
    return () => clearInterval(timer);
  }, [refresh]);

  async function handleSignOut() {
    try {
      await fetch("/api/merchant/auth", { method: "DELETE" });
      window.location.replace("/merchant/login");
    } catch {
      window.location.replace("/merchant/login");
    }
  }

  if (loading && !data) {
    return (
      <main className="pp-merchant-shell">
        <div className="pp-merchant-topbar">
          <div className="pp-merchant-brand">
            <span className="pp-merchant-mark">p.</span>
            <div className="pp-merchant-info">
              <span className="pp-merchant-name">Merchant Desk</span>
            </div>
          </div>
        </div>
        <div className="pp-merchant-container">
          <p className="pp-merchant-empty">Loading merchant store data…</p>
        </div>
      </main>
    );
  }

  const merchant = data?.merchant;
  const summary = data?.summary ?? { totalOrders: 0, failedOrders: 0, failureRate: 0 };
  const cases = data?.cases ?? [];
  const incidents = data?.incidents ?? [];
  const actionCount = data?.casesNeedingActionCount ?? 0;

  return (
    <main className="pp-merchant-shell">
      {/* 1. Merchant Header */}
      <header className="pp-merchant-topbar">
        <div className="pp-merchant-brand">
          <span className="pp-merchant-mark">p.</span>
          <div className="pp-merchant-info">
            <div className="pp-merchant-name-wrap">
              <h1 className="pp-merchant-name">{merchant?.name ?? "Merchant Store"}</h1>
              <span className="pp-merchant-id-badge">{merchant?.id}</span>
            </div>
            <span className="pp-merchant-powered">Powered by PayProof Network</span>
          </div>
        </div>
        <div className="pp-merchant-top-right">
          <button type="button" className="pp-merchant-signout" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>

      <div className="pp-merchant-container">
        {error && <p className="pp-merchant-empty" role="alert" style={{ color: "var(--pp-red)" }}>{error}</p>}

        {/* 2. Payment Summary */}
        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading" className="sr-only">Payment Summary</h2>
          <div className="pp-merchant-summary-grid">
            <div className="pp-merchant-metric-card">
              <span>Total orders</span>
              <strong>{summary.totalOrders}</strong>
              <p>Scoped to {merchant?.name} catalog products</p>
            </div>
            <div className="pp-merchant-metric-card failed">
              <span>Failed checkouts</span>
              <strong>{summary.failedOrders}</strong>
              <p>Payment rejections recorded</p>
            </div>
            <div className="pp-merchant-metric-card rate">
              <span>Failure rate</span>
              <strong>{summary.failureRate}%</strong>
              <p>Relative to recorded order attempts</p>
            </div>
          </div>
        </section>

        {/* 3. Open Cases */}
        <section className="pp-merchant-section" aria-labelledby="cases-heading">
          <div className="pp-merchant-section-head">
            <div>
              <h2 id="cases-heading">Open cases</h2>
              <p>Customer inquiries and payment disputes requiring review</p>
            </div>
            {actionCount > 0 && (
              <span className="pp-merchant-action-callout">
                {actionCount} {actionCount === 1 ? "case needs" : "cases need"} action
              </span>
            )}
          </div>
          {cases.length === 0 ? (
            <p className="pp-merchant-empty">No open cases for {merchant?.name}.</p>
          ) : (
            <div className="pp-merchant-table-wrap">
              <table className="pp-merchant-table">
                <thead>
                  <tr>
                    <th>Case ID</th>
                    <th>Product</th>
                    <th>Checkout origin</th>
                    <th>Status</th>
                    <th>Amount</th>
                    <th>Created</th>
                    <th>Workspace</th>
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <span className="pp-merchant-case-id">{c.id}</span>
                      </td>
                      <td>
                        <strong>{c.productName}</strong>
                      </td>
                      <td>
                        <span className={`pp-merchant-origin ${c.origin.toLowerCase()}`}>
                          {c.origin === "AGENT" ? "Agent" : c.origin === "HUMAN" ? "Human" : "Unknown"}
                        </span>
                      </td>
                      <td>
                        <span className="pp-merchant-pill open">{c.status}</span>
                      </td>
                      <td>
                        <strong>{formatMoney(c.amount)}</strong>
                      </td>
                      <td>
                        <span style={{ color: "var(--pp-subtle)" }}>{formatDate(c.createdAt)}</span>
                      </td>
                      <td>
                        <Link
                          href={`/owner/cases?caseId=${encodeURIComponent(c.id)}&merchantId=${encodeURIComponent(merchant?.id ?? "")}`}
                          className="pp-merchant-case-link"
                        >
                          Open case modal →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 4. Incident Alerts */}
        <section className="pp-merchant-section" aria-labelledby="incidents-heading">
          <div className="pp-merchant-section-head">
            <div>
              <h2 id="incidents-heading">Incident alerts</h2>
              <p>Active anomaly detections scoped to your merchant checkout activity</p>
            </div>
          </div>
          {incidents.length === 0 ? (
            <p className="pp-merchant-empty">No active incidents detected for {merchant?.name}.</p>
          ) : (
            <div className="pp-merchant-incidents-list">
              {incidents.map((incident) => (
                <div key={incident.id} className="pp-merchant-incident-row">
                  <div className="pp-merchant-incident-top">
                    <span className="pp-merchant-incident-type">
                      {incident.type.replaceAll("_", " ")}
                    </span>
                    <time className="pp-merchant-incident-time" dateTime={incident.detectedAt}>
                      Detected {formatDate(incident.detectedAt)}
                    </time>
                  </div>
                  <p className="pp-merchant-incident-summary">{incident.summary}</p>
                  <span className="pp-merchant-incident-notice">
                    Your platform administrator has been notified
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 5. Demo Merchant Email Notice */}
        <footer className="pp-merchant-demo-notice">
          This is a PayProof Network demo merchant account. Data is fictional. Merchant email:{" "}
          <code>{merchant?.email ?? "unconfigured@payproof.demo"}</code>
        </footer>
      </div>
    </main>
  );
}
