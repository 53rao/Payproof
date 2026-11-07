import { redirect } from "next/navigation";
import { getMerchantSession, getOwnerSession } from "@/lib/auth";
import CasesListClient from "./CasesListClient";

export const dynamic = "force-dynamic";
export default async function OwnerCasesPage() {
  try {
    const isOwner = await getOwnerSession();
    const isMerchant = await getMerchantSession();
    if (!isOwner && !isMerchant) redirect("/login?next=%2Fowner%2Fcases");
  } catch {
    redirect("/login?next=%2Fowner%2Fcases");
  }
  return <CasesListClient />;
}
