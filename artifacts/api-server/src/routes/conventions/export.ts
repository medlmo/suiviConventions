import { Router, type IRouter } from "express";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { finished, pipeline } from "node:stream/promises";
import { asc, sql } from "drizzle-orm";
import { db, conventionsTable, type SuiviFinancier } from "@workspace/db";
import { ListConventionsQueryParams } from "@workspace/api-zod";
import { conditionsVisibles } from "../../lib/convention-access";
import { colonnesConvention, versApi } from "../../lib/conventions-mapper";
import { EXPORT_MAX_ROWS, ExportExcelError, genererExcelConventions } from "../../lib/conventions-excel";
import { recordRequestFailure } from "../../lib/http-logging";
import { chargerReferentiel } from "../../lib/reference-data";
import { construireFiltres, construireTri } from "./requetes";

const router: IRouter = Router();
const BATCH_SIZE = 50;
// Plafond par instance, non par utilisateur : un autre compte ne le contourne pas.
let exportEnCours = false;

// Ne pas charger les historiques/JSON qui ne figurent dans aucune colonne Excel.
const projectionExport = {
  ...colonnesConvention,
  documents: sql<[]>`'[]'::jsonb`,
  suiviFinancier: sql<SuiviFinancier>`'{"annees":[],"lignes":[]}'::jsonb`,
  situationVersements: sql<[]>`'[]'::jsonb`,
  avancementPhysiqueHistorique: sql<[]>`'[]'::jsonb`,
};

/** Téléchargement hors codegen, avec les mêmes filtres et droits que la liste. */
router.get("/conventions/export", async (req, res): Promise<void> => {
  const partenaires = req.query.partenaires;
  const query = ListConventionsQueryParams.safeParse({
    ...req.query,
    partenaires: partenaires === undefined ? undefined : Array.isArray(partenaires) ? partenaires : [partenaires],
  });
  if (!query.success) {
    res.status(400).json({ error: "Paramètres de recherche invalides." });
    return;
  }
  if (exportEnCours) {
    res.setHeader("Retry-After", "5");
    res.status(429).json({ error: "Un export est déjà en cours. Réessayez dans quelques instants." });
    return;
  }
  exportEnCours = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new ExportExcelError("L'export a dépassé le délai autorisé. Précisez les filtres.", 408)), 120_000);
  timeout.unref();
  const disconnect = () => { if (!res.writableFinished) controller.abort(); };
  res.on("close", disconnect);
  let directory: string | undefined;
  try {
    const { tri = "urgence", ordre = "asc", ...filtres } = query.data;
    const reference = await chargerReferentiel();
    const where = conditionsVisibles(req.user!, reference, construireFiltres(filtres));
    directory = await mkdtemp(join(tmpdir(), "conventions-export-"));
    const path = join(directory, "conventions.xlsx");
    // L'instantané empêche doublons/omissions lors d'éditions pendant l'export.
    await db.transaction(async tx => {
      await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
      const ids = await tx.select({ id: conventionsTable.id }).from(conventionsTable)
        .where(where).limit(EXPORT_MAX_ROWS + 1);
      if (ids.length > EXPORT_MAX_ROWS) {
        throw new ExportExcelError("L'export est limité à 5 000 conventions. Précisez les filtres puis réessayez.");
      }
      async function* chargerLots() {
        for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
          controller.signal.throwIfAborted();
          const lot = await tx.select(projectionExport).from(conventionsTable).where(where)
            .orderBy(...construireTri(tri, ordre), asc(conventionsTable.id))
            .limit(BATCH_SIZE).offset(offset);
          yield lot.map(versApi);
        }
      }
      const output = createWriteStream(path, { mode: 0o600 });
      // Un échec avant la création du WorkbookWriter doit aussi fermer le fichier.
      let diskError: Error | undefined;
      output.on("error", error => { diskError = error; });
      try {
        await genererExcelConventions(chargerLots, output, controller.signal);
        if (diskError) throw diskError;
      } finally {
        output.destroy();
        await finished(output).catch(() => {});
      }
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    controller.signal.throwIfAborted();
    const fichier = await stat(path);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="conventions-${new Date().toISOString().slice(0, 10)}.xlsx"`);
    res.setHeader("Content-Length", fichier.size);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "private, no-store");
    // Le fichier est temporaire : aucun buffer contenant le classeur complet.
    await pipeline(createReadStream(path), res, { signal: controller.signal });
  } catch (error) {
    if (res.destroyed) return;
    const cause = controller.signal.aborted ? controller.signal.reason : error;
    const status = cause instanceof ExportExcelError ? cause.status : 500;
    recordRequestFailure(res, cause, {
      event: "document.generate.failed", operation: "document.generate", status,
      errorCode: status === 500 ? "INTERNAL_ERROR" : "REQUEST_REJECTED",
    });
    if (res.headersSent) res.destroy();
    else {
      res.removeHeader("Content-Length");
      res.removeHeader("Content-Disposition");
      res.removeHeader("Content-Type");
      res.status(status).json({
        error: cause instanceof ExportExcelError ? cause.message : "L'export n'a pas pu être généré. Réessayez.",
      });
    }
  } finally {
    clearTimeout(timeout);
    res.removeListener("close", disconnect);
    if (directory) {
      await rm(directory, { recursive: true, force: true }).catch(error => {
        req.log.warn({ event: "conventions.export.cleanup.failed", errorType: error instanceof Error ? error.name : "Unknown" }, "Export temporary file cleanup failed");
      });
    }
    exportEnCours = false;
  }
});

export default router;
