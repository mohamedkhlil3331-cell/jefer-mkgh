# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.

## Artifacts

### MKGH Logistics ERP (`artifacts/mkgh-erp`)
- **Type**: React + Vite web app
- **Preview path**: `/`
- **Tech**: React, Tailwind CSS, Framer Motion, Lucide React, Wouter
- **Features**:
  - Role-based authentication (local auth state, no backend needed)
  - 4 roles: Customer, Reviewer, Transport Supervisor, Driver
  - Customer: Place Order, Track Orders, AI Chat assistant
  - Reviewer: Orders Queue (approve/reject), Inventory Status, Analytics
  - Supervisor: Fleet Management, Driver Assignment, Analytics
  - Driver: Task List, Expense Reports, Maintenance Reports
  - MKGH design system: Deep Blue sidebar, Action Orange CTAs, Slate Gray
  - Mobile-first responsive layout with collapsible sidebar
  - Framer Motion transitions throughout
  - Mock data in `src/data.js` (orders, vehicles, drivers, inventory, expenses, maintenance, tasks)
  - Demo login accounts available on the login page

### API Server (`artifacts/api-server`)
- **Type**: Express 5 API server
- **Port**: 8080
- **Path**: `/api`

## Design System (MKGH)
- **Primary**: Deep Blue (`#0d2137` sidebar, `215 72% 40%` primary)
- **Accent**: Action Orange (`#f97316`)
- **Neutral**: Slate Gray (`#64748b`)
- **Font**: Inter
- **Radius**: 10px (rounded-xl)
