import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt } from "drizzle-orm";
import { db, sessionsTable, usersTable, type AppUser } from "@workspace/db";

const scrypt = promisify(scryptCallback);
export const COOKIE_NAME = "region_session";
const SESSION_DAYS = 14;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 8;

export type Role = "admin" | "directeur" | "chef_division" | "chef_service";
export type SessionUser = Pick<AppUser, "id" | "username" | "role" | "direction" | "division" | "service" | "active">;

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionId?: number;
    }
  }
}

const attempts = new Map<string, { count: number; expires: number }>();

export function estRole(role: string): role is Role {
  return ["admin", "directeur", "chef_division", "chef_service"].includes(role);
}

export function versUtilisateur(user: AppUser): SessionUser {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    direction: user.direction,
    division: user.division,
    service: user.service,
    active: user.active,
  };
}

async function derivePassword(password: string, salt = randomBytes(16)): Promise<string> {
  const key = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function hashPassword(password: string): Promise<string> {
  return derivePassword(password);
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, saltHex, expectedHex] = encoded.split("$");
  if (algorithm !== "scrypt" || !saltHex || !expectedHex) return false;
  const expected = Buffer.from(expectedHex, "hex");
  const actual = (await scrypt(password, Buffer.from(saltHex, "hex"), expected.length)) as Buffer;
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function bootstrapAdmin(): Promise<void> {
  const existing = await db.select({ value: usersTable.id }).from(usersTable).limit(1);
  if (existing.length > 0) return;
  const password = process.env.INITIAL_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "Aucun compte administrateur n'existe. Configurez le secret INITIAL_ADMIN_PASSWORD pour créer le compte initial, puis redémarrez le serveur.",
    );
  }
  if (password.length < 12) {
    throw new Error("INITIAL_ADMIN_PASSWORD doit contenir au moins 12 caractères.");
  }
  await db.insert(usersTable).values({
    username: "admin",
    passwordHash: await hashPassword(password),
    role: "admin",
    active: true,
  }).onConflictDoNothing({ target: usersTable.username });
}

export async function creerSession(userId: number, req: Request, res: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(sessionsTable).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  const secure = req.secure || req.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "strict",
    secure,
    path: "/api",
    expires: expiresAt,
  });
}

export function supprimerCookie(req: Request, res: Response): void {
  const secure = req.secure || req.get("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "strict", secure, path: "/api" });
}

function cookieDu(req: Request): string | undefined {
  const cookies = req.headers.cookie?.split(";") ?? [];
  for (const cookie of cookies) {
    const separator = cookie.indexOf("=");
    if (separator < 0 || cookie.slice(0, separator).trim() !== COOKIE_NAME) continue;
    try {
      return decodeURIComponent(cookie.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export async function sessionMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = cookieDu(req);
  if (!token) {
    res.status(401).json({ error: "Authentification requise." });
    return;
  }
  const [session] = await db
    .select({ sessionId: sessionsTable.id, user: usersTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(sessionsTable.userId, usersTable.id))
    .where(and(eq(sessionsTable.tokenHash, hashToken(token)), gt(sessionsTable.expiresAt, new Date())))
    .limit(1);
  if (!session || !session.user.active || !estRole(session.user.role)) {
    res.status(401).json({ error: "Session invalide ou expirée." });
    return;
  }
  req.user = versUtilisateur(session.user);
  req.sessionId = session.sessionId;
  next();
}

export function authRequired(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentification requise." });
    return;
  }
  next();
}

export function adminRequired(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== "admin") {
    res.status(req.user ? 403 : 401).json({ error: "Accès réservé à l'administrateur." });
    return;
  }
  next();
}

export function estRateLimited(username: string, ip: string): boolean {
  const now = Date.now();
  const key = `${username.toLocaleLowerCase("fr-FR")}:${ip}`;
  const current = attempts.get(key);
  if (!current || current.expires <= now) {
    attempts.set(key, { count: 1, expires: now + ATTEMPT_WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > MAX_ATTEMPTS;
}

export function reinitialiserTentatives(username: string, ip: string): void {
  attempts.delete(`${username.toLocaleLowerCase("fr-FR")}:${ip}`);
}

export function csrfOriginGuard(req: Request, res: Response, next: NextFunction): void {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) {
    next();
    return;
  }
  const origin = req.get("origin");
  // Origin is compared with the Host received for this request. Never let an
  // untrusted X-Forwarded-Host header choose the allowed browser origin.
  const expectedHost = req.get("host");
  if (!origin || !expectedHost) {
    res.status(403).json({ error: "Origine de requête absente ou non autorisée." });
    return;
  }
  try {
    const parsed = new URL(origin);
    const canonicalHost = new URL(`${parsed.protocol}//${expectedHost}`);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.origin !== origin ||
      canonicalHost.username !== "" ||
      canonicalHost.password !== "" ||
      canonicalHost.pathname !== "/" ||
      canonicalHost.search !== "" ||
      canonicalHost.hash !== "" ||
      parsed.host.toLowerCase() !== canonicalHost.host.toLowerCase()
    ) {
      res.status(403).json({ error: "Origine de requête absente ou non autorisée." });
      return;
    }
  } catch {
    res.status(403).json({ error: "Origine de requête absente ou non autorisée." });
    return;
  }
  next();
}