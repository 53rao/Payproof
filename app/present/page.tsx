import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth";
import Link from "next/link";
import "./present.css";

export const dynamic = "force-dynamic";
export default async function PresenterPage() {
  try { if (!await getOwnerSession()) redirect("/login?next=%2Fpresent"); }
  catch { redirect("/login?next=%2Fpresent"); }
  return <main className="pp-present-page"><header><Link href="/admin">PayProof <span>Split view</span></Link><p>Two synchronized demo surfaces · all payment outcomes are simulated</p><Link href="/admin?presenter=1">Open presenter controls</Link></header><section><article><div>STOREFRONT <span>SIMULATED CUSTOMER VIEW</span></div><iframe title="PayProof simulated storefront" src="/?presenter=1"/></article><article><div>MERCHANT DESK <span>SIMULATED LEDGER</span></div><iframe title="PayProof merchant console" src="/admin?presenter=1&amp;embedded=1"/></article></section></main>;
}
