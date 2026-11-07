"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  const initializationRef = useRef<Promise<void> | null>(null);
  const teardownRef = useRef<Promise<void> | null>(null);
  const onPaymentMethodRef = useRef(onPaymentMethod);
  const onAvailabilityRef = useRef(onAvailability);
  const [availability, setAvailability] = useState<Availability>("loading");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const fieldId = useId().replaceAll(":", "");

  onPaymentMethodRef.current = onPaymentMethod;
  onAvailabilityRef.current = onAvailability;

  useEffect(() => {
    let active = true;
    const previousInitialization = initializationRef.current;
    const selectors = { number: `#${fieldId}-number`, expirationDate: `#${fieldId}-expiration`, cvv: `#${fieldId}-cvv` };
    const clearFields = () => {
      for (const selector of Object.values(selectors)) document.querySelector(selector)?.replaceChildren();
    };
    const initialization = (async () => {
      try {
        if (previousInitialization) await previousInitialization.catch(() => undefined);
        if (teardownRef.current) await teardownRef.current.catch(() => undefined);
        if (!active) return;
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
        const clientInstance: ClientInstance = await createClient({ authorization: config.clientToken });
        if (!active) return;
        const instance = await createHostedFields({
          client: clientInstance,
          styles: {
            input: { color: "#17243b", "font-family": "DM Sans, sans-serif", "font-size": "14px" },
            "input:focus": { color: "#17243b" },
            "input.invalid": { color: "#b42318" },
          },
          fields: {
            number: { container: selectors.number, placeholder: "Card number" },
            expirationDate: { container: selectors.expirationDate, placeholder: "MM / YY" },
            cvv: { container: selectors.cvv, placeholder: "CVV" },
          },
        });
        if (!active) {
          teardownRef.current = instance.teardown().then(clearFields);
          await teardownRef.current;
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
    initializationRef.current = initialization;
    return () => {
      active = false;
      const instance = hostedFieldsRef.current;
      hostedFieldsRef.current = null;
      if (instance) teardownRef.current = instance.teardown().then(clearFields);
    };
  }, [fieldId]);

  async function submitPayment() {
    const instance = hostedFieldsRef.current;
    if (!instance || disabled || submitting) return;
    setSubmitting(true);
    setMessage("");
    try {
      // Check field validity before attempting tokenization
      const state = instance.getState();
      const fieldLabels: Record<string, string> = {
        number: "Card number",
        expirationDate: "Expiry date",
        cvv: "Security code",
      };
      const problems: string[] = [];
      for (const [key, field] of Object.entries(state.fields)) {
        if (!field.isValid) {
          const label = fieldLabels[key] ?? key;
          if (field.isEmpty) {
            problems.push(`${label} is required`);
          } else if (!field.isPotentiallyValid) {
            problems.push(`${label} is invalid`);
          } else {
            problems.push(`${label} is incomplete`);
          }
        }
      }
      if (problems.length > 0) {
        setMessage(problems.join(". ") + ".");
        setSubmitting(false);
        return;
      }

      const { nonce } = await instance.tokenize();
      await onPaymentMethodRef.current(nonce);
    } catch (error) {
      // Provide a friendlier message for the common tokenization error
      const msg = error instanceof Error ? error.message : "";
      if (msg.includes("Cannot tokenize") || msg.includes("invalid")) {
        setMessage("Please fill in all card fields with valid test data. Try: 4111 1111 1111 1111, any future date, any 3-digit CVV.");
      } else {
        setMessage(msg || "Payment details could not be verified. Check the fields and try again.");
      }
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
        <label htmlFor={`${fieldId}-number`}>Card number</label>
        <div id={`${fieldId}-number`} className="braintree-hosted-field" />
        <div className="braintree-card-row">
          <div><label htmlFor={`${fieldId}-expiration`}>Expiry date</label><div id={`${fieldId}-expiration`} className="braintree-hosted-field" /></div>
          <div><label htmlFor={`${fieldId}-cvv`}>Security code</label><div id={`${fieldId}-cvv`} className="braintree-hosted-field" /></div>
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
