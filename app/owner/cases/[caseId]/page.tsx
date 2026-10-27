import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth";
import CaseDetailClient from "./CaseDetailClient";

export const dynamic = "force-dynamic";
export default async function OwnerCaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  try { if (!await getOwnerSession()) redirect("/login?next=%2Fowner%2Fcases"); }
  catch { redirect("/login?next=%2Fowner%2Fcases"); }
  const { caseId } = await params;
  return <CaseDetailClient caseId={caseId}/>;
}
