"use client";

import { useState } from "react";
import { BraintreePaymentForm } from "@/components/BraintreePaymentForm";
import "./agent-checkout.css";

const scenarios = {
  success: { label: "Successful agent payment", amount: 28, items: [{ id: "mug", quantity: 1 }] },
  decline: { label: "Declined agent payment", amount: 2200, items: [{ id: "bottle", quantity: 20 }, { id: "tote", quantity: 20 }, { id: "candle", quantity: 20 }] },
} as const;
type Scenario = keyof typeof scenarios;
const money = (amount: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);

export default function AgentCheckoutClient() {
  const [scenario, setScenario] = useState<Scenario>("success");
  const [availability, setAvailability] = useState<"ready" | "unavailable" | "error" | "loading">("loading");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function submitNonce(paymentMethodNonce: string) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/dev/agent-checkout", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...scenarios[scenario], idempotencyKey: crypto.randomUUID(), paymentMethodNonce }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Agent checkout failed.");
      setMessage(JSON.stringify(result, null, 2));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Agent checkout failed."); }
    finally { setBusy(false); }
  }
  const selected = scenarios[scenario];
  return <main className="pp-agent-test"><a href="/admin">← Merchant desk</a><h1>Agent checkout test</h1><p>Local development only. The connector secret stays on the server.</p><div className="pp-agent-scenarios"><button type="button" aria-pressed={scenario === "success"} onClick={() => { setScenario("success"); setMessage(""); }}>Success · $28</button><button type="button" aria-pressed={scenario === "decline"} onClick={() => { setScenario("decline"); setMessage(""); }}>Decline · $2,200</button></div><section><b>{selected.label}</b><span>Total {money(selected.amount)}</span><BraintreePaymentForm amount={money(selected.amount)} disabled={busy || !selected} buttonLabel="Run agent checkout" onPaymentMethod={submitNonce} onAvailability={setAvailability}/>{availability === "unavailable" && <p>Braintree Sandbox credentials are missing.</p>}{message && <pre role="status">{message}</pre>}</section></main>;
}
