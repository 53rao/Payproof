import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth";
import CasesListClient from "../../owner/cases/CasesListClient";

export const dynamic = "force-dynamic";

export default async function AdminCasesPage() {
  try {
    if (!await getOwnerSession()) redirect("/login?next=%2Fadmin%2Fcases");
  } catch {
    redirect("/login?next=%2Fadmin%2Fcases");
  }
  return <CasesListClient mode="admin" />;
}
