import { NextResponse } from "next/server";
import { verifyRequestOrigin } from "@/lib/auth";
import { getCaseAccess } from "@/lib/case-access";
import { getCaseSnapshot } from "@/lib/case-assistant";
import { createRecoveryToken } from "@/lib/winback";

type Context = { params: Promise<{ caseId: string }> };
export async function POST(request: Request, { params }: Context) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  try {
    const { caseId } = await params;
    if (!await getCaseAccess(caseId)) return NextResponse.json({ error: "Sign-in is required for this case." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    const snapshot = await getCaseSnapshot(caseId);
    if (!snapshot) return NextResponse.json({ error: "Case not found." }, { status: 404 });
    if (snapshot.order.status.toLowerCase() !== "failed") return NextResponse.json({ error: "A recovery link is only available for a failed order." }, { status: 409 });
    const token = createRecoveryToken(caseId);
    const url = new URL(`/recover/${encodeURIComponent(token)}`, request.url).toString();
    return NextResponse.json({ url, expiresInDays: 7, simulated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "A recovery link could not be created." }, { status: 500 }); }
}
