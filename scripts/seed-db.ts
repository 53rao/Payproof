import { loadEnvConfig } from "@next/env";
import { closeDatabase } from "@/db/client";
import { seedDatabase } from "@/lib/database-demo-store";

loadEnvConfig(process.cwd());

seedDatabase()
  .then((result) => {
    console.log(`Seeded/verified fictional demo data: ${result.seededProducts} catalog products.`);
    for (const [table, count] of Object.entries(result.counts)) console.log(`  ${table}: ${count}`);
  })
  .catch((error: unknown) => { console.error(error); process.exitCode = 1; })
  .finally(() => closeDatabase());
