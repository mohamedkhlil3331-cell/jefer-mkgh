import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { queryOne } from "../lib/erp-sql.js";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    await queryOne("SELECT 1");
    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch {
    res.status(503).json({ status: "error" });
  }
});

export default router;
