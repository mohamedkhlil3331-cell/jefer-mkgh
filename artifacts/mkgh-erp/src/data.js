export const orders = [
  { id: "ORD-0001", customerName: "Ahmed Al-Rashidi", status: "In Transit", vehicleType: "Heavy Truck", origin: "Riyadh", destination: "Jeddah", date: "2026-04-18", weight: "12.4 tons" },
  { id: "ORD-0002", customerName: "Sara Mohammed", status: "Pending", vehicleType: "Van", origin: "Dammam", destination: "Riyadh", date: "2026-04-19", weight: "0.8 tons" },
  { id: "ORD-0003", customerName: "Gulf Traders LLC", status: "Delivered", vehicleType: "Flatbed", origin: "Jeddah", destination: "Mecca", date: "2026-04-17", weight: "22.0 tons" },
  { id: "ORD-0004", customerName: "Khalid Enterprises", status: "Processing", vehicleType: "Refrigerated Truck", origin: "Riyadh", destination: "Tabuk", date: "2026-04-20", weight: "5.2 tons" },
  { id: "ORD-0005", customerName: "Noura Al-Saud", status: "Cancelled", vehicleType: "Van", origin: "Medina", destination: "Riyadh", date: "2026-04-16", weight: "0.3 tons" },
  { id: "ORD-0006", customerName: "Eastern Steel Co.", status: "In Transit", vehicleType: "Heavy Truck", origin: "Dammam", destination: "Jubail", date: "2026-04-20", weight: "35.0 tons" },
  { id: "ORD-0007", customerName: "Amal Logistics", status: "Pending", vehicleType: "Flatbed", origin: "Jeddah", destination: "Yanbu", date: "2026-04-20", weight: "18.6 tons" },
  { id: "ORD-0008", customerName: "Faris Trading", status: "Delivered", vehicleType: "Van", origin: "Riyadh", destination: "Abha", date: "2026-04-15", weight: "1.1 tons" },
];

export const vehicles = [
  { plateNo: "RYH-4421", status: "Active", currentDriver: "Mohammed Al-Harbi", type: "Heavy Truck", location: "Riyadh - King Fahad Road", fuel: 78, lastService: "2026-03-10" },
  { plateNo: "JED-7823", status: "In Transit", currentDriver: "Abdullah Al-Qahtani", type: "Flatbed", location: "Jeddah-Mecca Highway", fuel: 54, lastService: "2026-03-22" },
  { plateNo: "DMM-1190", status: "Maintenance", currentDriver: "Unassigned", type: "Refrigerated Truck", location: "Dammam Depot", fuel: 20, lastService: "2026-04-01" },
  { plateNo: "MED-5502", status: "Active", currentDriver: "Salim Al-Zahrani", type: "Van", location: "Medina Distribution Center", fuel: 91, lastService: "2026-04-12" },
  { plateNo: "ABH-3317", status: "Idle", currentDriver: "Omar Al-Ghamdi", type: "Heavy Truck", location: "Abha Freight Terminal", fuel: 65, lastService: "2026-02-28" },
  { plateNo: "TAB-6601", status: "Active", currentDriver: "Turki Al-Shehri", type: "Van", location: "Tabuk North Gate", fuel: 82, lastService: "2026-04-05" },
];

export const drivers = [
  { id: "DRV-001", name: "Mohammed Al-Harbi", status: "On Duty", vehicle: "RYH-4421", trips: 142, phone: "+966 55 123 4567" },
  { id: "DRV-002", name: "Abdullah Al-Qahtani", status: "On Duty", vehicle: "JED-7823", trips: 98, phone: "+966 55 234 5678" },
  { id: "DRV-003", name: "Salim Al-Zahrani", status: "On Duty", vehicle: "MED-5502", trips: 215, phone: "+966 55 345 6789" },
  { id: "DRV-004", name: "Omar Al-Ghamdi", status: "Off Duty", vehicle: "ABH-3317", trips: 67, phone: "+966 55 456 7890" },
  { id: "DRV-005", name: "Turki Al-Shehri", status: "On Duty", vehicle: "TAB-6601", trips: 183, phone: "+966 55 567 8901" },
  { id: "DRV-006", name: "Faisal Al-Dossari", status: "Available", vehicle: "Unassigned", trips: 41, phone: "+966 55 678 9012" },
];

export const inventory = [
  { id: "INV-001", item: "Packing Boxes (Large)", category: "Packaging", stockLevel: 342, unit: "pcs", minLevel: 100, location: "Riyadh Warehouse A" },
  { id: "INV-002", item: "Stretch Wrap Rolls", category: "Packaging", stockLevel: 87, unit: "rolls", minLevel: 50, location: "Riyadh Warehouse A" },
  { id: "INV-003", item: "Diesel Fuel (Liters)", category: "Fuel", stockLevel: 12400, unit: "L", minLevel: 5000, location: "All Depots" },
  { id: "INV-004", item: "Engine Oil (20W-50)", category: "Maintenance", stockLevel: 24, unit: "cans", minLevel: 30, location: "Dammam Workshop" },
  { id: "INV-005", item: "Truck Tires (22.5\")", category: "Maintenance", stockLevel: 16, unit: "pcs", minLevel: 20, location: "Central Depot" },
  { id: "INV-006", item: "Pallet Boards", category: "Equipment", stockLevel: 210, unit: "pcs", minLevel: 80, location: "Jeddah Port Depot" },
  { id: "INV-007", item: "Cargo Straps", category: "Equipment", stockLevel: 148, unit: "pcs", minLevel: 50, location: "All Depots" },
  { id: "INV-008", item: "Hydraulic Jack Fluid", category: "Maintenance", stockLevel: 8, unit: "bottles", minLevel: 15, location: "Riyadh Workshop" },
];

export const expenses = [
  { id: "EXP-001", driverId: "DRV-001", category: "Fuel", amount: 450, date: "2026-04-18", status: "Approved", description: "Fuel fill-up Riyadh depot" },
  { id: "EXP-002", driverId: "DRV-002", category: "Toll", amount: 120, date: "2026-04-19", status: "Pending", description: "Highway toll fees" },
  { id: "EXP-003", driverId: "DRV-001", category: "Maintenance", amount: 800, date: "2026-04-17", status: "Pending", description: "Tire replacement on road" },
  { id: "EXP-004", driverId: "DRV-003", category: "Fuel", amount: 380, date: "2026-04-20", status: "Approved", description: "Medina refuel" },
];

export const maintenanceReports = [
  { id: "MNT-001", vehiclePlate: "DMM-1190", driverId: "DRV-002", issue: "Engine oil leak detected", severity: "High", status: "Open", date: "2026-04-19" },
  { id: "MNT-002", vehiclePlate: "RYH-4421", driverId: "DRV-001", issue: "Front left tire wear", severity: "Medium", status: "In Progress", date: "2026-04-18" },
  { id: "MNT-003", vehiclePlate: "MED-5502", driverId: "DRV-003", issue: "AC system not cooling", severity: "Low", status: "Resolved", date: "2026-04-15" },
];

export const tasks = [
  { id: "TSK-001", driverId: "DRV-001", orderId: "ORD-0001", type: "Pickup", status: "Completed", time: "08:00", location: "Riyadh Central Depot" },
  { id: "TSK-002", driverId: "DRV-001", orderId: "ORD-0001", type: "Delivery", status: "In Progress", time: "14:00", location: "Jeddah Port - Gate 3" },
  { id: "TSK-003", driverId: "DRV-002", orderId: "ORD-0007", type: "Pickup", status: "Pending", time: "10:30", location: "Jeddah Logistics City" },
  { id: "TSK-004", driverId: "DRV-003", orderId: "ORD-0004", type: "Delivery", status: "Pending", time: "16:00", location: "Tabuk Industrial Area" },
];

export const users = [
  { id: 1, email: "customer@mkgh.sa", password: "customer123", role: "customer", name: "Ahmed Al-Rashidi", avatar: "A" },
  { id: 2, email: "reviewer@mkgh.sa", password: "reviewer123", role: "reviewer", name: "Hana Al-Mutairi", avatar: "H" },
  { id: 3, email: "supervisor@mkgh.sa", password: "super123", role: "supervisor", name: "Majed Al-Dosari", avatar: "M" },
  { id: 4, email: "driver@mkgh.sa", password: "driver123", role: "driver", name: "Mohammed Al-Harbi", avatar: "D", driverId: "DRV-001" },
];

export const statusColors = {
  "In Transit": "bg-blue-100 text-blue-700 border-blue-200",
  "Pending": "bg-amber-100 text-amber-700 border-amber-200",
  "Delivered": "bg-green-100 text-green-700 border-green-200",
  "Processing": "bg-purple-100 text-purple-700 border-purple-200",
  "Cancelled": "bg-red-100 text-red-700 border-red-200",
  "Active": "bg-green-100 text-green-700 border-green-200",
  "Idle": "bg-slate-100 text-slate-600 border-slate-200",
  "Maintenance": "bg-red-100 text-red-700 border-red-200",
  "On Duty": "bg-green-100 text-green-700 border-green-200",
  "Off Duty": "bg-slate-100 text-slate-600 border-slate-200",
  "Available": "bg-blue-100 text-blue-700 border-blue-200",
  "Approved": "bg-green-100 text-green-700 border-green-200",
  "Completed": "bg-green-100 text-green-700 border-green-200",
  "In Progress": "bg-blue-100 text-blue-700 border-blue-200",
  "Open": "bg-red-100 text-red-700 border-red-200",
  "Resolved": "bg-green-100 text-green-700 border-green-200",
  "High": "bg-red-100 text-red-700 border-red-200",
  "Medium": "bg-amber-100 text-amber-700 border-amber-200",
  "Low": "bg-slate-100 text-slate-600 border-slate-200",
};
