"use client";

import { useMemo } from "react";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import {
  studioTheme,
  type AgDataSourcesDefinition,
  type AgFieldDefinition,
  type AgReportState,
} from "ag-studio";
import type { ActivityOrder } from "./PaymentLedgerGrid";
import { PRODUCT_TO_MERCHANT_NAME } from "@/lib/merchants";

type StudioOrder = {
  orderId: string;
  merchant: string;
  amount: number;
  status: string;
  origin: string;
  issue: string;
  caseStatus: string;
  createdAt: string;
  activityDate: string;
  failureFlag: number;
};

const fields: AgFieldDefinition[] = [
  { id: "orderId", name: "Order ID", format: "textFormat", cardinality: "high", notBlank: true },
  { id: "merchant", name: "Merchant", format: "textFormat" },
  { id: "amount", name: "Amount", format: "currencyFormat" },
  { id: "status", name: "Payment outcome", format: "textFormat" },
  { id: "origin", name: "Checkout origin", format: "textFormat" },
  { id: "issue", name: "Payment signal", format: "textFormat" },
  { id: "caseStatus", name: "Case status", format: "textFormat" },
  { id: "createdAt", name: "Order date", format: "dateTimeFormat" },
  { id: "activityDate", name: "Activity day", format: "textFormat" },
  { id: "failureFlag", name: "Failure rate contribution", format: "percentageFormat" },
];

const starterReport: AgReportState = {
  pages: [{
    id: "payment-overview",
    widgets: {
      "order-count": {
        type: "value",
        dataMapping: { value: [{ id: "orders.orderId", aggregation: "countd" }] },
        format: { title: { enabled: true, text: "Orders in view" } },
      },
      "failure-rate": {
        type: "value",
        dataMapping: { value: [{ id: "orders.failureFlag", aggregation: "avg" }] },
        format: { title: { enabled: true, text: "Failed checkout rate" } },
      },
      "orders-by-merchant": {
        type: "bar-chart-grouped",
        dataMapping: {
          categoryKey: [{ id: "orders.merchant" }],
          valueKey: [{ id: "orders.orderId", aggregation: "countd" }],
          tooltipKey: [],
        },
        format: { title: { enabled: true, text: "Orders by merchant" } },
      },
      "outcomes-by-status": {
        type: "column-chart-grouped",
        dataMapping: {
          categoryKey: [{ id: "orders.status" }],
          valueKey: [{ id: "orders.orderId", aggregation: "countd" }],
          tooltipKey: [],
        },
        format: { title: { enabled: true, text: "Payment outcomes" } },
      },
      "orders-over-time": {
        type: "line-chart",
        dataMapping: {
          categoryKey: [{ id: "orders.activityDate" }],
          valueKey: [{ id: "orders.orderId", aggregation: "countd" }],
          tooltipKey: [],
        },
        format: { title: { enabled: true, text: "Daily payment activity" } },
      },
      "payment-records": {
        type: "grid",
        dataMapping: {
          cols: [
            { id: "orders.createdAt" },
            { id: "orders.orderId" },
            { id: "orders.merchant" },
            { id: "orders.amount", aggregation: "sum" },
            { id: "orders.status" },
            { id: "orders.origin" },
            { id: "orders.caseStatus" },
          ],
        },
        format: { title: { enabled: true, text: "Payment records" } },
      },
    },
    widgetLayout: {
      "order-count": { xTrack: 0, yTrack: 0, xSpan: 12, ySpan: 6 },
      "failure-rate": { xTrack: 12, yTrack: 0, xSpan: 12, ySpan: 6 },
      "orders-by-merchant": { xTrack: 0, yTrack: 6, xSpan: 12, ySpan: 12 },
      "outcomes-by-status": { xTrack: 12, yTrack: 6, xSpan: 12, ySpan: 12 },
      "orders-over-time": { xTrack: 0, yTrack: 18, xSpan: 12, ySpan: 13 },
      "payment-records": { xTrack: 12, yTrack: 18, xSpan: 12, ySpan: 13 },
    },
  }],
  selectedPageId: "payment-overview",
  panels: {
    filters: { collapsed: true },
    edit: { collapsed: true },
    data: { collapsed: true },
  },
};

const payproofStudioTheme = studioTheme.withParams({
  accentColor: "#ef4d1a",
  backgroundColor: "#ffffff",
  foregroundColor: "#17243b",
  borderColor: "#ded9cf",
  fontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, sans-serif",
  fontSize: 13,
  spacing: 8,
  studioWrapperBorderRadius: 12,
  studioCanvasRowHeight: 14,
  studioCanvasPadding: 10,
  studioPanelContainerBackgroundColor: "#fbfaf7",
  studioCanvasBackgroundColor: "#f6f5f0",
  studioWidgetBackgroundColor: "#ffffff",
  studioWidgetPadding: 12,
  studioWidgetBorder: "1px solid #ded9cf",
  studioWidgetBorderRadius: 10,
  studioWidgetTitleFontFamily: "DM Sans, -apple-system, BlinkMacSystemFont, sans-serif",
  studioWidgetTitleFontSize: 16,
  studioWidgetTitleFontWeight: 650,
  studioWidgetTitleTextColor: "#17243b",
  studioValueWidgetFontSize: 23,
  gridHeaderBackgroundColor: "#f1eee6",
  gridDataBackgroundColor: "#ffffff",
  gridOddRowBackgroundColor: "#faf9f6",
  chartAccentColor: "#ef4d1a",
  chartTextColor: "#17243b",
  chartSubtleTextColor: "#5e6877",
  studioMinWidth: 0,
  studioMinHeight: 0,
  studioResponsiveMinWidth: 0,
  studioCanvasMinWidth: 0,
  studioCanvasHeight: 470,
});

const activityDayFormat = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric",
});

function toStudioRow(order: ActivityOrder): StudioOrder {
  const merchantNames = [...new Set(order.items.map((item) => PRODUCT_TO_MERCHANT_NAME[item.id]).filter(Boolean))];
  return {
    orderId: order.id,
    merchant: merchantNames.length === 1 ? merchantNames[0] : merchantNames.length > 1 ? "Multiple merchants" : "Unknown merchant",
    amount: order.amount,
    status: order.status,
    origin: order.origin === "HUMAN" || order.origin === "AGENT" ? order.origin : "UNKNOWN",
    issue: order.issue ?? "No issue reported",
    caseStatus: order.case?.status ?? "No case",
    createdAt: order.createdAt,
    activityDate: activityDayFormat.format(new Date(order.createdAt)),
    failureFlag: order.status === "FAILED" ? 1 : 0,
  };
}

export default function AdminAnalyticsCanvas({ rows }: { rows: ActivityOrder[] }) {
  const data = useMemo<AgDataSourcesDefinition>(() => ({
    description: "Recent fictional PayProof payment outcomes. Payment status is processor evidence and does not establish customer intent.",
    sources: [{
      id: "orders",
      name: "Payment activity",
      description: "Recent orders and payment outcomes across connected demo merchants.",
      data: rows.map(toStudioRow),
      fields,
    }],
  }), [rows]);

  return <div className="pp-admin-studio-shell">
    <div className="pp-studio-canvas">
      <AgStudioProvider licenseKey={process.env.NEXT_PUBLIC_AG_STUDIO_LICENSE_KEY}>
        <AgStudio
          data={data}
          theme={payproofStudioTheme}
          initialState={starterReport}
          mode="view"
          enableFilterEditingInViewMode
          style={{ width: "100%", height: "100%" }}
        />
      </AgStudioProvider>
    </div>
  </div>;
}
