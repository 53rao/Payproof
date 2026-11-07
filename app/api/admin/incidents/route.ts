import { NextResponse } from "next/server";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { detectIncidents } from "@/lib/incident-detector";
import { draftMerchantNotification } from "@/lib/incident-notifications";

const allowedActions = ["NOTIFY_MERCHANT", "FLAG_FOR_MONITORING", "DISMISS"] as const;
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
    const input = body as { incidentId?: unknown; action?: unknown; merchantId?: unknown };
    if (typeof input.incidentId !== "string" || typeof input.merchantId !== "string" || typeof input.action !== "string" || !allowedActions.includes(input.action as IncidentAction)) {
      return NextResponse.json({ error: "Incident ID, merchant ID, and a supported action are required." }, { status: 400 });
    }
    const incident = (await detectIncidents()).find((item) => item.id === input.incidentId && item.merchantId === input.merchantId);
    if (!incident) return NextResponse.json({ error: "This incident is no longer active." }, { status: 404 });
    if (!incident.actions.includes(input.action as IncidentAction)) return NextResponse.json({ error: "This action is not available for the incident." }, { status: 400 });

    if (input.action === "NOTIFY_MERCHANT") return NextResponse.json(await draftMerchantNotification(incident), { headers: { "Cache-Control": "no-store" } });
    if (input.action === "FLAG_FOR_MONITORING") {
      console.info("Incident flagged for monitoring", { incidentId: incident.id, merchantId: incident.merchantId });
      return NextResponse.json({ status: "flagged" });
    }
    return NextResponse.json({ status: "dismissed" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The incident action could not be completed." }, { status: 502 });
  }
}
