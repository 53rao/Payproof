import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { complaintTypes, createComplaint } from "@/lib/customer-case-store";
import { verifyRequestOrigin } from "@/lib/auth";
import { containsProhibitedPaymentData } from "@/lib/privacy";

export async function POST(request: Request) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Send your report as JSON." }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > 8_192) return NextResponse.json({ error: "Your report is too large." }, { status: 413 });
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Complete the report fields." }, { status: 400 });
    const { orderId, type, originalText } = body as Record<string, unknown>;
    if (typeof orderId !== "string" || !/^([A-Z0-9-]{10,40}|SIM-[A-F0-9]{8}|DEMO-ORDER-[A-Z0-9-]+)$/i.test(orderId)) return NextResponse.json({ error: "Choose one of your saved orders." }, { status: 400 });
    const accessToken = request.headers.get("cookie")?.split(";").map((part) => part.trim()).find((part) => part.startsWith(`payproof_order_${orderId}=`))?.slice(`payproof_order_${orderId}=`.length);
    if (!accessToken || !/^[a-zA-Z0-9-]{16,80}$/.test(decodeURIComponent(accessToken))) return NextResponse.json({ error: "This order could not be verified. Reopen the order confirmation on this device." }, { status: 400 });
    if (typeof type !== "string" || !complaintTypes.includes(type as typeof complaintTypes[number])) return NextResponse.json({ error: "Choose a complaint type." }, { status: 400 });
    if (typeof originalText !== "string" || originalText.length < 1 || originalText.length > 4000 || !originalText.trim()) return NextResponse.json({ error: "Describe what happened in 1–4,000 characters." }, { status: 400 });
    if (containsProhibitedPaymentData(originalText)) return NextResponse.json({ error: "Remove full card numbers, security codes, passwords, and API keys before sending your note." }, { status: 400 });
    const accessTokenHash = createHash("sha256").update(decodeURIComponent(accessToken)).digest("hex");
    const complaint = await createComplaint(accessTokenHash, orderId, type as typeof complaintTypes[number], originalText);
    if (!complaint) return NextResponse.json({ error: "This order could not be verified. Select an order you purchased on this device." }, { status: 404 });
    return NextResponse.json({ complaint: { id: complaint.id, caseId: complaint.caseId, createdAt: complaint.createdAt, simulated: true } }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Your report could not be saved. Please try again." }, { status: 500 });
  }
}
