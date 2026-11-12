import { randomUUID } from "node:crypto";
import { getDatabase } from "@/db/client";

export type MerchantCaseSubmission = {
  id: string;
  body: string;
  submittedAt: string;
  sourceIds: string[];
  simulated: true;
};

const SUBMISSION_KIND = "merchant_response_submission";
const runtime = globalThis as typeof globalThis & {
  payproofMerchantCaseSubmissions?: Map<string, MerchantCaseSubmission>;
};

function memorySubmissions() {
  return runtime.payproofMerchantCaseSubmissions ??= new Map<string, MerchantCaseSubmission>();
}

function cleanSourceIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean))].slice(0, 100);
}

function parseSubmission(row: { id: string; payload: unknown; createdAt: Date }): MerchantCaseSubmission | null {
  if (!row.payload || typeof row.payload !== "object") return null;
  const payload = row.payload as { body?: unknown; submittedAt?: unknown; sourceIds?: unknown };
  if (typeof payload.body !== "string" || !payload.body.trim()) return null;
  const submittedAt = typeof payload.submittedAt === "string" && !Number.isNaN(Date.parse(payload.submittedAt))
    ? new Date(payload.submittedAt).toISOString()
    : row.createdAt.toISOString();
  return {
    id: row.id,
    body: payload.body,
    submittedAt,
    sourceIds: cleanSourceIds(payload.sourceIds),
    simulated: true,
  };
}

export async function getMerchantCaseSubmission(caseId: string): Promise<MerchantCaseSubmission | null> {
  const db = getDatabase();
  if (!db) return memorySubmissions().get(caseId) ?? null;
  const row = await db.caseItem.findFirst({
    where: { caseId, kind: SUBMISSION_KIND, completeness: "PRESENT" },
    orderBy: { createdAt: "desc" },
    select: { id: true, payload: true, createdAt: true },
  });
  return row ? parseSubmission(row) : null;
}

export async function submitMerchantCaseResponse(caseId: string, body: string, sourceIds: unknown): Promise<MerchantCaseSubmission | null> {
  const responseBody = body.trim();
  if (!responseBody) return null;
  const sources = cleanSourceIds(sourceIds);
  const submittedAt = new Date().toISOString();
  const db = getDatabase();

  if (!db) {
    const record: MerchantCaseSubmission = { id: randomUUID(), body: responseBody, submittedAt, sourceIds: sources, simulated: true };
    memorySubmissions().set(caseId, record);
    return record;
  }

  const exists = await db.case.findUnique({ where: { id: caseId }, select: { id: true } });
  if (!exists) return null;

  const row = await db.$transaction(async (tx) => {
    await tx.evidenceReport.upsert({
      where: { caseId },
      create: { caseId, body: responseBody },
      update: { body: responseBody },
    });
    return tx.caseItem.create({
      data: {
        caseId,
        kind: SUBMISSION_KIND,
        completeness: "PRESENT",
        payload: { body: responseBody, submittedAt, sourceIds: sources },
      },
      select: { id: true, payload: true, createdAt: true },
    });
  });

  return parseSubmission(row);
}

export async function hasMerchantCaseSubmission(caseId: string) {
  return Boolean(await getMerchantCaseSubmission(caseId));
}
