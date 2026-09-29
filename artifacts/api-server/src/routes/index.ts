import { Router, type IRouter } from "express";
import healthRouter from "./health";
import conventionsRouter from "./conventions";
import authRouter from "./auth";
import adminRouter from "./admin";
import storageRouter from "./storage";
import { sessionMiddleware } from "../lib/auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(sessionMiddleware);
router.use(storageRouter);
router.use(conventionsRouter);
router.use(adminRouter);

export default router;
