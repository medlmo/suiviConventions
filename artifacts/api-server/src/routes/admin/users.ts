import { Router, type IRouter } from "express";
import { asc, count, eq, sql } from "drizzle-orm";
import { db, sessionsTable, usersTable } from "@workspace/db";
import {
  adminRequired,
  hashPassword,
  validateNewPassword,
  type Role,
  versUtilisateur,
} from "../../lib/auth";
import {
  chargerReferentiel,
  chargerReferentielDepuis,
  directionConnue,
  divisionDeDirection,
  serviceDansDivision,
  perimetreChefService,
  type ReferenceData,
} from "../../lib/reference-data";
import { postgresErrorCode } from "../../lib/database-errors";

const router: IRouter = Router();
const ROLES = ["admin", "directeur", "directeur_general_services", "chef_division", "chef_service"] as const;
type Profile = Pick<typeof usersTable.$inferInsert, "role" | "direction" | "division" | "service">;

function profileIsValid(profile: Profile, reference: ReferenceData): boolean {
  const { role, direction, division, service } = profile;
  if (!ROLES.includes(role as Role)) return false;
  if (direction !== null && direction !== undefined && !directionConnue(reference, direction)) return false;
  if (division !== null && division !== undefined && (!direction || !divisionDeDirection(reference, direction, division))) return false;
  if (role === "chef_service") return perimetreChefService(reference, profile) !== null;
  if (service !== null && service !== undefined && (!division || !serviceDansDivision(reference, division, service))) return false;
  if (role === "admin") return true;
  if (role === "directeur") return !!direction && directionConnue(reference, direction) && !division && !service;
  if (role === "directeur_general_services") return !direction && !division && !service;
  if (role === "chef_division") return !!direction && !!division && divisionDeDirection(reference, direction, division) && !service;
  return !!direction && !!division && !!service && serviceDansDivision(reference, division, service);
}

function idFrom(raw: string | string[] | undefined): number | undefined {
  const number = Number(Array.isArray(raw) ? raw[0] : raw);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function publicUser(user: typeof usersTable.$inferSelect) {
  return {
    ...versUtilisateur(user),
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
  };
}

router.get("/admin/users", adminRequired, async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(
    sql`CASE ${usersTable.role}
      WHEN 'admin' THEN 0
      WHEN 'directeur_general_services' THEN 1
      WHEN 'directeur' THEN 2
      WHEN 'chef_division' THEN 3
      WHEN 'chef_service' THEN 4
      ELSE 5
    END`,
    asc(usersTable.username),
  );
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
  if (!username || username.length > 100) {
    res.status(400).json({ error: "Identifiant invalide." });
    return;
  }
  const passwordError = validateNewPassword(body.password, username);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
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
  await chargerReferentiel();
  try {
    const passwordHash = await hashPassword(body.password);
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
      const reference = await chargerReferentielDepuis(tx);
      await tx.execute(sql`SELECT pg_advisory_xact_lock(741023, 1)`);
      if (!profileIsValid(profile, reference)) return { kind: "invalid-profile" as const };
      const [user] = await tx.insert(usersTable).values({
        username,
        passwordHash,
        ...profile,
        active: typeof body.active === "boolean" ? body.active : true,
      }).returning();
      return user ? { kind: "created" as const, user } : { kind: "missing" as const };
    });
    if (outcome.kind === "invalid-profile") {
      res.status(400).json({ error: "Le rôle et le périmètre ne correspondent pas à l'organigramme officiel." });
      return;
    }
    if (outcome.kind !== "created") {
      res.status(400).json({ error: "Le compte n'a pas pu être créé." });
      return;
    }
    res.status(201).json(publicUser(outcome.user));
  } catch (error) {
    if (postgresErrorCode(error) === "23505") {
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
    await chargerReferentiel();
    const outcome = await db.transaction(async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(741024, 1)`);
      const reference = await chargerReferentielDepuis(tx);
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
      if (!profileIsValid(profile, reference)) return { kind: "invalid-profile" as const };

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
    if (postgresErrorCode(error) === "23505") {
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
  if (!id || typeof password !== "string") {
    res.status(400).json({ error: "Identifiant ou mot de passe invalide." });
    return;
  }
  const [target] = await db.select({ username: usersTable.username }).from(usersTable).where(eq(usersTable.id, id)).limit(1);
  if (!target) {
    res.status(404).json({ error: "Compte introuvable." });
    return;
  }
  const passwordError = validateNewPassword(password, target.username);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
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

export default router;
