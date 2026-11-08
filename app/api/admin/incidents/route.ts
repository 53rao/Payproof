import { NextResponse } from "next/server";
import { getOwnerSession, hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { detectIncidents } from "@/lib/incident-detector";
import { draftMerchantNotification } from "@/lib/incident-notifications";
import { getDatabase } from "@/db/client";
import { isResendConfigured, sendIncidentEmail } from "@/lib/resend-email";

const allowedActions = ["NOTIFY_MERCHANT", "SEND_EMAIL", "FLAG_FOR_MONITORING", "DISMISS"] as const;
type IncidentAction = typeof allowedActions[number];

export async function GET() {
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  try {
    return NextResponse.json(await detectIncidents(), { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Incidents could not be loaded." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid incident action." }, { status: 400 });
    const input = body as { incidentId?: unknown; action?: unknown; merchantId?: unknown; email?: unknown };
    if (typeof input.incidentId !== "string" || typeof input.merchantId !== "string" || typeof input.action !== "string" || !allowedActions.includes(input.action as IncidentAction)) {
      return NextResponse.json({ error: "Incident ID, merchant ID, and a supported action are required." }, { status: 400 });
    }
    const incident = (await detectIncidents()).find((item) => item.id === input.incidentId && item.merchantId === input.merchantId);
    if (!incident) return NextResponse.json({ error: "This incident is no longer active." }, { status: 404 });
    const action = input.action as IncidentAction;
    const incidentAction = action === "SEND_EMAIL" ? "NOTIFY_MERCHANT" : action;
    if (!incident.actions.includes(incidentAction)) return NextResponse.json({ error: "This action is not available for the incident." }, { status: 400 });

    if (action === "NOTIFY_MERCHANT") return NextResponse.json(await draftMerchantNotification(incident), { headers: { "Cache-Control": "no-store" } });
    if (action === "SEND_EMAIL") {
      if (!isResendConfigured()) return NextResponse.json({ error: "Email sending is not configured. Add RESEND_API_KEY and RESEND_FROM_EMAIL to the server environment." }, { status: 503 });
      if (!input.email || typeof input.email !== "object") return NextResponse.json({ error: "Email recipient, subject, and message are required." }, { status: 400 });
      const email = input.email as { to?: unknown; subject?: unknown; text?: unknown };
      if (typeof email.to !== "string" || email.to.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.to.trim())) return NextResponse.json({ error: "Enter a valid recipient email address." }, { status: 400 });
      const recipientDomain = email.to.trim().split("@").pop()?.toLowerCase() ?? "";
      if (recipientDomain === "example.com" || recipientDomain.endsWith(".example.com") || /\.(demo|example|test|invalid|localhost)$/.test(recipientDomain)) return NextResponse.json({ error: "Replace the demo recipient with a real merchant email address before sending." }, { status: 400 });
      if (typeof email.subject !== "string" || !email.subject.trim() || email.subject.length > 180) return NextResponse.json({ error: "The email subject is required and must be 180 characters or fewer." }, { status: 400 });
      if (typeof email.text !== "string" || !email.text.trim() || email.text.length > 4000) return NextResponse.json({ error: "The email message is required and must be 4,000 characters or fewer." }, { status: 400 });
      const sent = await sendIncidentEmail({ incidentId: incident.id, to: email.to.trim(), subject: email.subject.trim(), text: email.text.trim() });
      const db = getDatabase();
      if (db) await db.agentActionLog.create({
        data: { type: "MERCHANT_NOTIFICATION_EMAIL_SENT", merchantId: incident.merchantId, detail: `Incident ${incident.id}; Resend email ${sent.id}; recipient ${email.to.trim()}.` },
      }).catch((error) => console.error("Could not record sent incident email", error));
      return NextResponse.json({ status: "sent", emailId: sent.id }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "FLAG_FOR_MONITORING") {
      const db = getDatabase();
      if (!db) return NextResponse.json({ error: "Incident actions require the database." }, { status: 503 });
      const session = await getOwnerSession();
      const actedAt = new Date();
      await db.incidentState.update({ where: { id: incident.id }, data: { action: "FLAG_FOR_MONITORING", actedAt, actedBy: session?.email ?? null } });
      return NextResponse.json({ status: "flagged" });
    }
    const db = getDatabase();
    if (!db) return NextResponse.json({ error: "Incident actions require the database." }, { status: 503 });
    const session = await getOwnerSession();
    const actedAt = new Date();
    await db.incidentState.update({ where: { id: incident.id }, data: { action: "DISMISS", actedAt, actedBy: session?.email ?? null } });
    return NextResponse.json({ status: "dismissed" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The incident action could not be completed." }, { status: 502 });
  }
}
