import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { connectorSecretMatches } from "@/lib/auth";
import { getDatabase } from "@/db/client";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const statuses = new Set(["PENDING", "PROCESSING", "PAID", "FAILED", "COMPLETED", "DECLINED", "REFUNDED"]);

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1] ?? null;
  if (!connectorSecretMatches(bearer)) return NextResponse.json({ error: "Connector credentials were not accepted." }, { status: 401 });
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "The connector requires persistent database storage." }, { status: 503 });
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 16_384) return NextResponse.json({ error: "Connector events must be smaller than 16 KB." }, { status: 413 });
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) return NextResponse.json({ error: "Send connector events as JSON." }, { status: 415 });

  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object") return NextResponse.json({ error: "Invalid connector event." }, { status: 400 });
    const event = body as Record<string, unknown>;
    if (typeof event.eventId !== "string" || !uuid.test(event.eventId) || typeof event.orderId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(event.orderId)) return NextResponse.json({ error: "A UUID eventId and valid orderId are required." }, { status: 400 });
    if (event.type !== "ORDER_EVENT" && event.type !== "PAYMENT_EVENT") return NextResponse.json({ error: "type must be ORDER_EVENT or PAYMENT_EVENT." }, { status: 400 });
    if (event.status !== undefined && (typeof event.status !== "string" || !statuses.has(event.status))) return NextResponse.json({ error: "status is not supported." }, { status: 400 });
    if (event.issue !== undefined && (typeof event.issue !== "string" || event.issue.length > 160)) return NextResponse.json({ error: "issue must be 160 characters or fewer." }, { status: 400 });
    if (event.debugId !== undefined && (typeof event.debugId !== "string" || event.debugId.length > 160)) return NextResponse.json({ error: "debugId must be 160 characters or fewer." }, { status: 400 });
    const createdAt = event.occurredAt === undefined ? new Date() : new Date(String(event.occurredAt));
    if (!Number.isFinite(createdAt.getTime())) return NextResponse.json({ error: "occurredAt must be a valid date." }, { status: 400 });

    const db = getDatabase();
    if (!db) return NextResponse.json({ error: "The connector requires persistent database storage." }, { status: 503 });
    const order = await db.order.findUnique({ where: { id: event.orderId }, select: { id: true } });
    if (!order) return NextResponse.json({ error: "The referenced order was not found." }, { status: 404 });
    await db.paymentEvent.create({
      data: {
        id: event.eventId,
        orderId: order.id,
        type: `CONNECTOR_${event.type}`,
        paymentStatus: typeof event.status === "string" ? event.status : null,
        issue: typeof event.issue === "string" ? event.issue : null,
        debugId: typeof event.debugId === "string" ? event.debugId : null,
        rawJson: { source: "merchant_connector", eventId: event.eventId },
        simulated: true,
        createdAt,
      },
    });
    return NextResponse.json({ accepted: true, eventId: event.eventId, simulated: true }, { status: 202, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ accepted: true, duplicate: true }, { status: 200, headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ error: "Could not store connector event." }, { status: 400 });
  }
}
