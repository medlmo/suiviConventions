import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, lte } from "drizzle-orm";
import { db, sessionsTable, usersTable, type AppUser } from "@workspace/db";

const scrypt = promisify(scryptCallback);
export const COOKIE_NAME = "region_session";
const SESSION_HOURS = 24;
const LOGIN_LIMITS = {
  account: { windowMs: 30 * 60 * 1000, maxFailures: 12 },
  ip: { windowMs: 15 * 60 * 1000, maxFailures: 40 },
} as const;
const MAX_TRACKED_KEYS_PER_LIMIT = 20_000;
const ATTEMPT_CLEANUP_INTERVAL_MS = 60 * 1000;

export type Role = "admin" | "directeur" | "directeur_general_services" | "chef_division" | "chef_service";
export type SessionUser = Pick<AppUser, "id" | "username" | "role" | "direction" | "division" | "service" | "active">;

declare global {
  namespace Express {
    interface Request {
      user?: SessionUser;
      sessionId?: number;
    }
  }
}

type FailedLoginWindow = { count: number; expiresAt: number };

const failedLoginsByAccount = new Map<string, FailedLoginWindow>();
const failedLoginsByIp = new Map<string, FailedLoginWindow>();

function supprimerFenêtresExpirées(
  fenêtres: Map<string, FailedLoginWindow>,
  maintenant: number,
): void {
  for (const [clé, fenêtre] of fenêtres) {
    if (fenêtre.expiresAt <= maintenant) fenêtres.delete(clé);
  }
}

const nettoyageTentatives = setInterval(() => {
  const maintenant = Date.now();
  supprimerFenêtresExpirées(failedLoginsByAccount, maintenant);
  supprimerFenêtresExpirées(failedLoginsByIp, maintenant);
}, ATTEMPT_CLEANUP_INTERVAL_MS);
nettoyageTentatives.unref();

function cleCompte(username: string): string {
  return username.trim().toLocaleLowerCase("fr-FR");
}

function enregistrerEchec(
  fenêtres: Map<string, FailedLoginWindow>,
  clé: string,
  durée: number,
  maintenant: number,
): void {
  const actuelle = fenêtres.get(clé);
  if (actuelle && actuelle.expiresAt > maintenant) {
    actuelle.count += 1;
    // Keep recently active keys at the end so capacity eviction is O(1).
    fenêtres.delete(clé);
    fenêtres.set(clé, actuelle);
    return;
  }
  if (actuelle) fenêtres.delete(clé);
  if (fenêtres.size >= MAX_TRACKED_KEYS_PER_LIMIT) {
    const plusAncienne = fenêtres.keys().next().value;
    if (plusAncienne !== undefined) fenêtres.delete(plusAncienne);
  }
  fenêtres.set(clé, { count: 1, expiresAt: maintenant + durée });
}

function fenêtreBloquée(
  fenêtres: Map<string, FailedLoginWindow>,
  clé: string,
  seuil: number,
  maintenant: number,
): boolean {
  const fenêtre = fenêtres.get(clé);
  if (!fenêtre) return false;
  if (fenêtre.expiresAt <= maintenant) {
    fenêtres.delete(clé);
    return false;
  }
  return fenêtre.count >= seuil;
}

export function estRole(role: string): role is Role {
  return ["admin", "directeur", "directeur_general_services", "chef_division", "chef_service"].includes(role);
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
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD;
  if (!password) {
    throw new Error(
      "Aucun compte administrateur n'existe. Configurez le secret ADMIN_BOOTSTRAP_PASSWORD pour créer le compte initial, puis redémarrez le serveur.",
    );
  }
  if (password.length < 8) {
    throw new Error("Le mot de passe initial de l'administrateur doit contenir au moins 8 caractères.");
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
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await db.transaction(async (tx) => {
    await tx.insert(sessionsTable).values({
      userId,
      tokenHash: hashToken(token),
      expiresAt,
    });
    await tx.update(usersTable)
      .set({ lastLoginAt: new Date() })
      .where(eq(usersTable.id, userId));
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

export async function nettoyerSessionsExpirees(): Promise<number> {
  const supprimees = await db
    .delete(sessionsTable)
    .where(lte(sessionsTable.expiresAt, new Date()))
    .returning({ id: sessionsTable.id });
  return supprimees.length;
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
  const maintenant = Date.now();
  return fenêtreBloquée(
    failedLoginsByAccount,
    cleCompte(username),
    LOGIN_LIMITS.account.maxFailures,
    maintenant,
  ) || fenêtreBloquée(
    failedLoginsByIp,
    ip.trim().toLowerCase() || "unknown",
    LOGIN_LIMITS.ip.maxFailures,
    maintenant,
  );
}

export function enregistrerEchecConnexion(username: string, ip: string): void {
  const maintenant = Date.now();
  enregistrerEchec(
    failedLoginsByAccount,
    cleCompte(username),
    LOGIN_LIMITS.account.windowMs,
    maintenant,
  );
  enregistrerEchec(
    failedLoginsByIp,
    ip.trim().toLowerCase() || "unknown",
    LOGIN_LIMITS.ip.windowMs,
    maintenant,
  );
}

export function reinitialiserTentatives(username: string): void {
  // Successful authentication clears only this account's failures; it must not
  // erase failures contributed by other accounts behind the same IP address.
  failedLoginsByAccount.delete(cleCompte(username));
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