"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

type Recovery = { caseId: string; orderId: string; status: string; total: number; items: { id: string; name: string; quantity: number; unitPrice: number }[]; expiresAt: string; simulated: true };
export default function RecoveryCheckout({ token }: { token: string }) {
  const [recovery, setRecovery] = useState<Recovery | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  useEffect(() => { let active = true; void fetch(`/api/recovery/${encodeURIComponent(token)}`, { cache: "no-store" }).then(async (response) => { const data = await response.json(); if (!response.ok) throw new Error(data.error ?? "This recovery link is unavailable."); if (active) setRecovery(data); }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "This recovery link is unavailable."); }); return () => { active = false; }; }, [token]);
  async function runCheckout(outcome: "success" | "decline") {
    if (busy || !recovery) return;
    setBusy(true); setError(""); setResult("");
    try {
      const create = await fetch(`/api/recovery/${encodeURIComponent(token)}`, { method: "POST" });
      const order = await create.json();
      if (!create.ok) throw new Error(order.error ?? "Could not start the recovery checkout.");
      const capture = await fetch("/api/checkout/capture", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId: order.id, outcome, reportedIssueType: "PAYMENT_DECLINED", reportedIssueDetails: outcome === "decline" ? "Customer-selected simulated recovery checkout outcome." : "" }) });
      const payment = await capture.json();
      if (!capture.ok) throw new Error(payment.error ?? "The simulated checkout could not be completed.");
      setResult(payment.payment.status === "COMPLETED" ? `Simulated order ${order.id} completed. It is attributed to the recovery of ${recovery.orderId}.` : `The recovery order ${order.id} has a simulated failed payment. No sale was recovered.`);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The simulated checkout could not be completed."); }
    finally { setBusy(false); }
  }
  return <main className="pp-recovery-page"><header className="pp-recovery-top"><Link href="/" className="pp-recovery-brand"><b>p.</b> PayProof</Link><span>SIMULATED CHECKOUT</span></header><section className="pp-recovery-card">{error && !recovery ? <><h1>This recovery link can’t be opened.</h1><p>{error}</p><Link href="/">Back to the demo store</Link></> : !recovery ? <><div className="pp-recovery-loading"><i/><i/><i/></div><p>Loading your checkout…</p></> : <><span className="pp-recovery-label">A new checkout · demo only</span><h1>Continue your order</h1><p className="pp-recovery-subtitle">The merchant prepared a fresh simulated checkout for the same items. No charge or payment retry has happened.</p><div className="pp-recovery-order"><div className="pp-recovery-order-head"><span>Original failed order</span><b>{recovery.orderId}</b></div>{recovery.items.map((item) => <div className="pp-recovery-item" key={item.id}><span><b>{item.name}</b><small>Quantity {item.quantity}</small></span><strong>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(item.quantity * item.unitPrice)}</strong></div>)}<div className="pp-recovery-total"><span>Order total</span><b>{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(recovery.total)}</b></div></div><p className="pp-recovery-disclaimer">This demo does not connect to PayPal or process real payments. Choose a simulated outcome to continue.</p><div className="pp-recovery-actions"><button type="button" onClick={() => void runCheckout("success")} disabled={busy}>{busy ? "Working…" : "Complete simulated checkout"}</button><button type="button" className="secondary" onClick={() => void runCheckout("decline")} disabled={busy}>Simulate another decline</button></div>{result && <p className="pp-recovery-result" role="status">{result}</p>}{error && <p className="pp-recovery-error" role="alert">{error}</p>}<Link className="pp-recovery-back" href="/">Return to demo store</Link></>}</section><footer>Fictional demo data · Nothing was sent to PayPal</footer></main>;
}
