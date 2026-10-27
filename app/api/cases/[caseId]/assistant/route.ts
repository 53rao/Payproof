import { NextResponse } from "next/server";
import { hasOwnerSession, verifyRequestOrigin } from "@/lib/auth";
import { draftCustomerReply, draftMerchantResponse, explainCase, getCaseSnapshot, isDraftKind } from "@/lib/case-assistant";

type Context = { params: Promise<{ caseId: string }> };

export async function POST(request: Request, { params }: Context) {
  if (!verifyRequestOrigin(request)) return NextResponse.json({ error: "Request origin was not accepted." }, { status: 403 });
  if (!await hasOwnerSession()) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401 });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Send the assistant request as JSON." }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > 2_048) return NextResponse.json({ error: "The assistant request is too large." }, { status: 413 });

  try {
    const { caseId } = await params;
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Choose an assistant action." }, { status: 400 });
    const action = (body as Record<string, unknown>).action;
    const snapshot = await getCaseSnapshot(caseId);
    if (!snapshot) return NextResponse.json({ error: "This case is not in the current demo ledger." }, { status: 404 });
    if (action === "explain") {
      const encoder = new TextEncoder();
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
          void (async () => {
            try {
              const explanation = await explainCase(snapshot, (update) => send({ type: "summary", ...update }));
              send({ type: "complete", explanation });
            } catch {
              send({ type: "error", error: "The case explanation could not be generated. Try again." });
            } finally { controller.close(); }
          })();
        },
      });
      return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no" } });
    }
    if (action === "question") {
      const question = (body as Record<string, unknown>).question;
      if (typeof question !== "string" || !question.trim() || question.length > 500) return NextResponse.json({ error: "Ask a question in 500 characters or fewer." }, { status: 400 });
      const explanation = await explainCase(snapshot, undefined, question);
      return NextResponse.json({ explanation, question: question }, { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "draft") {
      const kind = (body as Record<string, unknown>).kind;
      if (!isDraftKind(kind)) return NextResponse.json({ error: "Choose a supported reply type." }, { status: 400 });
      return NextResponse.json(await draftCustomerReply(snapshot, kind), { headers: { "Cache-Control": "no-store" } });
    }
    if (action === "response_draft") return NextResponse.json(await draftMerchantResponse(snapshot), { headers: { "Cache-Control": "no-store" } });
    return NextResponse.json({ error: "Choose explain, question, draft, or response_draft." }, { status: 400 });
  } catch {
    return NextResponse.json({ error: "The case assistant could not read this case. Refresh the desk and try again." }, { status: 500 });
  }
}
