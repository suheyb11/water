-- Database-level financial integrity (defence in depth; the application enforces the same rules).

-- Ledger: exactly one side, never negative
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "CK_LedgerEntry_OneSide"
  CHECK ("debit" >= 0 AND "credit" >= 0 AND ("debit" = 0 OR "credit" = 0) AND ("debit" > 0 OR "credit" > 0));

-- Allocations: positive, exactly one source
ALTER TABLE "Allocation" ADD CONSTRAINT "CK_Allocation_Amount" CHECK ("amount" > 0);
ALTER TABLE "Allocation" ADD CONSTRAINT "CK_Allocation_OneSource"
  CHECK (("paymentId" IS NOT NULL AND "creditNoteId" IS NULL) OR ("paymentId" IS NULL AND "creditNoteId" IS NOT NULL));

-- Payments / credit notes: positive, never over-allocated
ALTER TABLE "Payment" ADD CONSTRAINT "CK_Payment_Amounts" CHECK ("amount" > 0 AND "allocated" >= 0 AND "allocated" <= "amount" AND "advanceAtReceipt" >= 0);
ALTER TABLE "CreditNote" ADD CONSTRAINT "CK_CreditNote_Amounts" CHECK ("amount" > 0 AND "allocated" >= 0 AND "allocated" <= "amount");

-- Invoices: no negative totals, never settled beyond the total (unless cancelled)
ALTER TABLE "Invoice" ADD CONSTRAINT "CK_Invoice_Amounts"
  CHECK ("subtotal" >= 0 AND "discount" >= 0 AND "charges" >= 0 AND "total" >= 0 AND "amountSettled" >= 0 AND "paidAtSale" >= 0 AND "creditAtSale" >= 0
         AND ("status" = 'CANCELLED' OR "amountSettled" <= "total"));
ALTER TABLE "InvoiceItem" ADD CONSTRAINT "CK_InvoiceItem_Amounts" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "lineTotal" >= 0 AND "quantityReturned" >= 0 AND "quantityReturned" <= "quantity");

-- Other money columns
ALTER TABLE "Expense" ADD CONSTRAINT "CK_Expense_Amount" CHECK ("amount" > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "CK_Refund_Amount" CHECK ("amount" > 0);
ALTER TABLE "CustomerProductPrice" ADD CONSTRAINT "CK_CustomerPrice" CHECK ("price" >= 0 AND ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"));
ALTER TABLE "ProductPrice" ADD CONSTRAINT "CK_ProductPrice" CHECK ("price" >= 0 AND ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom"));
ALTER TABLE "StockMovement" ADD CONSTRAINT "CK_StockMovement_NonZero" CHECK ("quantity" <> 0);

-- Posted ledger entries, stock movements and audit records are append-only.
-- (TRUNCATE is not blocked: the test suite empties these tables with it.)
CREATE FUNCTION "append_only_guard"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '%', TG_ARGV[0] USING ERRCODE = 'P0001';
END;
$$;

CREATE TRIGGER "TR_LedgerEntry_AppendOnly" BEFORE UPDATE OR DELETE ON "LedgerEntry"
  FOR EACH ROW EXECUTE FUNCTION "append_only_guard"('Posted ledger entries cannot be changed or deleted. Post a reversal or adjustment instead.');
CREATE TRIGGER "TR_StockMovement_AppendOnly" BEFORE UPDATE OR DELETE ON "StockMovement"
  FOR EACH ROW EXECUTE FUNCTION "append_only_guard"('Stock movements cannot be changed or deleted. Record an adjustment instead.');
CREATE TRIGGER "TR_AuditLog_AppendOnly" BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION "append_only_guard"('The audit log cannot be changed or deleted.');

-- Supabase exposes the public schema through its Data API (anon/authenticated keys). This app talks to the
-- database only through Prisma (as the owner role, which bypasses RLS), so lock the API out completely:
-- RLS on with no policies, and no table privileges for the API roles (also for tables created later).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;
    REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
  END IF;
END $$;
