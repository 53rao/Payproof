import { NextResponse } from "next/server";
import { hasOwnerSession } from "@/lib/auth";
import { getCaseSnapshot, listDrafts } from "@/lib/case-assistant";

type Context = { params: Promise<{ caseId: string }> };

export async function GET(_request: Request, { params }: Context) {
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401 });
  try {
    const { caseId } = await params;
    if (!await getCaseSnapshot(caseId)) return NextResponse.json({ error: "This case is not in the current demo ledger." }, { status: 404 });
    return NextResponse.json({ drafts: await listDrafts(caseId) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Case drafts could not be loaded." }, { status: 500 });
  }
}
