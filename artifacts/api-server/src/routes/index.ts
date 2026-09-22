import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conventionsRouter from "./conventions";

const router: IRouter = Router();

router.use(healthRouter);
router.use(conventionsRouter);

export default router;
