"use client";
import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import "./customer-cases.css";

type Order = { id: string; amount: number; status: string; createdAt: string; items: { id: string; quantity: number }[] };
const complaintOptions = [
  ["ITEM_NOT_RECEIVED", "Item not received"],
  ["ITEM_DIFFERENT", "Item different from description"],
  ["PAYMENT_ISSUE", "Payment issue"],
  ["OTHER", "Other"],
];
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export default function ReportProblemPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [orderId, setOrderId] = useState("");
  const [type, setType] = useState("");
  const [originalText, setOriginalText] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState<{ caseId: string; orderId: string } | null>(null);

  useEffect(() => {
    let active = true;
    void fetch("/api/customer/orders", { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Orders could not be loaded.");
      if (active) { setOrders(data.orders ?? []); setOrderId(data.orders?.[0]?.id ?? ""); }
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "Orders could not be loaded."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/customer/complaints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ orderId, type, originalText }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Your report could not be saved.");
      setSubmitted({ caseId: data.complaint.caseId, orderId });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Your report could not be saved."); }
    finally { setBusy(false); }
  }

  const selected = orders.find((order) => order.id === orderId);
  return <main className="pp-customer-shell">
    <header className="pp-customer-nav"><Link href="/" className="pp-customer-brand"><span>p.</span> little things <small>SUPPLY CO.</small></Link><Link href="/#shop">Back to the store ↗</Link></header>
    <div className="pp-customer-wrap">
      <div className="pp-customer-heading"><span className="pp-customer-mark">↗</span><div><h1>Tell us what happened.</h1><p>We’ll attach your note to the order so the store team can review it.</p></div></div>
      {submitted ? <section className="pp-customer-confirm" aria-live="polite"><span className="pp-customer-confirm-icon">✓</span><h2>Your report is with the store.</h2><p>We saved your message exactly as you entered it for order <b>{submitted.orderId}</b>.</p><p className="pp-customer-confirm-ref">Case reference <b>{submitted.caseId}</b> · SIMULATED DEMO</p><Link href="/" className="pp-customer-button">Return to the store</Link></section> : <form className="pp-customer-form" onSubmit={submit}>
        <div className="pp-customer-form-title"><div><h2>Report a problem / request a return</h2><p>Your note is shared with the store owner for review.</p></div><span>SIMULATED STORE</span></div>
        <label htmlFor="complaint-order">Order</label>
        {loading ? <div className="pp-customer-skeleton" role="status">Finding orders saved on this device…</div> : orders.length ? <select id="complaint-order" value={orderId} onChange={(event) => setOrderId(event.target.value)} required>{orders.map((order) => <option key={order.id} value={order.id}>{order.id} · {money(order.amount)} · {order.status.toLowerCase()}</option>)}</select> : <div className="pp-customer-empty"><b>No saved orders on this device.</b><span>Complete a checkout here first; order access stays in a private browser cookie.</span><Link href="/#shop">Browse the demo shop ↗</Link></div>}
        {selected && <p className="pp-customer-order-meta">Placed {new Date(selected.createdAt).toLocaleDateString()} · {selected.items.reduce((sum, item) => sum + item.quantity, 0)} item(s) · fictional order</p>}
        <label htmlFor="complaint-type">What is this about?</label><select id="complaint-type" value={type} onChange={(event) => setType(event.target.value)} required><option value="" disabled>Choose a reason</option>{complaintOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <label htmlFor="complaint-text">Your message</label><textarea id="complaint-text" value={originalText} onChange={(event) => setOriginalText(event.target.value)} maxLength={4000} minLength={1} required placeholder="Please describe what happened in your own words…"/><div className="pp-customer-input-foot"><span>We save this wording as written.</span><span>{originalText.length.toLocaleString()} / 4,000</span></div>
        <p className="pp-customer-privacy">Don’t include full card numbers, security codes, passwords, or API keys. This is a fictional demo store; no real payment or return is processed.</p>
        {error && <p className="pp-customer-error" role="alert">{error}</p>}
        <button className="pp-customer-button" type="submit" disabled={busy || loading || !orders.length || !selected || !type || !originalText.trim()}>{busy ? "Saving your note…" : "Send to the store"}<span>↗</span></button>
      </form>}
      <footer className="pp-customer-footer"><span>PayProof · Customer support</span><Link href="/admin">Merchant desk</Link></footer>
    </div>
  </main>;
}
