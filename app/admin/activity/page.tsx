import { redirect } from "next/navigation";
import { getOwnerSession } from "@/lib/auth";
import OrderActivityClient from "./OrderActivityClient";

export const dynamic = "force-dynamic";

export default async function AdminActivityPage() {
  try {
    if (!await getOwnerSession()) {
      redirect("/login?next=%2Fadmin%2Factivity");
    }
  } catch {
    redirect("/login?next=%2Fadmin%2Factivity");
  }

  return <OrderActivityClient />;
}
