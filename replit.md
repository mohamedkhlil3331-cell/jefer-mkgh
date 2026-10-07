# MKGH Logistics Platform

## Overview

pnpm workspace monorepo. Full multi-role logistics platform for MKGH cement/construction company built on Express + SQLite + React/Vite.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **API framework**: Express 5
- **Database**: SQLite via better-sqlite3 (file: `artifacts/api-server/data/erp.db`)
- **Frontend**: React + Vite + TailwindCSS + wouter routing
- **Build**: esbuild

## Artifacts

| Artifact | Path | Description |
|---|---|---|
| `erp-arabic` | `/` | Main platform — multi-role portal + legacy ERP |
| `api-server` | `/api/` | Backend REST API |

## Platform Roles

| Role | Phone | Password | Access |
|---|---|---|---|
| admin (مدير) | 0500000000 | admin123 | All pages |
| reviewer (مراجع) | 0500000001 | 123456 | Order review + payment confirm |
| supervisor (مشرف نقليات) | 0500000002 | 123456 | Vehicle assignment |
| warehouse (مستودع) | 0500000003 | 123456 | Invoice issuance |
| driver (سائق) | 0500000004 | 123456 | Loading + delivery + breakdown report |
| rep (مندوب) | 0500000005 | 123456 | Customer orders tracking |
| workshop_manager (مدير الورشة) | 0500000006 | 123456 | Breakdown reports + work orders + inventory |
| purchasing (مسئول المشتريات) | 0500000007 | 123456 | Purchase requests approve/receive + inventory |
| customer (عميل) | 0555555555 | 123456 | Product catalog + orders + account |

## Order Workflow

```
Customer places order (MKGH+timestamp)
  ↓ pending
Reviewer confirms payment transfer + signs
  ↓ payment_confirmed
Supervisor assigns available vehicle + driver
  ↓ vehicle_assigned
Warehouse issues invoice
  ↓ invoiced
Driver confirms loading + uploads photo
  ↓ loaded  [Customer/Rep see: vehicle plate, driver phone, WhatsApp link]
Driver confirms delivery
  ↓ delivered  [Vehicle freed, customer can rate + download VAT invoice]
```

## Key API Endpoints

- `POST /api/auth/login` — phone + password → token
- `GET /api/products` — product catalog with ratings
- `POST /api/workflow/orders` — customer places order
- `PUT /api/workflow/orders/:id/confirm-payment` — reviewer signs
- `PUT /api/workflow/orders/:id/assign-vehicle` — supervisor assigns
- `PUT /api/workflow/orders/:id/invoice` — warehouse issues invoice
- `PUT /api/workflow/orders/:id/load` — driver uploads loading photo
- `PUT /api/workflow/orders/:id/deliver` — driver confirms delivery
- `GET /api/portal/customers/:phone/statement` — account statement
- `GET /api/portal/customers/:phone/orders/:id/vat-invoice` — VAT invoice (15%)
- `POST /api/portal/transfers` — customer uploads payment transfer
- `PUT /api/portal/transfers/:id/confirm` — reviewer confirms transfer

## Database Tables

**New platform tables:** users, sessions, products, product_ratings, workflow_orders, customer_transfers, notifications, breakdown_reports, workshop_jobs, workshop_inventory, purchase_requests

**Legacy ERP tables:** employees, leave_requests, invoices, trips, fleet_expenses, petty_cash, fleet_vehicles, workshop

## Workshop & Purchasing Module

**Workshop Jobs** (`workshop_jobs`): work orders per vehicle, `invoice_target` = `vehicle` (charges vehicle) or `inventory` (deducts workshop stock). Created from breakdown reports or manually.

**Workshop Inventory** (`workshop_inventory`): spare parts stock with min_stock alerts. Managed by both workshop_manager and purchasing.

**Purchase Requests** (`purchase_requests`): workshop_manager creates → purchasing approves/rejects → on receive, stock added to workshop_inventory.

Key API routes (no auth guard — rely on role-based UI):
- `GET/POST /api/workshop-jobs`, `PUT /api/workshop-jobs/:id/complete`, `PUT /api/workshop-jobs/:id/status`
- `GET/POST/PUT /api/workshop-inventory`, `PUT /api/workshop-inventory/:id/receive`
- `GET/POST /api/purchase-requests`, `PUT /api/purchase-requests/:id/approve|reject|receive`

## Data Source

Google Sheets: `1yqIRQPMo2_dXUfzWLcyO2WKkjN83e5Wko5a3ZdtdTtU`
- Orders sheet (gid=1937499220): imported as seed data in MKGH format

## VAT

Saudi Arabia rate: 15%. All orders auto-calculate `total_before_vat`, `vat_amount`, `total_with_vat`.

## Order Number Format

`MKGH` + `YYYYMMDDHHmmss` (e.g. `MKGH20260505120305`)
