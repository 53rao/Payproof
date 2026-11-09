import { memo } from "react";
import Link from "next/link";
import type { DemoState } from "./types";
import { Icon } from "./Icon";
import { MerchantCaseBreakdown } from "./MerchantCaseBreakdown";

export const OrderManagement = memo(function OrderManagement({ data, loading }: { data: DemoState | null; loading: boolean; totalOrders: number }) {
  const openCases = data?.counters.openCases ?? 0;
  return <article className="pp-assist pp-admin-case-activity" aria-labelledby="pp-admin-case-activity-title" aria-busy={loading && !data}>
    <div className="pp-assist-art" aria-hidden="true"><i/><i/><i/></div>
    <div className="pp-assist-content">
      <div className="pp-assist-brand"><span>PayProof</span><small>CASE REVIEW</small></div>
      <h3 id="pp-admin-case-activity-title">Case activity by merchant</h3>
      <p className="pp-admin-case-context">{loading && !data ? "Loading case counts…" : `${openCases} open ${openCases === 1 ? "case" : "cases"} across connected merchants`}</p>
      <MerchantCaseBreakdown/>
      <Link href="/admin/cases" className="pp-assist-link"><span><Icon name="arrow"/></span>Review open cases</Link>
    </div>
  </article>;
});
