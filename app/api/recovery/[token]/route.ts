import { NextResponse } from "next/server";
import { createRecoveryOrder, getRecoveryOrder, verifyRecoveryToken } from "@/lib/winback";

type Context = { params: Promise<{ token: string }> };
export async function GET(_request: Request, { params }: Context) {
  const { token } = await params;
  const verified = verifyRecoveryToken(token);
  if (!verified) return NextResponse.json({ error: "This simulated recovery link is invalid or expired." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const order = await getRecoveryOrder(verified.caseId);
    if (!order || order.status !== "FAILED") return NextResponse.json({ error: "This recovery link is no longer available for checkout." }, { status: 410 });
    return NextResponse.json({ ...order, expiresAt: new Date(verified.expiresAt).toISOString(), simulated: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ error: "The recovery order could not be loaded." }, { status: 500 }); }
}

export async function POST(_request: Request, { params }: Context) {
  const { token } = await params;
  const verified = verifyRecoveryToken(token);
  if (!verified) return NextResponse.json({ error: "This simulated recovery link is invalid or expired." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  try {
    const order = await createRecoveryOrder(token, verified.caseId);
    if (!order) return NextResponse.json({ error: "This recovery link is no longer available for checkout." }, { status: 410 });
    const { customerToken, ...publicOrder } = order;
    const response = NextResponse.json({ ...publicOrder, simulated: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set(`payproof_order_${order.id}`, customerToken, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 60 * 60 * 24 });
    return response;
  } catch { return NextResponse.json({ error: "A simulated recovery checkout could not be started." }, { status: 400 }); }
}
