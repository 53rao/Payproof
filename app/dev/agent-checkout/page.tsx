import { notFound } from "next/navigation";
import AgentCheckoutClient from "./AgentCheckoutClient";

export const dynamic = "force-dynamic";

export default function AgentCheckoutPage() {
  if (process.env.NODE_ENV !== "development") notFound();
  return <AgentCheckoutClient/>;
}
