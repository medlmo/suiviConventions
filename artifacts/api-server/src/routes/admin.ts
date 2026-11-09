import { Router, type IRouter } from "express";
import auditRouter from "./admin/audit";
import referenceDataRouter from "./admin/reference-data";
import usersRouter from "./admin/users";

const router: IRouter = Router();

router.use(usersRouter);
router.use(referenceDataRouter);
router.use(auditRouter);

export default router;
