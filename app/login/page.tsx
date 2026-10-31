"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import "./login.css";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not sign in.");
      const next = new URLSearchParams(window.location.search).get("next");
      router.replace(next && (next.startsWith("/admin") || next.startsWith("/owner/")) && !next.startsWith("//") ? next : "/admin");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not sign in.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="pp-login-page">
    <a className="pp-login-wordmark" href="/">PayProof<span>.</span></a>
    <div className="pp-login-layout">
      <section className="pp-login-story">
        <div className="pp-login-story-copy"><span className="pp-login-label">MERCHANT DESK</span><h1>Every payment tells a story.</h1><p>See what happened, protect the shelf, and keep the evidence close.</p></div>
        <div className="pp-login-art" role="img" aria-label="A considered collection of everyday store objects"/>
        <div className="pp-login-story-foot"><span><i/> PRIVATE WORKSPACE</span><span>SIMULATED DATA</span></div>
      </section>
      <section className="pp-login-panel" aria-labelledby="login-title">
        <div className="pp-login-heading"><span className="pp-login-icon"><LoginIcon name="shield"/></span><div><h2 id="login-title">Welcome back.</h2><p>Sign in to review your store’s incident desk.</p></div></div>
        <form onSubmit={signIn} className="pp-login-form">
          <label htmlFor="owner-email">Owner email</label><input id="owner-email" type="email" autoComplete="username" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@store.com"/>
          <label htmlFor="owner-password">Password</label><input id="owner-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Enter your password"/>
          {error && <p className="pp-login-error" role="alert">{error}</p>}
          <button type="submit" disabled={busy}>{busy ? "Checking…" : "Sign in"}<LoginIcon name="arrow"/></button>
        </form>
        <p className="pp-login-footnote"><LoginIcon name="info"/> This desk contains fictional demo records. Checkout and payment behavior remain simulated.</p>
        <a className="pp-login-back" href="/">Back to the demo store <LoginIcon name="arrow"/></a>
      </section>
    </div>
  </main>;
}

function LoginIcon({ name }: { name: "shield" | "arrow" | "info" }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, viewBox: "0 0 24 24", "aria-hidden": true as const };
  const shape = {
    shield: <><path d="M12 3 19 6v5c0 5-3 8-7 10-4-2-7-5-7-10V6l7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,
    info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></>,
  }[name];
  return <svg {...common}>{shape}</svg>;
}
