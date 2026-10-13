import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import db from "../lib/db.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  try {
    db.prepare("SELECT 1").get();
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch {
    res.status(503).json({ status: "error" });
  }
});

export default router;
