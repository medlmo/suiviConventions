import { Router, type IRouter } from "express";
import { detailRouter, listeRouter, optionsFiltresRouter } from "./conventions/consultation";
import dashboardRouter from "./conventions/dashboard";
import exportRouter from "./conventions/export";
import creationRouter from "./conventions/creation";
import { documentsRouter, ficheTechniqueRouter } from "./conventions/documents";
import modificationRouter from "./conventions/modification";
import suppressionRouter from "./conventions/suppression";

/**
 * Point d'entrée des routes des conventions.
 * L'authentification reste appliquée dans routes/index.ts, avant ce router.
 * Conserver cet ordre : les URL fixes (resume, export, ...) précèdent /:id.
 * Les transactions d'écriture et leurs contrôles restent dans chaque module.
 */
const router: IRouter = Router();

router.use(listeRouter);
router.use(dashboardRouter);
router.use(optionsFiltresRouter);
router.use(exportRouter);
router.use(creationRouter);
router.use(ficheTechniqueRouter);
router.use(detailRouter);
router.use(documentsRouter);
router.use(modificationRouter);
router.use(suppressionRouter);

export default router;
