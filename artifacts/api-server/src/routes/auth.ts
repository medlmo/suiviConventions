import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "@workspace/db";
import { LoginBody } from "@workspace/api-zod";
import {
  creerSession,
  estRole,
  sessionMiddleware,
  supprimerCookie,
  verifyPassword,
  versUtilisateur,
} from "../lib/auth";
import {
  reserveLoginAttempt, reserveLoginVerification, resetLoginAttempts,
} from "../lib/login-rate-limit";

const router: IRouter = Router();

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Identifiant et mot de passe requis." });
    return;
  }
  const username = parsed.data.username.trim();
  const ip = req.ip || "unknown";
  const retryAfter = reserveLoginAttempt(username, ip);
  if (retryAfter > 0) {
    res.setHeader("Retry-After", String(retryAfter));
    res.status(429).json({ error: "Trop de tentatives depuis cette adresse. Réessayez ultérieurement." });
    return;
  }
  const releaseVerification = reserveLoginVerification();
  if (!releaseVerification) {
    res.setHeader("Retry-After", "1");
    res.status(429).json({ error: "Le service de connexion est occupé. Réessayez dans quelques instants." });
    return;
  }
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.username, username)).limit(1);
    const valide = await verifyPassword(parsed.data.password, user?.passwordHash);
    if (!user || !user.active || !valide || !estRole(user.role)) {
      res.status(401).json({ error: "Identifiant ou mot de passe invalide." });
      return;
    }
    await creerSession(user.id, req, res);
    resetLoginAttempts(username, ip);
    res.json(versUtilisateur(user));
  } finally {
    releaseVerification();
  }
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