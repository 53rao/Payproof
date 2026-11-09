import { NextResponse } from "next/server";
import { getCaseAccess } from "@/lib/case-access";
import { getCaseSnapshot, listDrafts } from "@/lib/case-assistant";

type Context = { params: Promise<{ caseId: string }> };

export async function GET(_request: Request, { params }: Context) {
  try {
    const { caseId } = await params;
    if (!await getCaseAccess(caseId)) return NextResponse.json({ error: "Sign-in is required for this case." }, { status: 401 });
    if (!await getCaseSnapshot(caseId)) return NextResponse.json({ error: "This case is not in the current demo ledger." }, { status: 404 });
    return NextResponse.json({ drafts: await listDrafts(caseId) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Case drafts could not be loaded." }, { status: 500 });
  }
}
