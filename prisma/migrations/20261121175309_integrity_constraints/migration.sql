-- Database-level financial integrity (defence in depth; the application enforces the same rules).
-- SQL Server syntax. When moving to PostgreSQL, port these as CHECK constraints + a BEFORE UPDATE/DELETE trigger.

-- Ledger: exactly one side, never negative
ALTER TABLE [dbo].[LedgerEntry] ADD CONSTRAINT [CK_LedgerEntry_OneSide]
  CHECK ([debit] >= 0 AND [credit] >= 0 AND ([debit] = 0 OR [credit] = 0) AND ([debit] > 0 OR [credit] > 0));

-- Allocations: positive, exactly one source
ALTER TABLE [dbo].[Allocation] ADD CONSTRAINT [CK_Allocation_Amount] CHECK ([amount] > 0);
ALTER TABLE [dbo].[Allocation] ADD CONSTRAINT [CK_Allocation_OneSource]
  CHECK (([paymentId] IS NOT NULL AND [creditNoteId] IS NULL) OR ([paymentId] IS NULL AND [creditNoteId] IS NOT NULL));

-- Payments / credit notes: positive, never over-allocated
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [CK_Payment_Amounts] CHECK ([amount] > 0 AND [allocated] >= 0 AND [allocated] <= [amount] AND [advanceAtReceipt] >= 0);
ALTER TABLE [dbo].[CreditNote] ADD CONSTRAINT [CK_CreditNote_Amounts] CHECK ([amount] > 0 AND [allocated] >= 0 AND [allocated] <= [amount]);

-- Invoices: no negative totals, never settled beyond the total (unless cancelled)
ALTER TABLE [dbo].[Invoice] ADD CONSTRAINT [CK_Invoice_Amounts]
  CHECK ([subtotal] >= 0 AND [discount] >= 0 AND [charges] >= 0 AND [total] >= 0 AND [amountSettled] >= 0 AND [paidAtSale] >= 0 AND [creditAtSale] >= 0
         AND ([status] = 'CANCELLED' OR [amountSettled] <= [total]));
ALTER TABLE [dbo].[InvoiceItem] ADD CONSTRAINT [CK_InvoiceItem_Amounts] CHECK ([quantity] > 0 AND [unitPrice] >= 0 AND [lineTotal] >= 0 AND [quantityReturned] >= 0 AND [quantityReturned] <= [quantity]);

-- Other money columns
ALTER TABLE [dbo].[Expense] ADD CONSTRAINT [CK_Expense_Amount] CHECK ([amount] > 0);
ALTER TABLE [dbo].[Refund] ADD CONSTRAINT [CK_Refund_Amount] CHECK ([amount] > 0);
ALTER TABLE [dbo].[CustomerProductPrice] ADD CONSTRAINT [CK_CustomerPrice] CHECK ([price] >= 0 AND ([effectiveTo] IS NULL OR [effectiveTo] >= [effectiveFrom]));
ALTER TABLE [dbo].[ProductPrice] ADD CONSTRAINT [CK_ProductPrice] CHECK ([price] >= 0 AND ([effectiveTo] IS NULL OR [effectiveTo] >= [effectiveFrom]));
ALTER TABLE [dbo].[StockMovement] ADD CONSTRAINT [CK_StockMovement_NonZero] CHECK ([quantity] <> 0);

-- (CREATE TRIGGER must start a batch, hence EXEC.)
-- Posted ledger entries, stock movements and audit records are append-only.
EXEC(N'CREATE TRIGGER [dbo].[TR_LedgerEntry_AppendOnly] ON [dbo].[LedgerEntry] INSTEAD OF UPDATE, DELETE AS BEGIN SET NOCOUNT ON; THROW 51000, ''Posted ledger entries cannot be changed or deleted. Post a reversal or adjustment instead.'', 1; END');

EXEC(N'CREATE TRIGGER [dbo].[TR_StockMovement_AppendOnly] ON [dbo].[StockMovement] INSTEAD OF UPDATE, DELETE AS BEGIN SET NOCOUNT ON; THROW 51001, ''Stock movements cannot be changed or deleted. Record an adjustment instead.'', 1; END');

EXEC(N'CREATE TRIGGER [dbo].[TR_AuditLog_AppendOnly] ON [dbo].[AuditLog] INSTEAD OF UPDATE, DELETE AS BEGIN SET NOCOUNT ON; THROW 51002, ''The audit log cannot be changed or deleted.'', 1; END');
