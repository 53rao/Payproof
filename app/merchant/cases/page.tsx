import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/**
 * Cases live inside the merchant dashboard. Keep the old route working by
 * sending merchants (and bookmarks) back to the embedded case board.
 */
export default async function MerchantCasesRedirect({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") query.set(key, value);
  }
  const suffix = query.size ? `?${query.toString()}` : "";
  redirect(`/merchant${suffix}`);
}
