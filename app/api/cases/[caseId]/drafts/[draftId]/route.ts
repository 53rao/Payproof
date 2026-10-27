import { NextResponse } from "next/server";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { updateDraft } from "@/lib/case-assistant";

type Context = { params: Promise<{ caseId: string; draftId: string }> };

export async function PATCH(request: Request, { params }: Context) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401 });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Send the edited reply as JSON." }, { status: 415 });
  try {
    const { caseId, draftId } = await params;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || typeof (body as { body?: unknown }).body !== "string" || (body as { body: string }).body.length > 2_000) return NextResponse.json({ error: "Reply text must be no more than 2,000 characters." }, { status: 400 });
    const result = await updateDraft(caseId, draftId, (body as { body: string }).body);
    if (result.status === "missing") return NextResponse.json({ error: "This draft was not found for the selected case." }, { status: 404 });
    if (result.status === "approved") return NextResponse.json({ error: "An approved simulated reply can no longer be edited." }, { status: 409 });
    if (result.status === "invalid") return NextResponse.json({ error: "Reply text cannot be empty." }, { status: 400 });
    return NextResponse.json({ draft: result.draft }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The edited reply could not be saved." }, { status: 500 });
  }
}
