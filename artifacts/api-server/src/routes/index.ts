import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import erpEmployees from "./erp-employees.js";
import erpInvoices from "./erp-invoices.js";
import erpTrips from "./erp-trips.js";
import erpExpenses from "./erp-expenses.js";
import erpOperations from "./erp-operations.js";
import authRouter from "./auth.js";
import productsRouter from "./products.js";
import ordersWorkflow from "./orders-workflow.js";
import customersPortal from "./customers-portal.js";
import statsRouter from "./stats.js";
import googleSheetsRouter from "./google-sheets.js";
import warehousesRouter from "./warehouses.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(productsRouter);
router.use(ordersWorkflow);
router.use(customersPortal);
router.use(statsRouter);
router.use(googleSheetsRouter);
router.use(warehousesRouter);
router.use(erpEmployees);
router.use(erpInvoices);
router.use(erpTrips);
router.use(erpExpenses);
router.use(erpOperations);

export default router;
