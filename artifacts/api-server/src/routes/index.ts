import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import erpEmployees from "./erp-employees.js";
import erpInvoices from "./erp-invoices.js";
import erpTrips from "./erp-trips.js";
import erpExpenses from "./erp-expenses.js";
import erpOperations from "./erp-operations.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(erpEmployees);
router.use(erpInvoices);
router.use(erpTrips);
router.use(erpExpenses);
router.use(erpOperations);

export default router;
