import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import {
  authRequired,
  creerSession,
  estRole,
  estRateLimited,
  hashPassword,
  reinitialiserTentatives,
  sessionMiddleware,
  supprimerCookie,
  verifyPassword,
  versUtilisateur,
} from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Identifiant et mot de passe requis." });
    return;
  }
  const username = parsed.data.username.trim();
  const ip = req.ip || "unknown";
  if (estRateLimited(username, ip)) {
    res.status(429).json({ error: "Trop de tentatives. Réessayez dans quelques minutes." });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
  const valide = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
  if (!user || !user.active || !valide || !estRole(user.role)) {
    res.status(401).json({ error: "Identifiant ou mot de passe invalide." });
    return;
  }
  reinitialiserTentatives(username, ip);
  await creerSession(user.id, req, res);
  res.json(versUtilisateur(user));
});

router.get("/auth/me", sessionMiddleware, (req, res): void => {
  res.json(req.user);
});

router.post("/auth/logout", sessionMiddleware, async (req, res): Promise<void> => {
  if (req.sessionId !== undefined) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, req.sessionId));
  }
  supprimerCookie(req, res);
  res.sendStatus(204);
});

export default router;