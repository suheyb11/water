# Water Portal — Water Distribution & Customer Financial Management

Full-stack portal for a purified-water distribution business (20 L containers and any other configured product):
customers with locally-known addresses, dynamic per-customer pricing, sales/invoices, payments, a debit/credit
customer ledger, statements, daily statements, expenses, stock, deliveries, users/roles and an audit log.

**Stack:** Next.js 16 (App Router, Server Components + Server Actions) · React 19 · TypeScript · Tailwind CSS 4 ·
shadcn-style UI (Radix) · Lucide · Recharts · Zod · Prisma 7 (driver adapter `@prisma/adapter-mssql`) ·
Microsoft SQL Server 2022 Express · @react-pdf/renderer · Vitest.

---

## 1. Quick start (this machine)

Already done on DEV-1402-LPT: SQL Server 2022 Express (instance `SQLEXPRESS`, TCP 1433), databases `WaterPortal`
and `WaterPortal_Test`, login `water_app`, migrations applied, reference data seeded. Passwords:
`%USERPROFILE%\.water-portal\` (`sa.txt`, `app.txt`). First admin sign-in: `ADMIN-FIRST-LOGIN.txt` (delete after use).

```powershell
cd C:\Users\Suhayb\Desktop\my-project\water-portal
npm install            # also runs prisma generate
npm run dev            # http://localhost:3000
```

## 2. Setting up on a new machine

1. Install Node.js 22+ and SQL Server 2022 (Express is enough) with **SQL authentication** and **TCP/IP enabled on
   port 1433** (SQL Server Configuration Manager → Protocols → TCP/IP → IPAll → TCP Port 1433, restart the service).
2. Create the databases and the application login (as `sa` or a Windows sysadmin):
   ```sql
   CREATE DATABASE WaterPortal;
   CREATE DATABASE WaterPortal_Test;
   ALTER DATABASE WaterPortal SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
   ALTER DATABASE WaterPortal_Test SET READ_COMMITTED_SNAPSHOT ON WITH ROLLBACK IMMEDIATE;
   CREATE LOGIN water_app WITH PASSWORD = '<strong password>';
   ALTER SERVER ROLE dbcreator ADD MEMBER water_app;   -- lets `prisma migrate dev` create its shadow database
   USE WaterPortal;      CREATE USER water_app FOR LOGIN water_app; ALTER ROLE db_owner ADD MEMBER water_app;
   USE WaterPortal_Test; CREATE USER water_app FOR LOGIN water_app; ALTER ROLE db_owner ADD MEMBER water_app;
   ```
3. `copy .env.example .env` and fill in the passwords and `AUTH_SECRET`.
4. Install, migrate, seed, run:
   ```powershell
   npm install
   npm run db:deploy      # prisma migrate deploy + prisma generate
   npm run db:seed        # roles, permissions, payment methods, expense categories, 20 L product, first admin
   npm run dev
   ```
   The seed prints where the first admin password was written (`ADMIN-FIRST-LOGIN.txt`). The admin must choose a
   new password at first sign-in.

## 3. Commands

| Command | What it does |
|---|---|
| `npm run dev` | development server (port 3000) |
| `npm run build` / `npm start` | production build / start (port 3000) |
| `npm test` | 55 automated tests against `WaterPortal_Test` (the tests empty that database) |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm run db:migrate` | create + apply a migration after editing `prisma/schema.prisma` (development) |
| `npm run db:deploy` | apply pending migrations (production) |
| `npm run db:seed` | reference data + first admin (safe to re-run) |
| `npm run db:studio` | Prisma Studio |

## 4. How the money works

**Convention.** For every customer: `balance = Σ debit − Σ credit`. Positive = customer owes us; negative = advance
credit; zero = settled. All amounts are `DECIMAL(18,2)` (prices `DECIMAL(18,4)`), computed with decimal.js — never
floating point.

| Debit (customer owes more) | Credit (customer owes less) |
|---|---|
| Sale, debit note / extra charge, opening debt, refund paid out, payment reversal | Payment, credit adjustment, product return, opening credit, invoice cancellation |

**Documents.** Receivables = `Invoice` (kinds SALE, DEBIT_NOTE, OPENING_BALANCE, REFUND). Credits = `Payment`
and `CreditNote`. `Allocation` rows say which credit settled which receivable; a payment is credited to the ledger
**once**, allocation only decides invoice status. Unallocated credit = the customer's advance.

**Posting a sale** (one database transaction; any failure rolls everything back): lock the customer row → resolve
each price (customer price → group price → default, effective on the sale date) and freeze it on the invoice line
→ invoice + lines → ledger debit → apply existing advance credit → record the counter payment, allocate it (rest
settles older debt, then stays advance) → stock movements → optional delivery → audit record.

**Immutability.** Posted invoices, payments and ledger entries are never edited or deleted. Mistakes are corrected
with cancellation (invoice), reversal (payment), debit/credit notes, returns and refunds — each its own document
with a reference. The database enforces this too: CHECK constraints on all money columns and triggers that reject
UPDATE/DELETE on `LedgerEntry`, `StockMovement` and `AuditLog`
(`prisma/migrations/*_integrity_constraints`).

**Concurrency & idempotency.** Every posting starts with `UPDATE Customer SET lockVersion += 1` (row lock), so
postings for one customer run one after another; document numbers come from locked sequence rows (unique, no gaps
from failed postings). The sales and payment screens send an idempotency key, so a double-click or retry posts once.

**Reconciliation.** Financial reports → *Run check* verifies: account balance = Σ ledger = last running balance;
no sequence gaps; invoice lines = subtotal, subtotal − discount + charges = total; invoice settled = Σ allocations;
payment allocated = Σ allocations ≤ amount; balance = open receivables − free credit; stock on hand = Σ movements.

**Daily statement** keeps apart: sales revenue · paid at the counter · advance credit used at the sale · new
receivables (credit sales) · money collected (for today's sales / older debts / advances) · expenses · refunds ·
reversals · net cash. A credit sale is not cash, and an invoice and its payment are not two sales.

## 5. Pricing

- Default price per product, with effective-dated history (`ProductPrice`).
- Customer groups (shops, offices, resellers…) with group prices.
- Customer price per product, effective from a date; **temporary** prices with an end date win while active.
- Every change is logged (`PriceChangeLog`: old → new, who, when, why).
- Fast changes: on the customer's *Prices* tab, by clicking a cell on **Pricing**, or **Bulk change** (set a price,
  or change by an amount or a % for the ticked customers, effective from a date).
- Manual override at the sale needs `sales.override_price` and a reason; both the engine price and the charged
  price are stored on the line.

## 6. Roles

Super Admin (everything) · Admin (all but user management) · Accountant · Sales Staff · Delivery Staff. Permissions
are editable per role under **Users & roles**. Every page, server action and PDF route checks the permission on the
server. Sessions are server-side (httpOnly cookie, 12 h idle expiry, revoked on sign-out / password change / user
disabled); 5 wrong passwords lock the account for 15 minutes; passwords are bcrypt-hashed.

## 7. Production deployment (Windows server, same SQL Server)

```powershell
git pull
npm ci
npm run db:deploy
npm run build
$env:NODE_ENV="production"; npm start          # or run under a service manager (NSSM / pm2-windows-service)
```
- Put it behind IIS (URL Rewrite + ARR) or nginx with HTTPS and set `COOKIE_SECURE="true"`.
- Open only the web port in the firewall; keep SQL Server (1433) closed to the network.
- Rotate the `sa` password and keep `sa` unused; the app uses `water_app` only.

## 8. Backup and restore

Backup (full, checksummed and verified; keeps the last 30):
```powershell
powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 -Folder C:\Backups\WaterPortal
```
Schedule it daily in Task Scheduler and copy `C:\Backups\WaterPortal` to another disk or machine.

Restore (stops the app first; replaces the database):
```sql
ALTER DATABASE WaterPortal SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
RESTORE DATABASE WaterPortal FROM DISK = N'C:\Backups\WaterPortal\WaterPortal-YYYYMMDD-HHMMSS.bak' WITH REPLACE, CHECKSUM;
ALTER DATABASE WaterPortal SET MULTI_USER;
```
After a restore run **Financial reports → Run check**.

## 9. Moving to another database later

Business logic (`src/server/services`) uses only the Prisma API. To move to PostgreSQL: change `provider` in
`prisma/schema.prisma`, swap `@prisma/adapter-mssql` for `@prisma/adapter-pg` in `src/server/db.ts`, create a fresh
baseline migration, and port the SQL-Server-specific `integrity_constraints` migration (CHECKs + triggers) to
PostgreSQL syntax. Then copy the data (e.g. export/import per table) and run the reconciliation check.

## 10. Project layout

```
prisma/schema.prisma, migrations/, seed.ts     database
src/server/services/*.ts                       business logic (pricing, posting, sales, payments, adjustments, reports, …)
src/server/auth/*.ts                           sessions, passwords
src/server/pdf/*.tsx                           invoice, receipt, statement, daily report PDFs (/api/pdf/…)
src/app/(portal)/…                             pages; src/app/actions/*.ts server actions
tests/*.test.ts                                Vitest suites (ledger scenarios, pricing, sales, reports, deliveries)
scripts/backup.ps1                             database backup
```
