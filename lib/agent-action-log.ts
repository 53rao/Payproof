import "server-only";
import type { Prisma } from "@prisma/client";
import { getDatabase } from "@/db/client";

export type AgentActionType = "RESERVATION_RELEASED" | "CASE_ESCALATED" | "RECOVERY_SUPPRESSED";

export async function logAgentAction(
  type: AgentActionType,
  merchantId: string,
  detail: string,
  transaction?: Prisma.TransactionClient,
) {
  const client = transaction ?? getDatabase();
  if (!client) return null;
  return client.agentActionLog.create({ data: { type, merchantId, detail } });
}

export async function getRecentAgentActions(limit = 20) {
  const db = getDatabase();
  if (!db) return [];
  const take = Math.max(1, Math.min(100, Math.floor(limit)));
  const entries = await db.agentActionLog.findMany({
    take,
    orderBy: { createdAt: "desc" },
    include: { merchant: { select: { id: true, name: true } } },
  });
  return entries.map(({ merchant, ...entry }) => ({ ...entry, merchantId: merchant.id, merchantName: merchant.name }));
}
