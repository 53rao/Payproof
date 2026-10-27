import { randomUUID } from "node:crypto";
import { getDatabase } from "@/db/client";

type MerchantCaseNote = { id: string; caseId: string; text: string; createdAt: string };
const runtime = globalThis as typeof globalThis & { payproofMerchantCaseNotes?: MerchantCaseNote[] };
const notes = () => runtime.payproofMerchantCaseNotes ??= [];

export async function addMerchantCaseNote(caseId: string, text: string) {
  const db = getDatabase();
  if (db) {
    if (!await db.case.findUnique({ where: { id: caseId }, select: { id: true } })) return null;
    const row = await db.caseItem.create({ data: { caseId, kind: "merchant_note", completeness: "PRESENT", payload: { originalText: text } }, select: { id: true, createdAt: true } });
    return { id: row.id, caseId, text, createdAt: row.createdAt.toISOString() } satisfies MerchantCaseNote;
  }
  const { getDemoState } = await import("@/lib/demo-store");
  const state = await getDemoState();
  if (!state.cases.some((item) => item.id === caseId)) return null;
  const note = { id: randomUUID(), caseId, text, createdAt: new Date().toISOString() };
  notes().push(note);
  return note;
}

export function getMemoryMerchantCaseNotes(caseId: string) {
  return notes().filter((note) => note.caseId === caseId);
}
