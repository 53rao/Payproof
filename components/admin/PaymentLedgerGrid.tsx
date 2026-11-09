"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AgGridProvider, AgGridReact } from "ag-grid-react";
import {
  AllCommunityModule,
  themeQuartz,
  type ColDef,
  type GridApi,
  type GridReadyEvent,
  type GridSizeChangedEvent,
} from "ag-grid-community";
import { PRODUCT_TO_MERCHANT_NAME } from "@/lib/merchants";
import { money } from "./format";
import { Icon } from "./Icon";

type OrderItem = { id: string; quantity: number };
export type ActivityOrder = {
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

type LedgerRow = ActivityOrder & { merchant: string; itemSummary: string };

const modules = [AllCommunityModule];
const payproofGridTheme = themeQuartz.withParams({
  backgroundColor: "#ffffff",
  foregroundColor: "#17243b",
  accentColor: "#ef4d1a",
  borderColor: "#ded9cf",
  headerBackgroundColor: "#f1eee6",
  oddRowBackgroundColor: "#faf9f6",
  fontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: 12,
  borderRadius: 8,
  spacing: 8,
});

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
});

function StatusCell({ value }: { value?: string }) {
  const status = (value ?? "UNKNOWN").toUpperCase();
  return <span className={`pp-ledger-status is-${status.toLowerCase()}`}>{status}</span>;
}

function OriginCell({ value }: { value?: string }) {
  const origin = value === "HUMAN" || value === "AGENT" ? value : "UNKNOWN";
  return <span className={`pp-ledger-origin is-${origin.toLowerCase()}`}>{origin === "UNKNOWN" ? "Unconfirmed" : origin === "AGENT" ? "Agent" : "Human"}</span>;
}

function CaseCell({ data }: { data?: LedgerRow }) {
  return data?.case ? <Link className="pp-ledger-case-link" href="/admin/cases">Review case</Link> : <span className="pp-ledger-unavailable">—</span>;
}

export function PaymentLedgerGrid({ rows, loading, error }: { rows: ActivityOrder[]; loading: boolean; error: string }) {
  const apiRef = useRef<GridApi<LedgerRow> | null>(null);
  const [search, setSearch] = useState("");
  const rowData = useMemo<LedgerRow[]>(() => rows.map((order) => {
    const merchantNames = [...new Set(order.items.map((item) => PRODUCT_TO_MERCHANT_NAME[item.id]).filter(Boolean))];
    const productLabel = order.items.map((item) => `${item.id}${item.quantity > 1 ? ` × ${item.quantity}` : ""}`).join(", ");
    return {
      ...order,
      merchant: merchantNames.length === 1 ? merchantNames[0] : merchantNames.length > 1 ? "Multiple merchants" : "Unknown merchant",
      itemSummary: productLabel || "General order",
    };
  }), [rows]);

  const columnDefs = useMemo<ColDef<LedgerRow>[]>(() => [
    { field: "createdAt", headerName: "Date", minWidth: 145, flex: 1, sort: "desc", valueFormatter: (params) => params.value ? dateFormat.format(new Date(params.value)) : "—" },
    { field: "id", headerName: "Order ID", minWidth: 165, flex: 1.15, cellClass: "pp-ledger-id", tooltipField: "id" },
    { field: "merchant", headerName: "Merchant", minWidth: 140, flex: 1 },
    { field: "itemSummary", headerName: "Items", minWidth: 130, flex: 1.1, tooltipField: "itemSummary" },
    { field: "amount", headerName: "Amount", minWidth: 100, flex: 0.62, valueFormatter: (params) => money(Number(params.value ?? 0)) },
    { field: "status", headerName: "Outcome", minWidth: 105, flex: 0.74, cellRenderer: StatusCell },
    { field: "origin", headerName: "Origin", minWidth: 100, flex: 0.65, cellRenderer: OriginCell },
    { field: "issue", headerName: "Payment signal", minWidth: 145, flex: 1, valueFormatter: (params) => params.value || "No issue reported", tooltipField: "issue" },
    { colId: "case", headerName: "Case", minWidth: 86, flex: 0.66, sortable: false, filter: false, cellRenderer: CaseCell },
  ], []);

  const defaultColDef = useMemo<ColDef<LedgerRow>>(() => ({ sortable: true, filter: true, resizable: true, suppressHeaderMenuButton: true }), []);
  const onGridReady = useCallback((event: GridReadyEvent<LedgerRow>) => { apiRef.current = event.api; }, []);
  const onGridSizeChanged = useCallback((event: GridSizeChangedEvent<LedgerRow>) => {
    const width = event.clientWidth;
    const hideItems = width < 1150;
    const hideSecondary = width < 1040;
    const hideDate = width < 760;
    event.api.setColumnsVisible(["itemSummary"], !hideItems);
    event.api.setColumnsVisible(["origin", "case"], !hideSecondary);
    event.api.setColumnsVisible(["createdAt"], !hideDate);
  }, []);
  const clearFilters = useCallback(() => {
    setSearch("");
    apiRef.current?.setFilterModel(null);
  }, []);
  const exportCsv = useCallback(() => {
    apiRef.current?.exportDataAsCsv({ fileName: "payproof-payment-activity.csv" });
  }, []);

  return <article className="pp-panel pp-admin-ledger" aria-label="Payment activity ledger">
    <div className="pp-admin-ledger-toolbar">
      <label className="pp-ledger-search">
        <span className="pp-ledger-search-icon" aria-hidden="true"><Icon name="search"/></span>
        <input aria-label="Search payment activity" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search orders, merchants, issues…" />
      </label>
      <div className="pp-ledger-actions">
        <button type="button" className="pp-ledger-secondary" onClick={clearFilters}>Clear filters</button>
        <button type="button" className="pp-ledger-export" onClick={exportCsv} disabled={!rowData.length || loading}>Export CSV</button>
      </div>
    </div>
    {error ? <div className="pp-admin-data-error" role="alert">{error}</div> : <div className="pp-admin-grid-wrap" aria-busy={loading}>
      <AgGridProvider modules={modules}>
        <AgGridReact<LedgerRow>
          theme={payproofGridTheme}
          rowData={rowData}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          quickFilterText={search}
          loading={loading}
          pagination
          paginationPageSize={15}
          animateRows={false}
          rowHeight={42}
          headerHeight={42}
          suppressCellFocus={false}
          getRowId={(params) => params.data.id}
          onGridReady={onGridReady}
          onGridSizeChanged={onGridSizeChanged}
          overlayNoRowsTemplate="<span class='pp-grid-empty'>No payment records match this search.</span>"
        />
      </AgGridProvider>
    </div>}
    <footer className="pp-admin-ledger-foot"><span>Showing the latest {rowData.length} available records · order activity is capped at 150 persisted orders.</span><Link href="/admin/activity">Open order activity <span aria-hidden="true">↗</span></Link></footer>
  </article>;
}
