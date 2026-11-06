"use client";

import { useEffect, useRef, useState } from "react";
import { create as createClient, type ClientInstance } from "braintree-web/client";
import { create as createHostedFields, type HostedFieldsInstance } from "braintree-web/hosted-fields";

type Availability = "loading" | "ready" | "unavailable" | "error";

export function BraintreePaymentForm({
  amount,
  disabled,
  buttonLabel,
  onPaymentMethod,
  onAvailability,
}: {
  amount: string;
  disabled: boolean;
  buttonLabel: string;
  onPaymentMethod: (nonce: string) => Promise<void>;
  onAvailability: (availability: "ready" | "unavailable" | "error") => void;
}) {
  const hostedFieldsRef = useRef<HostedFieldsInstance | null>(null);
  const onPaymentMethodRef = useRef(onPaymentMethod);
  const onAvailabilityRef = useRef(onAvailability);
  const [availability, setAvailability] = useState<Availability>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  onPaymentMethodRef.current = onPaymentMethod;
  onAvailabilityRef.current = onAvailability;

  useEffect(() => {
    let active = true;
    let clientInstance: ClientInstance | undefined;
    void (async () => {
      try {
        const response = await fetch("/api/braintree/client-token", { cache: "no-store" });
        const config = await response.json() as { configured?: boolean; clientToken?: string; error?: string };
        if (!response.ok) throw new Error(typeof config.error === "string" ? config.error : "Braintree Sandbox could not issue a client token.");
        if (!config.configured || !config.clientToken) {
          if (active) {
            setAvailability("unavailable");
            onAvailabilityRef.current("unavailable");
          }
          return;
        }
        clientInstance = await createClient({ authorization: config.clientToken });
        const instance = await createHostedFields({
          client: clientInstance,
          styles: {
            input: { color: "#17243b", "font-family": "DM Sans, sans-serif", "font-size": "14px" },
            "input:focus": { color: "#17243b" },
            "input.invalid": { color: "#b42318" },
          },
          fields: {
            number: { container: "#braintree-card-number", placeholder: "Card number" },
            expirationDate: { container: "#braintree-card-expiration", placeholder: "MM / YY" },
            cvv: { container: "#braintree-card-cvv", placeholder: "CVV" },
          },
        });
        if (!active) {
          await instance.teardown();
          return;
        }
        hostedFieldsRef.current = instance;
        setAvailability("ready");
        onAvailabilityRef.current("ready");
      } catch (cause) {
        if (active) {
          setAvailability("error");
          const code = cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string" ? ` (${cause.code})` : "";
          setMessage(`${cause instanceof Error ? cause.message : "Secure card fields could not connect to Braintree Sandbox."}${code} Check the server and browser can reach Braintree, then refresh.`);
          onAvailabilityRef.current("error");
        }
      }
    })();
    return () => {
      active = false;
      const instance = hostedFieldsRef.current;
      hostedFieldsRef.current = null;
      if (instance) void instance.teardown();
    };
  }, []);

  async function submitPayment() {
    const instance = hostedFieldsRef.current;
    if (!instance || disabled || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      const { nonce } = await instance.tokenize();
      await onPaymentMethodRef.current(nonce);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Payment details could not be verified. Check the fields and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="braintree-payment-form">
      {availability === "loading" && <p className="braintree-status" role="status">Connecting to Braintree Sandbox…</p>}
      {availability === "unavailable" && <p className="braintree-status" role="status">Braintree Sandbox credentials are not configured.</p>}
      {availability === "error" && <p className="braintree-status" role="alert">{message}</p>}
      <div className="braintree-fields" hidden={availability === "unavailable" || availability === "error"}>
        <label htmlFor="braintree-card-number">Card number</label>
        <div id="braintree-card-number" className="braintree-hosted-field" />
        <div className="braintree-card-row">
          <div><label htmlFor="braintree-card-expiration">Expiry date</label><div id="braintree-card-expiration" className="braintree-hosted-field" /></div>
          <div><label htmlFor="braintree-card-cvv">Security code</label><div id="braintree-card-cvv" className="braintree-hosted-field" /></div>
        </div>
      </div>
      {availability === "ready" && <>
        {message && <p className="braintree-error" role="alert">{message}</p>}
        <button type="button" className="archive-pay-button braintree-submit" onClick={() => void submitPayment()} disabled={disabled || submitting}>
          {submitting ? "Verifying payment…" : buttonLabel}<span>{submitting ? "…" : amount}</span>
        </button>
        <small className="braintree-secure-note">Braintree Sandbox · Card details are securely sent to Braintree</small>
      </>}
    </div>
  );
}
