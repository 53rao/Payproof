"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { products } from "@/lib/products";
import "./activity.css";

type OrderItem = { id: string; quantity: number };

type ActivityOrder = {
  id: string;
  amount: number;
  status: string;
  createdAt: string;
  origin: "HUMAN" | "AGENT" | "UNKNOWN";
  transactionId?: string;
  issue?: string;
  debug_id?: string;
  items: OrderItem[];
  case?: { id: string; status: string; issue?: string };
};

import { PRODUCT_TO_MERCHANT_NAME } from "@/lib/merchants";

const merchantMap: Record<string, string> = PRODUCT_TO_MERCHANT_NAME;

function getMerchantName(items: OrderItem[]): string {
  if (!items || items.length === 0) return "Unknown Merchant";
  const names = [...new Set(items.map((i) => merchantMap[i.id]).filter(Boolean))];
  if (names.length === 1) return names[0];
  if (names.length > 1) return "Multiple Merchants";
  return "Unknown Merchant";
}

function getProductSummary(items: OrderItem[]): string {
  if (!items || items.length === 0) return "General order";
  return items
    .map((item) => {
      const p = products.find((prod) => prod.id === item.id);
      const name = p?.name ?? item.id;
      return item.quantity > 1 ? `${name} × ${item.quantity}` : name;
    })
    .join(", ");
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

const PAGE_SIZE = 15;

export default function OrderActivityClient() {
  const [orders, setOrders] = useState<ActivityOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [merchantFilter, setMerchantFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [originFilter, setOriginFilter] = useState("ALL");
  const [sortBy, setSortBy] = useState<"NEWEST" | "OLDEST" | "AMOUNT_DESC" | "AMOUNT_ASC">("NEWEST");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/admin/activity", { cache: "no-store" });
      if (res.status === 401) {
        window.location.replace("/login?next=%2Fadmin%2Factivity");
        return;
      }
      if (!res.ok) throw new Error("Could not load order activity.");
      const data = await res.json();
      setOrders(Array.isArray(data.orders) ? data.orders : []);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load order activity.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  const copyToClipboard = useCallback(async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((curr) => (curr === id ? null : curr)), 2000);
    } catch {
      // Fallback
    }
  }, []);

  const filteredOrders = useMemo(() => {
    let result = orders.filter((order) => {
      const merchant = getMerchantName(order.items);
      if (merchantFilter !== "ALL" && merchant !== merchantFilter) return false;
      if (statusFilter !== "ALL" && order.status !== statusFilter) return false;
      if (originFilter !== "ALL" && order.origin !== originFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const summary = getProductSummary(order.items).toLowerCase();
        const matchesId = order.id.toLowerCase().includes(q);
        const matchesTx = order.transactionId?.toLowerCase().includes(q) ?? false;
        const matchesIssue = order.issue?.toLowerCase().includes(q) ?? false;
        const matchesMerchant = merchant.toLowerCase().includes(q);
        const matchesSummary = summary.includes(q);
        if (!matchesId && !matchesTx && !matchesIssue && !matchesMerchant && !matchesSummary) {
          return false;
        }
      }
      return true;
    });

    result.sort((a, b) => {
      if (sortBy === "NEWEST") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "OLDEST") return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      if (sortBy === "AMOUNT_DESC") return b.amount - a.amount;
      if (sortBy === "AMOUNT_ASC") return a.amount - b.amount;
      return 0;
    });

    return result;
  }, [orders, merchantFilter, statusFilter, originFilter, search, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, currentPage]);

  const metrics = useMemo(() => {
    const total = orders.length;
    const paid = orders.filter((o) => o.status === "PAID" || o.status === "COMPLETED").length;
    const failed = orders.filter((o) => o.status === "FAILED").length;
    const pending = orders.filter((o) => o.status === "PENDING" || o.status === "PROCESSING").length;
    return { total, paid, failed, pending };
  }, [orders]);

  const hasActiveFilters = search.trim() !== "" || merchantFilter !== "ALL" || statusFilter !== "ALL" || originFilter !== "ALL";

  function resetFilters() {
    setSearch("");
    setMerchantFilter("ALL");
    setStatusFilter("ALL");
    setOriginFilter("ALL");
    setPage(1);
  }

  return (
    <main className="pp-activity-shell">
      <header className="pp-activity-top">
        <Link href="/admin" className="pp-activity-brand">
          <span className="pp-activity-brand-mark">p.</span>
          <span className="pp-activity-brand-name">PayProof</span>
        </Link>
        <div className="pp-activity-top-right">
          <span className="pp-activity-badge">Braintree Sandbox (Simulated)</span>
          <Link href="/admin" className="pp-activity-back">
            ← Back to Dashboard
          </Link>
        </div>
      </header>

      <div className="pp-activity-container">
        <nav className="pp-activity-breadcrumb">
          <Link href="/admin">Platform Admin</Link>
          <span>/</span>
          <b>Order activity</b>
        </nav>

        <section className="pp-activity-hero">
          <div>
            <h1>Order activity</h1>
            <p>Recorded checkout and payment events for the current workspace · Braintree Sandbox</p>
          </div>
          <div className="pp-activity-stats">
            <div className="pp-activity-stat">
              <span>Total orders</span>
              <strong>{metrics.total}</strong>
            </div>
            <div className="pp-activity-stat paid">
              <span>Successful</span>
              <strong>{metrics.paid}</strong>
            </div>
            <div className="pp-activity-stat failed">
              <span>Failed</span>
              <strong>{metrics.failed}</strong>
            </div>
            {metrics.pending > 0 && (
              <div className="pp-activity-stat">
                <span>Pending</span>
                <strong>{metrics.pending}</strong>
              </div>
            )}
          </div>
        </section>

        {error && (
          <div className="pp-activity-empty" role="alert">
            <b>Could not load order activity</b>
            <p>{error}</p>
            <button type="button" className="pp-activity-page-btn" onClick={() => void fetchOrders()}>
              Retry
            </button>
          </div>
        )}

        <section className="pp-activity-controls">
          <div className="pp-activity-search">
            <svg className="pp-activity-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              type="text"
              placeholder="Search by order ID, item, or issue..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              aria-label="Search order activity"
            />
            {search && (
              <button
                type="button"
                className="pp-activity-search-clear"
                onClick={() => {
                  setSearch("");
                  setPage(1);
                }}
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="pp-activity-filters">
            <select
              className="pp-activity-select"
              value={merchantFilter}
              onChange={(e) => {
                setMerchantFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by merchant"
            >
              <option value="ALL">All merchants</option>
              <option value="Northstar Goods">Northstar Goods</option>
              <option value="Field & Form">Field & Form</option>
            </select>

            <select
              className="pp-activity-select"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by status"
            >
              <option value="ALL">All outcomes</option>
              <option value="PAID">Paid / Successful</option>
              <option value="FAILED">Failed</option>
              <option value="PENDING">Pending</option>
            </select>

            <select
              className="pp-activity-select"
              value={originFilter}
              onChange={(e) => {
                setOriginFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by checkout origin"
            >
              <option value="ALL">All origins</option>
              <option value="HUMAN">Human checkout</option>
              <option value="AGENT">Agent checkout</option>
              <option value="UNKNOWN">Unknown origin</option>
            </select>

            <select
              className="pp-activity-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
              aria-label="Sort orders"
            >
              <option value="NEWEST">Newest first</option>
              <option value="OLDEST">Oldest first</option>
              <option value="AMOUNT_DESC">Highest amount</option>
              <option value="AMOUNT_ASC">Lowest amount</option>
            </select>

            {hasActiveFilters && (
              <button type="button" className="pp-activity-reset-btn" onClick={resetFilters}>
                Reset filters
              </button>
            )}
          </div>
        </section>

        <section className="pp-activity-card">
          {loading ? (
            <div className="pp-activity-loading">
              <div className="pp-activity-dots">
                <i />
                <i />
                <i />
              </div>
              <span>Loading order and payment events...</span>
            </div>
          ) : paginatedOrders.length === 0 ? (
            <div className="pp-activity-empty">
              <b>No matching order activity found</b>
              <p>Try adjusting your search query or removing active filters.</p>
              {hasActiveFilters && (
                <button type="button" className="pp-activity-page-btn" onClick={resetFilters}>
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <div className="pp-activity-table-wrap">
              <table className="pp-activity-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Merchant</th>
                    <th>Order & Transaction ID</th>
                    <th>Product / Order summary</th>
                    <th>Origin</th>
                    <th>Outcome</th>
                    <th>Amount</th>
                    <th>Case status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedOrders.map((order) => {
                    const merchantName = getMerchantName(order.items);
                    const productSummary = getProductSummary(order.items);
                    const originKey = (order.origin || "UNKNOWN").toLowerCase();
                    const statusKey = order.status.toLowerCase();
                    const isCopied = copiedId === order.id;

                    return (
                      <tr key={order.id}>
                        <td>
                          <time className="pp-activity-time" dateTime={order.createdAt}>
                            {formatDate(order.createdAt)}
                          </time>
                        </td>
                        <td>
                          <span className="pp-activity-merchant">{merchantName}</span>
                        </td>
                        <td>
                          <div className="pp-activity-id-col">
                            <span className="pp-activity-id" title={order.id}>
                              {order.id.length > 20 ? `${order.id.slice(0, 14)}…` : order.id}
                            </span>
                            <button
                              type="button"
                              className={`pp-activity-copy-btn ${isCopied ? "copied" : ""}`}
                              onClick={() => void copyToClipboard(order.id, order.id)}
                              title={isCopied ? "Copied!" : "Copy Order ID"}
                              aria-label={isCopied ? "Copied" : `Copy order ${order.id}`}
                            >
                              {isCopied ? (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              ) : (
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                                  <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                                </svg>
                              )}
                            </button>
                          </div>
                          {order.transactionId && (
                            <small className="pp-activity-time" style={{ display: "block", marginTop: "2px" }}>
                              TX: {order.transactionId}
                            </small>
                          )}
                        </td>
                        <td>
                          <div className="pp-activity-items" title={productSummary}>
                            {productSummary}
                          </div>
                        </td>
                        <td>
                          <span className={`pp-activity-origin ${originKey}`}>
                            {order.origin === "AGENT" ? "Agent" : order.origin === "HUMAN" ? "Human" : "Unknown"}
                          </span>
                        </td>
                        <td>
                          <div className="pp-activity-status-col">
                            <span className={`pp-activity-pill ${statusKey}`}>
                              {order.status}
                            </span>
                            {order.issue && (
                              <span className="pp-activity-issue" title={order.issue}>
                                {order.issue.replaceAll("_", " ")}
                              </span>
                            )}
                          </div>
                        </td>
                        <td>
                          <span className="pp-activity-amount">{formatMoney(order.amount)}</span>
                        </td>
                        <td>
                          {order.case ? (
                            <Link href={`/owner/cases?caseId=${encodeURIComponent(order.case.id)}`} className="pp-activity-case-link">
                              Review {order.case.id} →
                            </Link>
                          ) : (
                            <span className="pp-activity-no-case">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {!loading && paginatedOrders.length > 0 && (
            <footer className="pp-activity-foot">
              <span>
                Showing {(currentPage - 1) * PAGE_SIZE + 1} - {Math.min(currentPage * PAGE_SIZE, filteredOrders.length)} of {filteredOrders.length} orders
              </span>
              <div className="pp-activity-page-nav">
                <button
                  type="button"
                  className="pp-activity-page-btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                >
                  Previous
                </button>
                <span>
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  className="pp-activity-page-btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                >
                  Next
                </button>
              </div>
            </footer>
          )}
        </section>
      </div>
    </main>
  );
}
