import RecoveryCheckout from "./RecoveryCheckout";
import "./recovery.css";

export const dynamic = "force-dynamic";
export default async function RecoveryPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <RecoveryCheckout token={token}/>;
}
