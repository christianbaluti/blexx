
## Approach

Per your direction: build the full UI now against **dummy JSON data** in the frontend, and ship a **production-ready MySQL package** (schema migrations + seed data + ER notes) in the repo. You connect the real DB later — no backend wiring will block UI work.

> Note: native Android/iOS/Windows/macOS apps and true offline sync are out of Lovable's scope. You'll get a responsive web app that can be wrapped via Capacitor/Electron later. The UI will include offline-style indicators and a sync placeholder.

## v1 Scope (all modules from the SRS)

1. **Auth & Roles** — login screen, mock session, 6 roles (Super Admin, Inventory Officer, Production Officer, POS Cashier, Finance, CRO), role-based menu & route guards
2. **Dashboard** — KPI tiles (revenue, profit, stock value), charts, recent activity
3. **User & Role Management** — CRUD users, assign roles, suspend
4. **Supplier Management** — registration, balances, statements, purchase history
5. **Inventory** — raw materials, stock items, batches, receiving, adjustments, damages, transfers, physical counts
6. **Production** — BOM editor, production batches, auto-deduction preview, waste & cost
7. **Products** — categories, images, barcodes, variants, price tiers
8. **POS** — product search, barcode input, cart, discounts, multi-payment, receipt, returns, hold/resume
9. **Customers** — profiles, loyalty points, credit limit, purchase history
10. **Purchases** — POs, GRNs, supplier invoices, returns
11. **Finance** — AR, AP, expenses, income, GL, P&L, balance sheet
12. **Expenses** — rent, transport, salaries, marketing, packaging, utilities, custom categories
13. **Reports & Analytics** — sales, inventory, finance, customer, supplier reports with filters
14. **Notifications** — low-stock & expiry alerts in-app, channel toggles for email/SMS/push
15. **Audit Trails** — activity log viewer
16. **Settings** — company info, tax, currency, 2FA toggle, biometric placeholder

## MySQL Package (ready to run later)

Delivered under `/db/mysql/`:
- `schema/001_init.sql` … `0NN_*.sql` — all tables, FKs, indexes, enums (as CHECK), grouped by module
- `seed/*.sql` — demo data matching the JSON used in the UI
- `views/*.sql` — reporting views (sales summary, stock valuation, AR/AP aging, P&L)
- `procedures/*.sql` — stock movement, BOM consumption, POS finalize
- `triggers/*.sql` — audit trail capture, low-stock notification, inventory deduction
- `README.md` — ER diagram (Mermaid), run order, role/grant scripts, sync-conflict strategy notes
- `migrate.sh` — runs files in order via `mysql` CLI

The frontend will import a typed `db.ts` client interface; today it returns mock JSON, later you swap in a real fetch layer hitting your MySQL API — call sites won't change.

## Frontend Architecture

- **Stack** — TanStack Start (already scaffolded), TypeScript, Tailwind, shadcn/ui
- **Mock data layer** — `src/data/*.json` + `src/lib/api/*.ts` async functions returning Promises (simulating latency) so swapping to real fetches later is a one-file change
- **State/data** — TanStack Query for caching/invalidations
- **Routing** — file-based; `_authenticated` layout gates app, `_authenticated/_admin` gates user mgmt; POS at `/pos` (full-screen layout)
- **RBAC** — auth context exposes `hasRole`/`hasPermission`; menus and routes both gated
- **Design** — custom design system, not generic AI look:
  - Dark sidebar + light content shell, tight data-dense tables (Linear/Notion-influenced), serif display accents on headings, neutral palette with a single saturated accent, real iconography (lucide), no purple gradients
  - POS uses a separate dense touch-friendly layout (large tap targets, keypad, barcode focus trap)
- **Charts** — Recharts for dashboard & reports
- **Notifications** — sonner toasts + in-app inbox panel

## Route Map (high level)

```
/auth                   login, forgot password
/_authenticated/
  dashboard
  pos                   (full-screen)
  inventory/            items, batches, adjustments, transfers, counts
  production/           bom, batches
  products/             list, categories
  purchases/            orders, grns, invoices, returns
  suppliers/            list, $id (statement)
  customers/            list, $id (history, loyalty)
  finance/              ar, ap, expenses, income, ledger, pnl, balance-sheet
  reports/              sales, inventory, finance, customers, suppliers
  notifications
  audit
  settings/             company, tax, users, roles, integrations
```

## What you will see when v1 lands

- Working login (mock users for each role) → role-aware dashboard
- Fully clickable UI for every module with realistic seeded data
- POS that can complete a sale end-to-end against mock data, printing a receipt preview
- `/db/mysql/` ready to run on your MySQL server with `./migrate.sh`
- A single `src/lib/api/client.ts` shim that you (or I, later) point at your real MySQL-backed API

## Out of Scope for v1 (call out now)

- Real MySQL connection, real auth backend, real SMS/email/push delivery
- True offline sync engine (UI placeholders only)
- Native mobile/desktop builds (web only; Capacitor/Electron later)
- Payment terminal hardware integration

## Build Order

1. Design system + app shell + auth mock + RBAC
2. Dashboard + Products + Inventory + Suppliers + Customers
3. POS (full flow) + Purchases
4. Production + BOM
5. Finance + Expenses + Reports
6. Notifications + Audit + Settings
7. MySQL schema + seeds + procedures + README

Approve and I'll start building.
