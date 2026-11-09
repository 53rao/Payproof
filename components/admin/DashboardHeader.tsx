"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { memo, useCallback, useEffect, useState } from "react";

export const DashboardHeader = memo(function DashboardHeader({ onSignOut }: { onSignOut: () => void }) {
  const pathname = usePathname();
  const isMerchantDesk = pathname === "/admin";
  const isNetworkHealth = pathname === "/admin/network" || pathname === "/admin/live-transaction";
  const isCases = pathname === "/admin/cases";
  const [incidentCount, setIncidentCount] = useState(0);

  const refreshIncidents = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/incidents", { cache: "no-store" });
      if (!response.ok) return;
      const body = await response.json();
      setIncidentCount(Array.isArray(body) ? body.length : 0);
    } catch {
      // Non-blocking nav badge.
    }
  }, []);

  useEffect(() => {
    void refreshIncidents();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refreshIncidents();
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [refreshIncidents]);

  return <header className="pp-topbar"><div className="pp-brand-line"><Link href="/" className="pp-wordmark">PayProof</Link><span className="pp-divider"/><Link href="/admin" className={`pp-nav-link${isMerchantDesk ? " is-active" : ""}`} aria-current={isMerchantDesk ? "page" : undefined}>Merchant Desk</Link><span className="pp-divider"/><Link href="/admin/network" className={`pp-nav-link pp-network-link${isNetworkHealth ? " is-active" : ""}`} aria-current={isNetworkHealth ? "page" : undefined}>Network Health{incidentCount > 0 && <span className="pp-nav-dot" aria-label={`${incidentCount} active incidents`}>{incidentCount >= 10 ? "9+" : incidentCount}</span>}</Link><span className="pp-divider"/><Link href="/admin/cases" className={`pp-nav-link${isCases ? " is-active" : ""}`} aria-current={isCases ? "page" : undefined}>Cases</Link></div><div className="pp-top-actions"><button type="button" className="pp-signout" onClick={onSignOut}>Sign out</button><span className="pp-user">S</span></div></header>;
});
