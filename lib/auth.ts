import { createHmac, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { cookies } from "next/headers";
import { OWNER_SESSION_COOKIE, OWNER_SESSION_TTL_SECONDS } from "@/lib/auth-constants";

const scrypt = promisify(scryptCallback);
type Session = { email: string; expiresAt: number };

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) throw new Error("SESSION_SECRET must contain at least 32 bytes.");
  return secret;
}

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function verifyPassword(password: string, passwordHash: string) {
  const [scheme, salt, expected] = passwordHash.split(":");
  if (scheme !== "scrypt_v1" || !salt || !/^[a-f\d]{128}$/i.test(expected ?? "")) return false;
  const actual = (await scrypt(password, Buffer.from(salt, "base64url"), 64)) as Buffer;
  return secureEqual(actual.toString("hex"), expected.toLowerCase());
}

export function isOwnerLoginConfigured() {
  return Boolean(process.env.OWNER_EMAIL?.trim() && process.env.OWNER_PASSWORD_HASH && process.env.SESSION_SECRET && Buffer.byteLength(process.env.SESSION_SECRET) >= 32);
}

export async function authenticateOwner(email: string, password: string) {
  const configuredEmail = process.env.OWNER_EMAIL?.trim().toLowerCase();
  const configuredHash = process.env.OWNER_PASSWORD_HASH;
  if (!isOwnerLoginConfigured() || !configuredEmail || !configuredHash) return false;
  const emailMatches = secureEqual(email.trim().toLowerCase(), configuredEmail);
  const passwordMatches = await verifyPassword(password, configuredHash);
  return emailMatches && passwordMatches;
}

function signature(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createOwnerSession(email: string) {
  const value: Session = { email: email.trim().toLowerCase(), expiresAt: Math.floor(Date.now() / 1000) + OWNER_SESSION_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${payload}.${signature(payload)}`;
}

export function verifyOwnerSession(token: string | undefined): Session | null {
  if (!token) return null;
  try {
    const [payload, suppliedSignature, extra] = token.split(".");
    if (!payload || !suppliedSignature || extra) return null;
    if (!secureEqual(signature(payload), suppliedSignature)) return null;
    const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<Session>;
    if (typeof value.email !== "string" || typeof value.expiresAt !== "number" || value.expiresAt <= Date.now() / 1000) return null;
    return { email: value.email, expiresAt: value.expiresAt };
  } catch {
    return null;
  }
}

export async function getOwnerSession() {
  const cookieStore = await cookies();
  return verifyOwnerSession(cookieStore.get(OWNER_SESSION_COOKIE)?.value);
}

export async function hasOwnerSession() {
  return Boolean(await getOwnerSession());
}

export function connectorSecretMatches(value: string | null) {
  const configured = process.env.CONNECTOR_SHARED_SECRET;
  if (!configured || !value) return false;
  return secureEqual(value, configured);
}

export function verifyRequestOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; }
  catch { return false; }
}
