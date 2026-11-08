import "server-only";
import { createHash } from "node:crypto";
import { Resend } from "resend";

type SendIncidentEmailInput = {
  incidentId: string;
  to: string;
  subject: string;
  text: string;
};

export function isResendConfigured() {
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim());
}

export async function sendIncidentEmail(input: SendIncidentEmailInput) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) throw new Error("Email sending is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL on the server.");

  const resend = new Resend(apiKey);
  const idempotencyKey = `payproof-incident-${createHash("sha256")
    .update(JSON.stringify([input.incidentId, input.to.trim().toLowerCase(), input.subject, input.text]))
    .digest("hex")}`;
  const { data, error } = await resend.emails.send({
    from,
    to: input.to.trim(),
    subject: input.subject,
    text: input.text,
  }, { idempotencyKey });

  if (error) throw new Error(error.message || "Resend could not send this email.");
  if (!data?.id) throw new Error("Resend accepted no email ID for this message.");
  return { id: data.id };
}
