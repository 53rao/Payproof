"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { products, type Product } from "@/lib/products";
import { MotionButton } from "@/components/MotionButton";
import { BraintreePaymentForm } from "@/components/BraintreePaymentForm";

type Cart = Record<string, number>;
type Checkout = { id: string; amount: number; items: { id: string; quantity: number }[]; simulated?: boolean };
const money = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(value);

export default function Home() {
  const [cart, setCart] = useState<Cart>({});
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [result, setResult] = useState<"success" | "decline" | "duplicate" | "expired" | null>(null);
  const [resultIssue, setResultIssue] = useState("");
  const [debugId, setDebugId] = useState("");
  const [isRealSandbox, setIsRealSandbox] = useState(false);
  const [reportedIssueType, setReportedIssueType] = useState<"PAYMENT_DECLINED" | "DUPLICATE_SUBMISSION" | "OTHER">("PAYMENT_DECLINED");
  const [reportedIssueDetails, setReportedIssueDetails] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [braintreeAvailability, setBraintreeAvailability] = useState<"loading" | "ready" | "unavailable" | "error">("loading");
  const [transactionId, setTransactionId] = useState("");
  const [humanConfirmed, setHumanConfirmed] = useState(false);
  const busyRef = useRef(false);
  const idempotencyRef = useRef("");

  const filtered = useMemo(() => products.filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(query.toLowerCase())), [query]);
  const cartEntries = Object.entries(cart).filter(([, quantity]) => quantity > 0);
  const count = cartEntries.reduce((sum, [, quantity]) => sum + quantity, 0);
  const total = cartEntries.reduce((sum, [id, quantity]) => sum + (products.find((p) => p.id === id)?.price ?? 0) * quantity, 0);
  const change = (id: string, delta: number) => setCart((current) => ({ ...current, [id]: Math.max(0, Math.min(20, (current[id] ?? 0) + delta)) }));

  // Keyboard shortcut: Press 'd' to test quick decline
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target;
      if (e.defaultPrevented || !(target instanceof Element) || target.closest("input, textarea, select, button, a, [contenteditable='true']")) return;
      if (braintreeAvailability !== "unavailable") return;
      if (e.key === "d" || e.key === "D") {
        const items = count ? cartEntries.map(([id, quantity]) => ({ id, quantity })) : [{ id: products[0].id, quantity: 1 }];
        if (!count) change(products[0].id, 1);
        void pay("decline", items);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function payWithBraintree(paymentMethodNonce: string) {
    if (busyRef.current || count === 0) return;
    busyRef.current = true;
    if (!idempotencyRef.current) idempotencyRef.current = crypto.randomUUID();
    setBusy(true); setError(""); setResult(null); setResultIssue(""); setDebugId(""); setTransactionId("");
    try {
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: cartEntries.map(([id, quantity]) => ({ id, quantity })), idempotencyKey: idempotencyRef.current, humanConfirmed }),
      });
      const order = await response.json();
      if (!response.ok) throw new Error(order.error ?? "Could not start checkout.");
      setCheckout(order);

      const captureResponse = await fetch("/api/checkout/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orderId: order.id, outcome: "success", paymentMethodNonce }),
      });
      const capture = await captureResponse.json();
      if (!captureResponse.ok) throw new Error(capture.error ?? "Braintree could not complete the payment.");
      idempotencyRef.current = "";
      setResultIssue(capture.payment?.issue ?? "");
      setDebugId(capture.payment?.debug_id ?? "");
      setTransactionId(capture.payment?.transaction_id ?? "");
      setIsRealSandbox(!capture.simulated);
      setResult(capture.payment.status === "COMPLETED" ? "success" : "decline");
      if (capture.payment.status === "COMPLETED") setCart({});
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Braintree checkout was interrupted.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function pay(outcome: "success" | "decline" | "duplicate" = "success", items: { id: string; quantity: number }[] = cartEntries.map(([id, quantity]) => ({ id, quantity }))) {
    if (busyRef.current) return;
    busyRef.current = true;
    if (!idempotencyRef.current) idempotencyRef.current = crypto.randomUUID();
    setBusy(true); setError(""); setResult(null); setResultIssue(""); setDebugId("");
    try {
      const response = await fetch("/api/checkout/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items, idempotencyKey: idempotencyRef.current, humanConfirmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Checkout failed.");
      setCheckout(data);
      const captureResponse = await fetch("/api/checkout/capture", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          orderId: data.id,
          outcome,
          reportedIssueType: outcome === "success" ? undefined : reportedIssueType,
          reportedIssueDetails: outcome === "success" ? undefined : reportedIssueDetails,
        }),
      });
      const capture = await captureResponse.json();
      if (!captureResponse.ok) throw new Error(capture.error ?? "Could not complete checkout.");
      idempotencyRef.current = "";
      setResultIssue(capture.payment?.issue ?? "");
      setDebugId(capture.payment?.debug_id ?? "");
      setIsRealSandbox(!capture.simulated);
      setResult(capture.payment.status === "COMPLETED" ? "success" : capture.payment.issue === "DUPLICATE_INVOICE_ID" ? "duplicate" : capture.payment.issue === "RESERVATION_EXPIRED" ? "expired" : "decline");
      if (capture.payment.status === "COMPLETED") setCart({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <main className="archive-storefront">
      <div className="archive-notice"><span>THE EVERYDAY ARCHIVE</span><span>{braintreeAvailability === "ready" ? "BRAINTREE SANDBOX" : "SIMULATED STORE"}</span></div>
      <header className="archive-nav">
        <a className="archive-brand" href="#top" aria-label="Little Things Supply Co. home">little things <small>SUPPLY CO.</small></a>
        <nav className="archive-nav-links" aria-label="Main navigation">
          <a href="#shop">Shop</a><a href="#story">Our story</a><a href="/report-problem">Order help</a><a href="/admin">Merchant desk</a>
        </nav>
        <a className="archive-bag-link" href="#bag">Bag <span>{count.toString().padStart(2, "0")}</span><ArchiveBagIcon/></a>
      </header>

      <section className="archive-hero" id="top">
        <div className="archive-hero-copy"><p className="archive-kicker"><span/> The everyday archive</p><h1>Good things<br/>for <em>everyday.</em></h1><p className="archive-hero-intro">Useful, beautiful objects that make the ordinary feel like something.</p><a className="archive-cta" href="#shop">Shop the collection <span>↗</span></a><p className="archive-edition">A considered collection for home, work, travel &amp; slower days</p></div>
        <figure className="archive-hero-image"><img src="/images/everyday-archive-hero.png" alt="A canvas tote, ceramic mug, candle, notebook, bottle and socks arranged on warm orange display plinths"/><figcaption><span>OBJECTS FOR REAL LIFE</span><span>01 — 06</span></figcaption></figure>
      </section>

      <section className="archive-collection" id="shop">
        <div className="archive-section-head"><div><p className="archive-kicker"><span/> The collection</p><h2>Useful things,<br/><em>well considered.</em></h2></div><label className="archive-search"><ArchiveSearchIcon/><input aria-label="Search products" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the collection"/><span>⌘ /</span></label></div>
        <div className="archive-product-grid">{filtered.map((product) => <ProductCard key={product.id} product={product} index={products.findIndex((item) => item.id === product.id)} quantity={cart[product.id] ?? 0} onAdd={() => change(product.id, 1)}/>)}</div>
        {filtered.length === 0 && <p className="archive-empty-search">No objects match that search. Try a product name or category.</p>}
      </section>

      <section className="archive-story" id="story"><div className="archive-story-image" role="img" aria-label="Warm still life of useful everyday objects"/><div className="archive-story-copy"><p className="archive-kicker"><span/> Our story</p><h2>Everyday objects,<br/>made a little more<br/><em>intentional.</em></h2><p>Useful, beautiful things for the small rituals that make a day feel like your own.</p><a href="#bag">Find your little something <span>↗</span></a></div><div className="archive-story-index">LT<br/><b>01</b><span>MADE FOR<br/>THE EVERYDAY</span></div></section>

      <section className="archive-bag-section" id="bag"><div className="archive-bag-heading"><p className="archive-kicker"><span/> Your selection</p><h2>The bag <em>{count.toString().padStart(2, "0")}</em></h2><p>Take a closer look at what you’ve chosen.</p></div><div className="archive-bag-layout"><div className="archive-bag-content">
        {cartEntries.length === 0 ? <div className="archive-bag-empty"><span>01</span><div><b>Your bag is taking a breather.</b><p>Add an object from the collection to begin.</p></div><a href="#shop">Return to the collection ↗</a></div> : <div className="archive-bag-lines">{cartEntries.map(([id, quantity]) => {const product = products.find((item) => item.id === id)!; return <div className="archive-bag-line" key={id}><div className={`archive-bag-thumb product-${id}`} style={{backgroundImage:"url('/images/everyday-archive-products.png')"}}/><div className="archive-bag-info"><b>{product.name}</b><small>{money(product.price)} each</small></div><div className="archive-quantity"><button type="button" onClick={() => change(id,-1)} aria-label={`Remove one ${product.name}`}>−</button><span>{quantity}</span><button type="button" onClick={() => change(id,1)} aria-label={`Add one ${product.name}`}>+</button></div><strong>{money(product.price*quantity)}</strong></div>})}</div>}
        {error && <p className="archive-error" role="alert">{error}</p>}
        {result && <div className={`archive-result ${result === "success" ? "success" : "failure"}`} role="status"><span>{result === "success" ? "✓" : "!"}</span><div><b>{result === "success" ? "Payment complete" : result === "decline" ? "Payment failed" : result === "duplicate" ? "Duplicate submission detected" : "Reservation expired"}</b><p>{result === "success" ? "Your order is all set. Thanks for stopping by." : `${isRealSandbox ? "BRAINTREE SANDBOX" : "SIMULATED"} · ${resultIssue || "PAYMENT_FAILED"}${transactionId ? ` · transaction ${transactionId}` : debugId ? ` · debug ID ${debugId}` : ""} · No payment was taken.`}</p>{checkout && <><small>Order {checkout.id} · {money(checkout.amount)} · {isRealSandbox ? "BRAINTREE SANDBOX" : "SIMULATED"}</small><a href="/report-problem">Need help with this order? Report a problem ↗</a></>}</div></div>}
        {braintreeAvailability === "unavailable" && <div className="archive-demo-panel"><div className="archive-demo-head"><div><span className="archive-demo-dot"/> DEMO CHECKOUT</div><span className="archive-sim-pill">SIMULATED</span></div><p>Braintree Sandbox credentials aren’t available here. You can still explore the checkout flow with fictional outcomes.</p><label htmlFor="checkout-issue-type">Scenario <small>Choose a simulated outcome</small></label><select id="checkout-issue-type" value={reportedIssueType} onChange={(event) => setReportedIssueType(event.target.value as typeof reportedIssueType)}><option value="PAYMENT_DECLINED">Payment declined</option><option value="DUPLICATE_SUBMISSION">Possible duplicate submission</option><option value="OTHER">Something else</option></select><label htmlFor="checkout-issue-details">Customer note <small>Optional · up to 1,000 characters</small></label><textarea id="checkout-issue-details" value={reportedIssueDetails} onChange={(event) => setReportedIssueDetails(event.target.value)} maxLength={1000} placeholder="Tell the store what happened…"/><small className="archive-note-hint">Saved with the case in your original wording. Don’t include card numbers or security codes.</small><button type="button" className="archive-scenario-button" onClick={() => count ? pay(reportedIssueType === "DUPLICATE_SUBMISSION" ? "duplicate" : "decline") : setError("Add an item to your bag first.")}>Run selected scenario <span>↗</span></button></div>}
      </div><aside className="archive-checkout"><div className="archive-checkout-top"><span>YOUR BAG</span><span>{count} {count === 1 ? "ITEM" : "ITEMS"}</span></div><div className="archive-subtotal"><span>Subtotal</span><strong>{money(total)}</strong></div><label className="archive-human-confirm"><input type="checkbox" checked={humanConfirmed} onChange={(event) => setHumanConfirmed(event.target.checked)}/><span>I confirm I’m completing this purchase as a person.</span></label><small className="archive-human-origin-note">If left unchecked, origin is recorded as unknown.</small><div className="archive-braintree"><BraintreePaymentForm amount={money(total)} disabled={count === 0 || busy} buttonLabel={count ? "Pay with Braintree Sandbox" : "Add an item to continue"} onPaymentMethod={payWithBraintree} onAvailability={setBraintreeAvailability}/></div>{braintreeAvailability === "unavailable" && <><MotionButton className="archive-pay-button" state={busy ? "loading" : result === "success" ? "success" : error ? "error" : "idle"} onClick={() => pay("success")} disabled={count === 0}>{count ? "Continue to simulated checkout" : "Add an item to continue"}<span>↗</span></MotionButton><small className="archive-sim-note">SIMULATED CHECKOUT · NO PAYMENT IS TAKEN</small></>}<a className="archive-help-link" href="/report-problem">Order help / request a return</a></aside></div></section>

      <footer className="archive-footer"><a className="archive-brand" href="#top">little things <small>SUPPLY CO.</small></a><nav aria-label="Footer navigation"><a href="#shop">Shop</a><a href="#story">Our story</a><a href="/report-problem">Order help</a><a href="/admin">Merchant desk</a></nav><span>{braintreeAvailability === "ready" ? "BRAINTREE SANDBOX" : "FICTIONAL STORE · SIMULATED CHECKOUT"}</span></footer>
    </main>
  );
}

function ProductCard({ product, index, quantity, onAdd }: { product: Product; index: number; quantity: number; onAdd: () => void }) {
  return (
    <article className="archive-product-card">
      <div className={`archive-product-image product-${product.id}`} style={{backgroundImage:"url('/images/everyday-archive-products.png')"}} role="img" aria-label={product.name}>
        <span className="archive-product-index">{String(index + 1).padStart(2,"0")}</span>
        <button className="archive-add-button" onClick={onAdd} aria-label={`Add ${product.name} to bag`}><span aria-hidden="true">{quantity ? `+${quantity}` : "+"}</span>{quantity ? " IN BAG" : " ADD TO BAG"}</button>
      </div>
      <div className="archive-product-meta"><p>{product.category}</p><div><h3>{product.name}</h3><strong>{money(product.price)}</strong></div><small>{product.description}</small></div>
    </article>
  );
}

function ArchiveBagIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l1 13H4L5 8Z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></svg>}
function ArchiveSearchIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.3"/><path d="m15.5 15.5 4.2 4.2"/></svg>}
