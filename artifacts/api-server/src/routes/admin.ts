import { Router, type IRouter } from "express";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { db, conventionAuditTable, sessionsTable, usersTable } from "@workspace/db";
import {
  directionConnue,
  divisionDeDirection,
  serviceDansDivision,
} from "@workspace/organisation";
import {
  adminRequired,
  hashPassword,
  type Role,
  versUtilisateur,
} from "../lib/auth";

const router: IRouter = Router();
const ROLES = ["admin", "directeur", "chef_division", "chef_service"] as const;
type Profile = Pick<typeof usersTable.$inferInsert, "role" | "direction" | "division" | "service">;

function profileIsValid(profile: Profile): boolean {
  const { role, direction, division, service } = profile;
  if (!ROLES.includes(role as Role)) return false;
  if (direction !== null && direction !== undefined && !directionConnue(direction)) return false;
  if (division !== null && division !== undefined && (!direction || !divisionDeDirection(direction, division))) return false;
  if (service !== null && service !== undefined && (!division || !serviceDansDivision(division, service))) return false;
  if (role === "admin") return true;
  if (role === "directeur") return !!direction && directionConnue(direction) && !division && !service;
  if (role === "chef_division") return !!direction && !!division && divisionDeDirection(direction, division) && !service;
  return !!direction && !!division && !!service && serviceDansDivision(division, service);
}

function idFrom(raw: string | string[] | undefined): number | undefined {
  const number = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function publicUser(user: typeof usersTable.$inferSelect) {
  return { ...versUtilisateur(user), createdAt: user.createdAt.toISOString() };
}

router.get("/admin/users", adminRequired, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(asc(usersTable.username));
  res.json(users.map(publicUser));
});

router.post("/admin/users", adminRequired, async (req, res): Promise<void> => {
  const body = req.body as Record<string, unknown> | null;
  if (!body || typeof body.username !== "string" || typeof body.password !== "string" || typeof body.role !== "string") {
    res.status(400).json({ error: "Identifiant, mot de passe et rôle sont requis." });
    return;
  }
  const username = body.username.trim();
  const role = body.role as Role;
  if (!username || username.length > 100 || body.password.length < 8 || body.password.length > 1024) {
    res.status(400).json({ error: "Identifiant ou mot de passe invalide (8 caractères minimum)." });
    return;
  }
  if (
    ["direction", "division", "service"].some(
      (field) => body[field] !== undefined && body[field] !== null && typeof body[field] !== "string",
    ) ||
    (body.active !== undefined && typeof body.active !== "boolean")
  ) {
    res.status(400).json({ error: "Les champs de périmètre ou d'activation sont invalides." });
    return;
  }
  const profile = {
    role,
    direction: typeof body.direction === "string" ? body.direction : null,
    division: typeof body.division === "string" ? body.division : null,
    service: typeof body.service === "string" ? body.service : null,
  };
  if (!profileIsValid(profile)) {
    res.status(400).json({ error: "Le rôle et le périmètre ne correspondent pas à l'organigramme officiel." });
    return;
  }
  try {
    const passwordHash = await hashPassword(body.password);
    const [user] = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(741023, 1)`);
      return tx.insert(usersTable).values({
        username,
        passwordHash,
        ...profile,
        active: typeof body.active === "boolean" ? body.active : true,
      }).returning();
    });
    res.status(201).json(publicUser(user!));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Cet identifiant existe déjà." });
      return;
    }
    throw error;
  }
});

router.patch("/admin/users/:id", adminRequired, async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  const body = req.body as Record<string, unknown> | null;
  if (!id || !body || Array.isArray(body)) {
    res.status(400).json({ error: "Paramètres ou corps invalides." });
    return;
  }
  const allowed = new Set(["username", "role", "direction", "division", "service", "active"]);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    res.status(400).json({ error: "Champ non autorisé." });
    return;
  }
  if (body.username !== undefined) {
    if (typeof body.username !== "string" || !body.username.trim() || body.username.trim().length > 100) {
      res.status(400).json({ error: "Identifiant invalide." });
      return;
    }
  }
  if (body.active !== undefined) {
    if (typeof body.active !== "boolean") {
      res.status(400).json({ error: "Le statut actif doit être booléen." });
      return;
    }
  }
  if (body.role !== undefined && typeof body.role !== "string") {
    res.status(400).json({ error: "Rôle invalide." });
    return;
  }
  if (
    ["direction", "division", "service"].some(
      (field) => body[field] !== undefined && body[field] !== null && typeof body[field] !== "string",
    )
  ) {
    res.status(400).json({ error: "Périmètre invalide." });
    return;
  }
  try {
    const outcome = await db.transaction(async (tx) => {
      // Serialize account changes so parallel admin requests cannot each
      // believe they are leaving another active administrator behind.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(741023, 1)`);
      const [current] = await tx.select().from(usersTable)
        .where(eq(usersTable.id, id))
        .for("update");
      if (!current) return { kind: "missing" as const };

      const profile: Profile = {
        role: (body.role ?? current.role) as Role,
        direction: (body.direction === undefined ? current.direction : body.direction) as string | null,
        division: (body.division === undefined ? current.division : body.division) as string | null,
        service: (body.service === undefined ? current.service : body.service) as string | null,
      };
      if (!profileIsValid(profile)) return { kind: "invalid-profile" as const };

      const nextActive = body.active === undefined ? current.active : body.active as boolean;
      const willRemainActiveAdmin = profile.role === "admin" && nextActive;
      if (current.role === "admin" && current.active && !willRemainActiveAdmin) {
        const [activeAdmins] = await tx.select({ total: count() }).from(usersTable)
          .where(sql`${usersTable.role} = 'admin' AND ${usersTable.active} = TRUE`);
        if ((activeAdmins?.total ?? 0) <= 1) return { kind: "last-admin" as const };
      }

      const patch: Partial<typeof usersTable.$inferInsert> = { ...profile, updatedAt: new Date() };
      if (typeof body.username === "string") patch.username = body.username.trim();
      if (typeof body.active === "boolean") patch.active = body.active;
      const [updated] = await tx.update(usersTable).set(patch)
        .where(eq(usersTable.id, id))
        .returning();
      if (!updated) return { kind: "missing" as const };
      if (
        body.active === false || body.role !== undefined ||
        body.direction !== undefined || body.division !== undefined || body.service !== undefined
      ) {
        await tx.delete(sessionsTable).where(eq(sessionsTable.userId, id));
      }
      return { kind: "updated" as const, user: updated };
    });
    if (outcome.kind === "missing") {
      res.status(404).json({ error: "Compte introuvable." });
      return;
    }
    if (outcome.kind === "invalid-profile") {
      res.status(400).json({ error: "Le rôle et le périmètre ne correspondent pas à l'organigramme officiel." });
      return;
    }
    if (outcome.kind === "last-admin") {
      res.status(409).json({ error: "Impossible de désactiver ou rétrograder le dernier administrateur actif." });
      return;
    }
    res.json(publicUser(outcome.user));
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "Cet identifiant existe déjà." });
      return;
    }
    throw error;
  }
});

router.delete("/admin/users/:id", adminRequired, async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  if (!id) {
    res.status(400).json({ error: "Identifiant de compte invalide." });
    return;
  }

  const outcome = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(741023, 1)`);
    const [user] = await tx.select().from(usersTable)
      .where(eq(usersTable.id, id))
      .for("update");
    if (!user) return "missing" as const;
    if (user.role === "admin") return "admin" as const;

    await tx.delete(sessionsTable).where(eq(sessionsTable.userId, id));
    const [deleted] = await tx.delete(usersTable)
      .where(eq(usersTable.id, id))
      .returning({ id: usersTable.id });
    return deleted ? "deleted" as const : "missing" as const;
  });

  if (outcome === "missing") {
    res.status(404).json({ error: "Compte introuvable." });
    return;
  }
  if (outcome === "admin") {
    res.status(403).json({ error: "Un compte administrateur ne peut pas être supprimé." });
    return;
  }
  res.sendStatus(204);
});

router.post("/admin/users/:id/password", adminRequired, async (req, res): Promise<void> => {
  const id = idFrom(req.params.id);
  const password = (req.body as { password?: unknown } | null)?.password;
  if (!id || typeof password !== "string" || password.length < 8 || password.length > 1024) {
    res.status(400).json({ error: "Mot de passe invalide (8 caractères minimum)." });
    return;
  }
  const [user] = await db.update(usersTable).set({
    passwordHash: await hashPassword(password),
    updatedAt: new Date(),
  }).where(eq(usersTable.id, id)).returning({ id: usersTable.id });
  if (!user) {
    res.status(404).json({ error: "Compte introuvable." });
    return;
  }
  await db.delete(sessionsTable).where(eq(sessionsTable.userId, id));
  res.sendStatus(204);
});

router.get("/admin/audit", adminRequired, async (req, res): Promise<void> => {
  const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
  const offset = req.query.offset === undefined ? 0 : Number(req.query.offset);
  const conventionId = req.query.conventionId === undefined ? undefined : Number(req.query.conventionId);
  if (
    !Number.isInteger(limit) || limit < 1 || limit > 200 ||
    !Number.isInteger(offset) || offset < 0 ||
    (conventionId !== undefined && (!Number.isInteger(conventionId) || conventionId < 1))
  ) {
    res.status(400).json({ error: "Paramètres de pagination invalides." });
    return;
  }
  const where = conventionId === undefined ? undefined : eq(conventionAuditTable.conventionId, conventionId);
  const [items, [result]] = await Promise.all([
    db.select().from(conventionAuditTable).where(where)
      .orderBy(desc(conventionAuditTable.createdAt), desc(conventionAuditTable.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(conventionAuditTable).where(where),
  ]);
  res.json({ items, total: result?.total ?? 0 });
});

export default router;