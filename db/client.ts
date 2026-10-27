import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "@prisma/client";

const globalDb = globalThis as typeof globalThis & { payproofPrisma?: PrismaClient };

export function getDatabase(): PrismaClient | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  if (!globalDb.payproofPrisma) {
    globalDb.payproofPrisma = new PrismaClient({ adapter: new PrismaNeon({ connectionString }) });
  }
  return globalDb.payproofPrisma;
}

export async function closeDatabase() {
  await globalDb.payproofPrisma?.$disconnect();
  globalDb.payproofPrisma = undefined;
}
