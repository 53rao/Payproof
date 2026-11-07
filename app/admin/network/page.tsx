"use client";
import Link from "next/link";
import { useCallback } from "react";
import { SectionRail } from "@/components/admin/SectionRail";
import { DashboardHeader } from "@/components/admin/DashboardHeader";
import { Incidents } from "@/components/admin/Incidents";
import { LatestDiagnosis } from "@/components/admin/LatestDiagnosis";
import { AgentActions } from "@/components/admin/AgentActions";
import { MerchantHealthSummary } from "@/components/admin/MerchantHealthSummary";
import "../admin.css";
import "./network.css";

export default function AdminNetworkPage() {
  const signOut = useCallback(async () => {
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (!response.ok) return;
    window.location.replace("/login");
  }, []);

  return (
    <main className="pp-shell pp-network-shell">
      <SectionRail data={null} />
      <div className="pp-app">
        <DashboardHeader data={null} onSignOut={signOut} />
        <div className="pp-workspace pp-network-workspace">
          <div className="pp-content">
            <section className="pp-screen pp-network-screen" aria-labelledby="pp-network-page-title">
              <div className="pp-network-back">
                <Link href="/admin" className="pp-back-link">← Merchant Desk</Link>
              </div>
              <div className="pp-hero">
                <div className="pp-title">
                  <h1 id="pp-network-page-title">Network Health</h1>
                </div>
              </div>
              <Incidents />
              <LatestDiagnosis />
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
