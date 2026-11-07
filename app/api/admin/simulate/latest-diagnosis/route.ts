import { NextResponse } from "next/server";
import { hasOwnerSession } from "@/lib/auth";
import { getDatabase } from "@/db/client";
import { DEMO_MERCHANTS } from "@/lib/merchants";

export async function GET() {
  if (!(await hasOwnerSession())) return NextResponse.json({ error: "Owner sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const db = getDatabase();
  if (!db) return NextResponse.json({ diagnosis: null }, { headers: { "Cache-Control": "no-store" } });

  try {
    const row = await db.simulationDiagnosis.findFirst({
      orderBy: { createdAt: "desc" },
    });
    if (!row) return NextResponse.json({ diagnosis: null }, { headers: { "Cache-Control": "no-store" } });
    const merchant = DEMO_MERCHANTS.find((m) => m.id === row.merchantId);
    return NextResponse.json(
      {
        diagnosis: {
          id: row.id,
          simulationId: row.simulationId,
          merchantId: row.merchantId,
          merchantName: merchant?.name ?? row.merchantId,
          patternDetected: row.patternDetected,
          likelyCause: row.likelyCause,
          evidence: Array.isArray(row.evidence) ? row.evidence : [],
          hypothesis: row.hypothesis,
          recommendedAction: row.recommendedAction,
          confidence: row.confidence,
          confidenceReason: row.confidenceReason,
          createdAt: row.createdAt.toISOString(),
        },
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ diagnosis: null }, { headers: { "Cache-Control": "no-store" } });
  }
}
