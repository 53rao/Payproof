import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth";
import CasesListClient from "./CasesListClient";

export const dynamic = "force-dynamic";
export default async function OwnerCasesPage() {
  try { if (!await getOwnerSession()) redirect("/login?next=%2Fowner%2Fcases"); }
  catch { redirect("/login?next=%2Fowner%2Fcases"); }
  return <CasesListClient/>;
}
