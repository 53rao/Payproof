import { NextResponse } from "next/server";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { addMerchantCaseNote } from "@/lib/merchant-case-notes";
import { containsProhibitedPaymentData } from "@/lib/privacy";

type Context = { params: Promise<{ caseId: string }> };
export async function POST(request: Request, { params }: Context) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Send the note as JSON." }, { status: 415 });
  try {
    const { caseId } = await params;
    const body: unknown = await request.json();
    const text = body && typeof body === "object" ? (body as { text?: unknown }).text : undefined;
    if (typeof text !== "string" || !text.trim()) return NextResponse.json({ error: "Enter a note before saving." }, { status: 400 });
    if (text.length > 4000) return NextResponse.json({ error: "Notes must be 4,000 characters or fewer." }, { status: 413 });
    if (containsProhibitedPaymentData(text)) return NextResponse.json({ error: "Remove full card numbers, security codes, passwords, and API keys from your note." }, { status: 400 });
    const note = await addMerchantCaseNote(caseId, text);
    if (!note) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    return NextResponse.json({ note }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "The merchant note could not be saved." }, { status: 500 }); }
}
