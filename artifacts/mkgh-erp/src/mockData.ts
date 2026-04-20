// ─────────────────────────────────────────────
// MKGH Logistics ERP — Typed Mock Database
// ─────────────────────────────────────────────

export type OrderStatus = "Pending" | "Processing" | "In Transit" | "Delivered" | "Cancelled";
export type VehicleStatus = "Available" | "On-Trip" | "Maintenance" | "Idle" | "Active" | "In Transit";
export type DriverStatus = "On Duty" | "Off Duty" | "Available";
export type TruckType = "Bulker" | "Flatbed" | "Tipper" | "Van" | "Refrigerated Truck" | "Heavy Truck";
export type ExpenseStatus = "Pending" | "Approved" | "Rejected";
export type MaintenanceSeverity = "Low" | "Medium" | "High";
export type MaintenanceStatus = "Open" | "In Progress" | "Resolved";
export type UserRole = "customer" | "reviewer" | "supervisor" | "driver";

// ── Orders ───────────────────────────────────
export interface PaymentInfo {
  method: "Credit" | "Invoice" | "Cash" | "Transfer";
  status: "Paid" | "Pending" | "Overdue";
  amount: number;
  currency: "SAR";
}

export interface Order {
  id: string;
  customerName: string;
  status: OrderStatus;
  vehicleType: TruckType;
  origin: string;
  destination: string;
  date: string;
  weight: string;
  driverId: string | null;
  payment: PaymentInfo;
  cargoDescription: string;
  /** Inventory item IDs consumed by this order, used for warehouse automation */
  consumesStock: { itemId: string; quantity: number }[];
}

// ── Vehicles ─────────────────────────────────
export interface VehicleExpenses {
  diesel: number;
  repairs: number;
  tolls: number;
  lastUpdated: string;
}

export interface Vehicle {
  id: string;
  plateNo: string;
  status: VehicleStatus;
  currentDriver: string;
  type: TruckType;
  location: string;
  fuel: number;
  lastService: string;
  expenses: VehicleExpenses;
}

// ── Stock / Inventory ─────────────────────────
export interface StockItem {
  id: string;
  itemName: string;
  category: "Packaging" | "Fuel" | "Maintenance" | "Equipment";
  quantity: number;
  unit: string;
  minLevel: number;
  location: string;
  lastUpdated: string;
}

// ── Drivers ───────────────────────────────────
export interface Driver {
  id: string;
  name: string;
  status: DriverStatus;
  vehicle: string;
  trips: number;
  phone: string;
  /** Truck type determines payout rate */
  truckType: TruckType;
  totalEarnings: number;
}

// ── Expenses ──────────────────────────────────
export interface Expense {
  id: string;
  driverId: string;
  category: "Fuel" | "Toll" | "Maintenance" | "Meals" | "Parking" | "Other";
  amount: number;
  date: string;
  status: ExpenseStatus;
  description: string;
}

// ── Maintenance ───────────────────────────────
export interface MaintenanceReport {
  id: string;
  vehiclePlate: string;
  driverId: string;
  issue: string;
  severity: MaintenanceSeverity;
  status: MaintenanceStatus;
  date: string;
}

// ── Driver Tasks ──────────────────────────────
export interface DriverTask {
  id: string;
  driverId: string;
  orderId: string;
  type: "Pickup" | "Delivery";
  status: "Pending" | "In Progress" | "Completed";
  time: string;
  location: string;
}

// ── Users ─────────────────────────────────────
export interface AppUser {
  id: number;
  email: string;
  password: string;
  role: UserRole;
  name: string;
  avatar: string;
  driverId?: string;
}

// ─────────────────────────────────────────────
// INITIAL DATA
// ─────────────────────────────────────────────

export const initialOrders: Order[] = [
  {
    id: "ORD-0001", customerName: "Ahmed Al-Rashidi", status: "In Transit",
    vehicleType: "Heavy Truck", origin: "Riyadh", destination: "Jeddah",
    date: "2026-04-18", weight: "12.4 tons", driverId: "DRV-001",
    payment: { method: "Invoice", status: "Pending", amount: 4800, currency: "SAR" },
    cargoDescription: "Steel construction materials",
    consumesStock: [{ itemId: "INV-001", quantity: 8 }, { itemId: "INV-007", quantity: 4 }],
  },
  {
    id: "ORD-0002", customerName: "Sara Mohammed", status: "Pending",
    vehicleType: "Van", origin: "Dammam", destination: "Riyadh",
    date: "2026-04-19", weight: "0.8 tons", driverId: null,
    payment: { method: "Cash", status: "Paid", amount: 650, currency: "SAR" },
    cargoDescription: "Office furniture and supplies",
    consumesStock: [{ itemId: "INV-001", quantity: 3 }, { itemId: "INV-007", quantity: 2 }],
  },
  {
    id: "ORD-0003", customerName: "Gulf Traders LLC", status: "Delivered",
    vehicleType: "Flatbed", origin: "Jeddah", destination: "Mecca",
    date: "2026-04-17", weight: "22.0 tons", driverId: "DRV-002",
    payment: { method: "Transfer", status: "Paid", amount: 9200, currency: "SAR" },
    cargoDescription: "Heavy machinery parts",
    consumesStock: [{ itemId: "INV-001", quantity: 15 }, { itemId: "INV-006", quantity: 10 }],
  },
  {
    id: "ORD-0004", customerName: "Khalid Enterprises", status: "Processing",
    vehicleType: "Refrigerated Truck", origin: "Riyadh", destination: "Tabuk",
    date: "2026-04-20", weight: "5.2 tons", driverId: "DRV-003",
    payment: { method: "Credit", status: "Pending", amount: 3100, currency: "SAR" },
    cargoDescription: "Fresh produce — cold chain",
    consumesStock: [{ itemId: "INV-002", quantity: 6 }, { itemId: "INV-007", quantity: 3 }],
  },
  {
    id: "ORD-0005", customerName: "Noura Al-Saud", status: "Cancelled",
    vehicleType: "Van", origin: "Medina", destination: "Riyadh",
    date: "2026-04-16", weight: "0.3 tons", driverId: null,
    payment: { method: "Cash", status: "Pending", amount: 300, currency: "SAR" },
    cargoDescription: "Personal belongings",
    consumesStock: [],
  },
  {
    id: "ORD-0006", customerName: "Eastern Steel Co.", status: "In Transit",
    vehicleType: "Heavy Truck", origin: "Dammam", destination: "Jubail",
    date: "2026-04-20", weight: "35.0 tons", driverId: "DRV-001",
    payment: { method: "Invoice", status: "Overdue", amount: 14000, currency: "SAR" },
    cargoDescription: "Steel coils for industrial plant",
    consumesStock: [{ itemId: "INV-006", quantity: 20 }, { itemId: "INV-007", quantity: 8 }],
  },
  {
    id: "ORD-0007", customerName: "Amal Logistics", status: "Pending",
    vehicleType: "Flatbed", origin: "Jeddah", destination: "Yanbu",
    date: "2026-04-20", weight: "18.6 tons", driverId: null,
    payment: { method: "Invoice", status: "Pending", amount: 7400, currency: "SAR" },
    cargoDescription: "Industrial equipment",
    consumesStock: [{ itemId: "INV-001", quantity: 10 }, { itemId: "INV-006", quantity: 8 }],
  },
  {
    id: "ORD-0008", customerName: "Faris Trading", status: "Delivered",
    vehicleType: "Van", origin: "Riyadh", destination: "Abha",
    date: "2026-04-15", weight: "1.1 tons", driverId: "DRV-005",
    payment: { method: "Cash", status: "Paid", amount: 900, currency: "SAR" },
    cargoDescription: "Consumer electronics",
    consumesStock: [{ itemId: "INV-001", quantity: 4 }, { itemId: "INV-007", quantity: 2 }],
  },
];

export const initialVehicles: Vehicle[] = [
  {
    id: "VEH-001", plateNo: "RYH-4421", status: "On-Trip",
    currentDriver: "Mohammed Al-Harbi", type: "Heavy Truck",
    location: "Riyadh - King Fahad Road", fuel: 78, lastService: "2026-03-10",
    expenses: { diesel: 1200, repairs: 400, tolls: 150, lastUpdated: "2026-04-18" },
  },
  {
    id: "VEH-002", plateNo: "JED-7823", status: "On-Trip",
    currentDriver: "Abdullah Al-Qahtani", type: "Flatbed",
    location: "Jeddah-Mecca Highway", fuel: 54, lastService: "2026-03-22",
    expenses: { diesel: 980, repairs: 0, tolls: 90, lastUpdated: "2026-04-17" },
  },
  {
    id: "VEH-003", plateNo: "DMM-1190", status: "Maintenance",
    currentDriver: "Unassigned", type: "Refrigerated Truck",
    location: "Dammam Depot", fuel: 20, lastService: "2026-04-01",
    expenses: { diesel: 350, repairs: 2400, tolls: 0, lastUpdated: "2026-04-19" },
  },
  {
    id: "VEH-004", plateNo: "MED-5502", status: "Available",
    currentDriver: "Salim Al-Zahrani", type: "Van",
    location: "Medina Distribution Center", fuel: 91, lastService: "2026-04-12",
    expenses: { diesel: 420, repairs: 0, tolls: 60, lastUpdated: "2026-04-20" },
  },
  {
    id: "VEH-005", plateNo: "ABH-3317", status: "Idle",
    currentDriver: "Omar Al-Ghamdi", type: "Heavy Truck",
    location: "Abha Freight Terminal", fuel: 65, lastService: "2026-02-28",
    expenses: { diesel: 890, repairs: 600, tolls: 120, lastUpdated: "2026-04-10" },
  },
  {
    id: "VEH-006", plateNo: "TAB-6601", status: "Available",
    currentDriver: "Turki Al-Shehri", type: "Van",
    location: "Tabuk North Gate", fuel: 82, lastService: "2026-04-05",
    expenses: { diesel: 510, repairs: 200, tolls: 45, lastUpdated: "2026-04-20" },
  },
];

export const initialStock: StockItem[] = [
  { id: "INV-001", itemName: "Packing Boxes (Large)", category: "Packaging", quantity: 342, unit: "pcs", minLevel: 100, location: "Riyadh Warehouse A", lastUpdated: "2026-04-18" },
  { id: "INV-002", itemName: "Stretch Wrap Rolls", category: "Packaging", quantity: 87, unit: "rolls", minLevel: 50, location: "Riyadh Warehouse A", lastUpdated: "2026-04-18" },
  { id: "INV-003", itemName: "Diesel Fuel (Liters)", category: "Fuel", quantity: 12400, unit: "L", minLevel: 5000, location: "All Depots", lastUpdated: "2026-04-20" },
  { id: "INV-004", itemName: "Engine Oil (20W-50)", category: "Maintenance", quantity: 24, unit: "cans", minLevel: 30, location: "Dammam Workshop", lastUpdated: "2026-04-15" },
  { id: "INV-005", itemName: "Truck Tires (22.5\")", category: "Maintenance", quantity: 16, unit: "pcs", minLevel: 20, location: "Central Depot", lastUpdated: "2026-04-12" },
  { id: "INV-006", itemName: "Pallet Boards", category: "Equipment", quantity: 210, unit: "pcs", minLevel: 80, location: "Jeddah Port Depot", lastUpdated: "2026-04-17" },
  { id: "INV-007", itemName: "Cargo Straps", category: "Equipment", quantity: 148, unit: "pcs", minLevel: 50, location: "All Depots", lastUpdated: "2026-04-18" },
  { id: "INV-008", itemName: "Hydraulic Jack Fluid", category: "Maintenance", quantity: 8, unit: "bottles", minLevel: 15, location: "Riyadh Workshop", lastUpdated: "2026-04-10" },
];

export const initialDrivers: Driver[] = [
  { id: "DRV-001", name: "Mohammed Al-Harbi", status: "On Duty", vehicle: "RYH-4421", trips: 142, phone: "+966 55 123 4567", truckType: "Heavy Truck", totalEarnings: 56800 },
  { id: "DRV-002", name: "Abdullah Al-Qahtani", status: "On Duty", vehicle: "JED-7823", trips: 98, phone: "+966 55 234 5678", truckType: "Flatbed", totalEarnings: 35280 },
  { id: "DRV-003", name: "Salim Al-Zahrani", status: "On Duty", vehicle: "MED-5502", trips: 215, phone: "+966 55 345 6789", truckType: "Van", totalEarnings: 64500 },
  { id: "DRV-004", name: "Omar Al-Ghamdi", status: "Off Duty", vehicle: "ABH-3317", trips: 67, phone: "+966 55 456 7890", truckType: "Heavy Truck", totalEarnings: 26800 },
  { id: "DRV-005", name: "Turki Al-Shehri", status: "On Duty", vehicle: "TAB-6601", trips: 183, phone: "+966 55 567 8901", truckType: "Tipper", totalEarnings: 54900 },
  { id: "DRV-006", name: "Faisal Al-Dossari", status: "Available", vehicle: "Unassigned", trips: 41, phone: "+966 55 678 9012", truckType: "Flatbed", totalEarnings: 14760 },
];

export const initialExpenses: Expense[] = [
  { id: "EXP-001", driverId: "DRV-001", category: "Fuel", amount: 450, date: "2026-04-18", status: "Approved", description: "Fuel fill-up Riyadh depot" },
  { id: "EXP-002", driverId: "DRV-002", category: "Toll", amount: 120, date: "2026-04-19", status: "Pending", description: "Highway toll fees" },
  { id: "EXP-003", driverId: "DRV-001", category: "Maintenance", amount: 800, date: "2026-04-17", status: "Pending", description: "Tire replacement on road" },
  { id: "EXP-004", driverId: "DRV-003", category: "Fuel", amount: 380, date: "2026-04-20", status: "Approved", description: "Medina refuel" },
];

export const initialMaintenanceReports: MaintenanceReport[] = [
  { id: "MNT-001", vehiclePlate: "DMM-1190", driverId: "DRV-002", issue: "Engine oil leak detected", severity: "High", status: "Open", date: "2026-04-19" },
  { id: "MNT-002", vehiclePlate: "RYH-4421", driverId: "DRV-001", issue: "Front left tire wear", severity: "Medium", status: "In Progress", date: "2026-04-18" },
  { id: "MNT-003", vehiclePlate: "MED-5502", driverId: "DRV-003", issue: "AC system not cooling", severity: "Low", status: "Resolved", date: "2026-04-15" },
];

export const initialTasks: DriverTask[] = [
  { id: "TSK-001", driverId: "DRV-001", orderId: "ORD-0001", type: "Pickup", status: "Completed", time: "08:00", location: "Riyadh Central Depot" },
  { id: "TSK-002", driverId: "DRV-001", orderId: "ORD-0001", type: "Delivery", status: "In Progress", time: "14:00", location: "Jeddah Port - Gate 3" },
  { id: "TSK-003", driverId: "DRV-002", orderId: "ORD-0007", type: "Pickup", status: "Pending", time: "10:30", location: "Jeddah Logistics City" },
  { id: "TSK-004", driverId: "DRV-003", orderId: "ORD-0004", type: "Delivery", status: "Pending", time: "16:00", location: "Tabuk Industrial Area" },
];

export const appUsers: AppUser[] = [
  { id: 1, email: "customer@mkgh.sa", password: "customer123", role: "customer", name: "Ahmed Al-Rashidi", avatar: "A" },
  { id: 2, email: "reviewer@mkgh.sa", password: "reviewer123", role: "reviewer", name: "Hana Al-Mutairi", avatar: "H" },
  { id: 3, email: "supervisor@mkgh.sa", password: "super123", role: "supervisor", name: "Majed Al-Dosari", avatar: "M" },
  { id: 4, email: "driver@mkgh.sa", password: "driver123", role: "driver", name: "Mohammed Al-Harbi", avatar: "D", driverId: "DRV-001" },
];

export const statusColors: Record<string, string> = {
  "In Transit": "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "On-Trip":    "bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Pending":    "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Delivered":  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Processing": "bg-violet-500/15 text-violet-400 border-violet-500/30",
  "Cancelled":  "bg-red-500/15 text-red-400 border-red-500/30",
  "Available":  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Active":     "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Idle":       "bg-slate-500/15 text-slate-400 border-slate-500/30",
  "Maintenance":"bg-red-500/15 text-red-400 border-red-500/30",
  "On Duty":    "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Off Duty":   "bg-slate-500/15 text-slate-400 border-slate-500/30",
  "Approved":   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Completed":  "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "In Progress":"bg-blue-500/15 text-blue-400 border-blue-500/30",
  "Open":       "bg-red-500/15 text-red-400 border-red-500/30",
  "Resolved":   "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Rejected":   "bg-red-500/15 text-red-400 border-red-500/30",
  "High":       "bg-red-500/15 text-red-400 border-red-500/30",
  "Medium":     "bg-amber-500/15 text-amber-400 border-amber-500/30",
  "Low":        "bg-slate-500/15 text-slate-400 border-slate-500/30",
  "Paid":       "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
  "Overdue":    "bg-red-500/15 text-red-400 border-red-500/30",
};
