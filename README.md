# Water Portal — Water Distribution & Customer Financial Management

Full-stack portal for a purified-water distribution business (20 L containers and any other configured product):
customers with locally-known addresses, dynamic per-customer pricing, sales/invoices, payments, a debit/credit
customer ledger, statements, daily statements, expenses, stock, deliveries, users/roles and an audit log.

**Stack:** Next.js 16 (App Router, Server Components + Server Actions) · React 19 · TypeScript · Tailwind CSS 4 ·
shadcn-style UI (Radix) · Lucide · Recharts · Zod · Prisma 7 (driver adapter `@prisma/adapter-pg`) ·
PostgreSQL on Supabase · hosted on Vercel · @react-pdf/renderer · Vitest.

---

## 1. Quick start (this machine)

The database is the Supabase project **water** (PostgreSQL 17, region eu-west-1). `.env` already holds the
connection strings; the migrations are applied and the reference data is seeded. First admin sign-in:
`ADMIN-FIRST-LOGIN.txt` (delete after use).

```powershell
cd C:\Users\Suhayb\Desktop\my-project\water-portal
npm install            # also runs prisma generate
npm run dev            # http://localhost:3000 (uses the Supabase database)
```

## 2. Setting up from scratch

1. Create a Supabase project. **Connect → ORMs → Prisma** gives two URLs: the transaction pooler (port 6543) and
   the session pooler (port 5432).
2. `copy .env.example .env` and fill in `DATABASE_URL` (6543), `DIRECT_URL` (5432), `TEST_DATABASE_URL`
   (5432 + `?schema=test`) and `AUTH_SECRET`. URL-encode special characters in the password (`@` → `%40`).
3. Install, migrate, seed, run:
   ```powershell
   npm install
   npm run db:deploy      # prisma migrate deploy (uses DIRECT_URL) + prisma generate
   npm run db:seed        # roles, permissions, payment methods, expense categories, 20 L product, first admin
   npm run dev
   ```
   The seed writes the first admin password to `ADMIN-FIRST-LOGIN.txt`. The admin must choose a new password at
   first sign-in.

Security: Supabase exposes the `public` schema through its Data API. The integrity migration enables Row Level
Security on every table with no policies and revokes all privileges from `anon`/`authenticated`, so the API keys
can read nothing; the app connects through Prisma as the owner role. **A new table added in a later migration must
also get `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.**

## 3. Commands

| Command | What it does |
|---|---|
| `npm run dev` | development server (port 3000) |
| `npm run build` / `npm start` | production build / start (port 3000) |
| `npm test` | automated tests against `TEST_DATABASE_URL` (schema `test` or a database `waterportal_test`; the tests empty it). Over the internet to Supabase they are slow (~200 ms per query); a local PostgreSQL is much faster |
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

## 7. Production deployment (Vercel)

The GitHub repository `suheyb11/water` is imported into Vercel; every push to `main` deploys. Functions run in
`dub1` (Dublin, next to the Supabase database; `vercel.json`).

Vercel → Project → Settings → Environment Variables: `DATABASE_URL` (pooler 6543), `DIRECT_URL` (5432),
`AUTH_SECRET`, `BUSINESS_TIMEZONE`, `COOKIE_SECURE="true"`.

New migrations are applied from this machine before pushing the code that needs them: `npm run db:deploy`.

## 8. Backup and restore

Supabase takes daily backups (Project → Database → Backups; point-in-time recovery on paid plans). For an own copy:
`pg_dump "<DIRECT_URL>" -Fc -f water-YYYYMMDD.dump`, restore with `pg_restore`. After a restore run
**Financial reports → Run check**.

## 9. History

The portal first ran on SQL Server 2022 Express. It moved to PostgreSQL (Supabase) on 2026-11-24 with a fresh
baseline migration; the SQL Server migrations are in the git history.

## 10. Project layout

```
prisma/schema.prisma, migrations/, seed.ts     database
src/server/services/*.ts                       business logic (pricing, posting, sales, payments, adjustments, reports, …)
src/server/auth/*.ts                           sessions, passwords
src/server/pdf/*.tsx                           invoice, receipt, statement, daily report PDFs (/api/pdf/…)
src/app/(portal)/…                             pages; src/app/actions/*.ts server actions
tests/*.test.ts                                Vitest suites (ledger scenarios, pricing, sales, reports, deliveries)
```
