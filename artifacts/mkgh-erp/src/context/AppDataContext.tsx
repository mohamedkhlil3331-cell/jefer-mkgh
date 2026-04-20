import React, { createContext, useContext, useState, useCallback, ReactNode } from "react";
import {
  initialOrders, initialStock, initialDrivers, initialExpenses,
  initialMaintenanceReports, initialTasks, initialVehicles,
  type Order, type OrderStatus, type StockItem, type Driver,
  type Expense, type MaintenanceReport, type DriverTask, type Vehicle,
} from "../mockData";

// ─────────────────────────────────────────────────────────────────────────────
// AppData Context — Global reactive state for all ERP entities.
// Includes Warehouse Automation: when an order is marked Delivered,
// consumed stock items are auto-decremented.
// ─────────────────────────────────────────────────────────────────────────────

interface WarehouseEvent {
  orderId: string;
  timestamp: string;
  changes: { itemId: string; itemName: string; delta: number; newQuantity: number }[];
}

interface AppDataContextType {
  // Orders
  orders: Order[];
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;

  // Stock / Inventory
  stock: StockItem[];
  adjustStock: (itemId: string, delta: number) => void;
  warehouseLog: WarehouseEvent[];

  // Drivers
  drivers: Driver[];
  assignDriverToOrder: (driverId: string, orderId: string) => void;

  // Vehicles
  vehicles: Vehicle[];
  assignVehicleToDriver: (driverId: string, plateNo: string) => void;

  // Expenses
  expenses: Expense[];
  addExpense: (expense: Omit<Expense, "id">) => void;
  updateExpenseStatus: (expId: string, status: Expense["status"]) => void;

  // Maintenance
  maintenanceReports: MaintenanceReport[];
  addMaintenanceReport: (report: Omit<MaintenanceReport, "id">) => void;

  // Tasks
  tasks: DriverTask[];
  updateTaskStatus: (taskId: string, status: DriverTask["status"]) => void;
}

const AppDataContext = createContext<AppDataContextType | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [stock, setStock] = useState<StockItem[]>(initialStock);
  const [drivers, setDrivers] = useState<Driver[]>(initialDrivers);
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [expenses, setExpenses] = useState<Expense[]>(initialExpenses);
  const [maintenanceReports, setMaintenanceReports] = useState<MaintenanceReport[]>(initialMaintenanceReports);
  const [tasks, setTasks] = useState<DriverTask[]>(initialTasks);
  const [warehouseLog, setWarehouseLog] = useState<WarehouseEvent[]>([]);

  /** ── WAREHOUSE AUTOMATION ─────────────────────────────────────────────
   * Triggered whenever an order status changes to "Delivered".
   * Decrements each stock item listed in order.consumesStock.
   */
  const runWarehouseAutomation = useCallback((order: Order) => {
    if (!order.consumesStock || order.consumesStock.length === 0) return;

    const changes: WarehouseEvent["changes"] = [];

    setStock((prev) =>
      prev.map((item) => {
        const consumption = order.consumesStock.find((c) => c.itemId === item.id);
        if (!consumption) return item;
        const newQuantity = Math.max(0, item.quantity - consumption.quantity);
        changes.push({
          itemId: item.id,
          itemName: item.itemName,
          delta: -consumption.quantity,
          newQuantity,
        });
        return {
          ...item,
          quantity: newQuantity,
          lastUpdated: new Date().toISOString().split("T")[0],
        };
      })
    );

    if (changes.length > 0) {
      const event: WarehouseEvent = {
        orderId: order.id,
        timestamp: new Date().toLocaleTimeString(),
        changes,
      };
      setWarehouseLog((prev) => [event, ...prev.slice(0, 49)]);
    }
  }, []);

  const updateOrderStatus = useCallback((orderId: string, newStatus: OrderStatus) => {
    setOrders((prev) =>
      prev.map((o) => {
        if (o.id !== orderId) return o;
        const updated = { ...o, status: newStatus };
        // Trigger warehouse automation on delivery
        if (newStatus === "Delivered" && o.status !== "Delivered") {
          runWarehouseAutomation(updated);
        }
        return updated;
      })
    );
  }, [runWarehouseAutomation]);

  const adjustStock = useCallback((itemId: string, delta: number) => {
    setStock((prev) =>
      prev.map((item) =>
        item.id === itemId
          ? { ...item, quantity: Math.max(0, item.quantity + delta), lastUpdated: new Date().toISOString().split("T")[0] }
          : item
      )
    );
  }, []);

  const assignDriverToOrder = useCallback((driverId: string, orderId: string) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, driverId } : o)));
  }, []);

  const assignVehicleToDriver = useCallback((driverId: string, plateNo: string) => {
    setDrivers((prev) =>
      prev.map((d) => (d.id === driverId ? { ...d, vehicle: plateNo } : d))
    );
  }, []);

  const addExpense = useCallback((expense: Omit<Expense, "id">) => {
    const id = `EXP-${String(Date.now()).slice(-5)}`;
    setExpenses((prev) => [{ id, ...expense }, ...prev]);
  }, []);

  const updateExpenseStatus = useCallback((expId: string, status: Expense["status"]) => {
    setExpenses((prev) => prev.map((e) => (e.id === expId ? { ...e, status } : e)));
  }, []);

  const addMaintenanceReport = useCallback((report: Omit<MaintenanceReport, "id">) => {
    const id = `MNT-${String(Date.now()).slice(-4)}`;
    setMaintenanceReports((prev) => [{ id, ...report }, ...prev]);
  }, []);

  const updateTaskStatus = useCallback((taskId: string, status: DriverTask["status"]) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, status } : t)));
  }, []);

  return (
    <AppDataContext.Provider value={{
      orders, updateOrderStatus,
      stock, adjustStock, warehouseLog,
      drivers, assignDriverToOrder,
      vehicles, assignVehicleToDriver,
      expenses, addExpense, updateExpenseStatus,
      maintenanceReports, addMaintenanceReport,
      tasks, updateTaskStatus,
    }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error("useAppData must be used within AppDataProvider");
  return ctx;
}
