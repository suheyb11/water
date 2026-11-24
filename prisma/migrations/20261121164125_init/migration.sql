BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[User] (
    [id] INT NOT NULL IDENTITY(1,1),
    [username] NVARCHAR(60) NOT NULL,
    [fullName] NVARCHAR(120) NOT NULL,
    [email] NVARCHAR(160),
    [phone] NVARCHAR(40),
    [passwordHash] NVARCHAR(200) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [User_isActive_df] DEFAULT 1,
    [mustChangePassword] BIT NOT NULL CONSTRAINT [User_mustChangePassword_df] DEFAULT 0,
    [failedLogins] INT NOT NULL CONSTRAINT [User_failedLogins_df] DEFAULT 0,
    [lockedUntil] DATETIME2,
    [lastLoginAt] DATETIME2,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [User_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [User_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [User_username_key] UNIQUE NONCLUSTERED ([username])
);

-- CreateTable
CREATE TABLE [dbo].[Role] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(40) NOT NULL,
    [name] NVARCHAR(80) NOT NULL,
    [description] NVARCHAR(400),
    [isSystem] BIT NOT NULL CONSTRAINT [Role_isSystem_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Role_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Role_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Role_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Permission] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(80) NOT NULL,
    [module] NVARCHAR(40) NOT NULL,
    [description] NVARCHAR(300) NOT NULL,
    CONSTRAINT [Permission_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Permission_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[RolePermission] (
    [roleId] INT NOT NULL,
    [permissionId] INT NOT NULL,
    CONSTRAINT [RolePermission_pkey] PRIMARY KEY CLUSTERED ([roleId],[permissionId])
);

-- CreateTable
CREATE TABLE [dbo].[UserRole] (
    [userId] INT NOT NULL,
    [roleId] INT NOT NULL,
    CONSTRAINT [UserRole_pkey] PRIMARY KEY CLUSTERED ([userId],[roleId])
);

-- CreateTable
CREATE TABLE [dbo].[Session] (
    [id] NVARCHAR(64) NOT NULL,
    [userId] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Session_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [expiresAt] DATETIME2 NOT NULL,
    [lastSeenAt] DATETIME2 NOT NULL CONSTRAINT [Session_lastSeenAt_df] DEFAULT CURRENT_TIMESTAMP,
    [revokedAt] DATETIME2,
    [ip] NVARCHAR(64),
    [userAgent] NVARCHAR(300),
    CONSTRAINT [Session_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AuditLog] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [at] DATETIME2 NOT NULL CONSTRAINT [AuditLog_at_df] DEFAULT CURRENT_TIMESTAMP,
    [userId] INT,
    [action] NVARCHAR(80) NOT NULL,
    [entity] NVARCHAR(60) NOT NULL,
    [entityId] NVARCHAR(60),
    [summary] NVARCHAR(500),
    [before] NVARCHAR(max),
    [after] NVARCHAR(max),
    [ip] NVARCHAR(64),
    CONSTRAINT [AuditLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[IdempotencyKey] (
    [key] NVARCHAR(100) NOT NULL,
    [operation] NVARCHAR(40) NOT NULL,
    [resultId] NVARCHAR(60) NOT NULL,
    [userId] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [IdempotencyKey_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [IdempotencyKey_pkey] PRIMARY KEY CLUSTERED ([key])
);

-- CreateTable
CREATE TABLE [dbo].[DocumentSequence] (
    [key] NVARCHAR(40) NOT NULL,
    [nextValue] INT NOT NULL CONSTRAINT [DocumentSequence_nextValue_df] DEFAULT 1,
    CONSTRAINT [DocumentSequence_pkey] PRIMARY KEY CLUSTERED ([key])
);

-- CreateTable
CREATE TABLE [dbo].[BusinessSettings] (
    [id] INT NOT NULL CONSTRAINT [BusinessSettings_id_df] DEFAULT 1,
    [companyName] NVARCHAR(160) NOT NULL,
    [tagline] NVARCHAR(200),
    [address] NVARCHAR(400),
    [phone] NVARCHAR(80),
    [email] NVARCHAR(160),
    [taxNumber] NVARCHAR(80),
    [logoDataUrl] NVARCHAR(max),
    [currencyCode] NVARCHAR(3) NOT NULL CONSTRAINT [BusinessSettings_currencyCode_df] DEFAULT 'USD',
    [currencySymbol] NVARCHAR(8) NOT NULL CONSTRAINT [BusinessSettings_currencySymbol_df] DEFAULT '$',
    [timezone] NVARCHAR(60) NOT NULL CONSTRAINT [BusinessSettings_timezone_df] DEFAULT 'Africa/Mogadishu',
    [invoicePrefix] NVARCHAR(12) NOT NULL CONSTRAINT [BusinessSettings_invoicePrefix_df] DEFAULT 'INV',
    [receiptPrefix] NVARCHAR(12) NOT NULL CONSTRAINT [BusinessSettings_receiptPrefix_df] DEFAULT 'RCPT',
    [creditNotePrefix] NVARCHAR(12) NOT NULL CONSTRAINT [BusinessSettings_creditNotePrefix_df] DEFAULT 'CN',
    [paymentTermsDays] INT NOT NULL CONSTRAINT [BusinessSettings_paymentTermsDays_df] DEFAULT 30,
    [allowNegativeStock] BIT NOT NULL CONSTRAINT [BusinessSettings_allowNegativeStock_df] DEFAULT 0,
    [lowStockThreshold] DECIMAL(18,3) NOT NULL CONSTRAINT [BusinessSettings_lowStockThreshold_df] DEFAULT 50,
    [invoiceFooter] NVARCHAR(600),
    [updatedAt] DATETIME2 NOT NULL,
    [updatedById] INT,
    CONSTRAINT [BusinessSettings_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PaymentMethod] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(30) NOT NULL,
    [name] NVARCHAR(80) NOT NULL,
    [kind] NVARCHAR(20) NOT NULL,
    [isActive] BIT NOT NULL CONSTRAINT [PaymentMethod_isActive_df] DEFAULT 1,
    [sortOrder] INT NOT NULL CONSTRAINT [PaymentMethod_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PaymentMethod_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PaymentMethod_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [PaymentMethod_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Location] (
    [id] INT NOT NULL IDENTITY(1,1),
    [kind] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [alsoKnownAs] NVARCHAR(300),
    [description] NVARCHAR(600),
    [parentId] INT,
    [latitude] DECIMAL(10,7),
    [longitude] DECIMAL(10,7),
    [isActive] BIT NOT NULL CONSTRAINT [Location_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Location_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Location_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Location_kind_parentId_name_key] UNIQUE NONCLUSTERED ([kind],[parentId],[name])
);

-- CreateTable
CREATE TABLE [dbo].[CustomerGroup] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(30) NOT NULL,
    [name] NVARCHAR(100) NOT NULL,
    [description] NVARCHAR(300),
    [isActive] BIT NOT NULL CONSTRAINT [CustomerGroup_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CustomerGroup_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CustomerGroup_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CustomerGroup_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[Customer] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(20) NOT NULL,
    [name] NVARCHAR(160) NOT NULL,
    [phone] NVARCHAR(40) NOT NULL,
    [altPhone] NVARCHAR(40),
    [customerType] NVARCHAR(30) NOT NULL CONSTRAINT [Customer_customerType_df] DEFAULT 'RESIDENTIAL',
    [groupId] INT,
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [Customer_status_df] DEFAULT 'ACTIVE',
    [registeredOn] DATE NOT NULL,
    [creditLimit] DECIMAL(18,2),
    [notes] NVARCHAR(1000),
    [balance] DECIMAL(18,2) NOT NULL CONSTRAINT [Customer_balance_df] DEFAULT 0,
    [lockVersion] INT NOT NULL CONSTRAINT [Customer_lockVersion_df] DEFAULT 0,
    [createdById] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Customer_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Customer_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Customer_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[CustomerAddress] (
    [id] INT NOT NULL IDENTITY(1,1),
    [customerId] INT NOT NULL,
    [label] NVARCHAR(60) NOT NULL CONSTRAINT [CustomerAddress_label_df] DEFAULT 'Main',
    [isPrimary] BIT NOT NULL CONSTRAINT [CustomerAddress_isPrimary_df] DEFAULT 1,
    [localName] NVARCHAR(200) NOT NULL,
    [officialAddress] NVARCHAR(300),
    [districtId] INT,
    [neighborhoodId] INT,
    [placeId] INT,
    [description] NVARCHAR(600),
    [deliveryInstructions] NVARCHAR(600),
    [latitude] DECIMAL(10,7),
    [longitude] DECIMAL(10,7),
    [isActive] BIT NOT NULL CONSTRAINT [CustomerAddress_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CustomerAddress_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [CustomerAddress_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Product] (
    [id] INT NOT NULL IDENTITY(1,1),
    [code] NVARCHAR(30) NOT NULL,
    [name] NVARCHAR(120) NOT NULL,
    [description] NVARCHAR(500),
    [capacity] DECIMAL(18,3) NOT NULL,
    [capacityUnit] NVARCHAR(12) NOT NULL CONSTRAINT [Product_capacityUnit_df] DEFAULT 'L',
    [saleUnit] NVARCHAR(30) NOT NULL CONSTRAINT [Product_saleUnit_df] DEFAULT 'container',
    [defaultPrice] DECIMAL(18,4) NOT NULL,
    [costPrice] DECIMAL(18,4) NOT NULL CONSTRAINT [Product_costPrice_df] DEFAULT 0,
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [Product_status_df] DEFAULT 'ACTIVE',
    [trackStock] BIT NOT NULL CONSTRAINT [Product_trackStock_df] DEFAULT 1,
    [reorderLevel] DECIMAL(18,3) NOT NULL CONSTRAINT [Product_reorderLevel_df] DEFAULT 0,
    [sortOrder] INT NOT NULL CONSTRAINT [Product_sortOrder_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Product_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Product_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Product_code_key] UNIQUE NONCLUSTERED ([code])
);

-- CreateTable
CREATE TABLE [dbo].[ProductPrice] (
    [id] INT NOT NULL IDENTITY(1,1),
    [productId] INT NOT NULL,
    [price] DECIMAL(18,4) NOT NULL,
    [effectiveFrom] DATE NOT NULL,
    [effectiveTo] DATE,
    [reason] NVARCHAR(300),
    [createdById] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ProductPrice_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ProductPrice_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[GroupProductPrice] (
    [id] INT NOT NULL IDENTITY(1,1),
    [groupId] INT NOT NULL,
    [productId] INT NOT NULL,
    [price] DECIMAL(18,4) NOT NULL,
    [effectiveFrom] DATE NOT NULL,
    [effectiveTo] DATE,
    [isActive] BIT NOT NULL CONSTRAINT [GroupProductPrice_isActive_df] DEFAULT 1,
    [createdById] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [GroupProductPrice_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [GroupProductPrice_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[CustomerProductPrice] (
    [id] INT NOT NULL IDENTITY(1,1),
    [customerId] INT NOT NULL,
    [productId] INT NOT NULL,
    [price] DECIMAL(18,4) NOT NULL,
    [effectiveFrom] DATE NOT NULL,
    [effectiveTo] DATE,
    [isTemporary] BIT NOT NULL CONSTRAINT [CustomerProductPrice_isTemporary_df] DEFAULT 0,
    [isActive] BIT NOT NULL CONSTRAINT [CustomerProductPrice_isActive_df] DEFAULT 1,
    [reason] NVARCHAR(300),
    [createdById] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CustomerProductPrice_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [endedById] INT,
    [endedAt] DATETIME2,
    CONSTRAINT [CustomerProductPrice_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[PriceChangeLog] (
    [id] INT NOT NULL IDENTITY(1,1),
    [level] NVARCHAR(12) NOT NULL,
    [productId] INT NOT NULL,
    [customerId] INT,
    [groupId] INT,
    [oldPrice] DECIMAL(18,4),
    [newPrice] DECIMAL(18,4),
    [effectiveFrom] DATE NOT NULL,
    [effectiveTo] DATE,
    [action] NVARCHAR(20) NOT NULL,
    [reason] NVARCHAR(300),
    [changedById] INT,
    [changedAt] DATETIME2 NOT NULL CONSTRAINT [PriceChangeLog_changedAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [PriceChangeLog_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Invoice] (
    [id] INT NOT NULL IDENTITY(1,1),
    [number] NVARCHAR(30) NOT NULL,
    [kind] NVARCHAR(20) NOT NULL CONSTRAINT [Invoice_kind_df] DEFAULT 'SALE',
    [customerId] INT NOT NULL,
    [addressId] INT,
    [invoiceDate] DATE NOT NULL,
    [dueDate] DATE,
    [status] NVARCHAR(20) NOT NULL,
    [subtotal] DECIMAL(18,2) NOT NULL CONSTRAINT [Invoice_subtotal_df] DEFAULT 0,
    [discount] DECIMAL(18,2) NOT NULL CONSTRAINT [Invoice_discount_df] DEFAULT 0,
    [charges] DECIMAL(18,2) NOT NULL CONSTRAINT [Invoice_charges_df] DEFAULT 0,
    [total] DECIMAL(18,2) NOT NULL,
    [amountSettled] DECIMAL(18,2) NOT NULL CONSTRAINT [Invoice_amountSettled_df] DEFAULT 0,
    [paidAtSale] DECIMAL(18,2) NOT NULL CONSTRAINT [Invoice_paidAtSale_df] DEFAULT 0,
    [totalQuantity] DECIMAL(18,3) NOT NULL CONSTRAINT [Invoice_totalQuantity_df] DEFAULT 0,
    [relatedInvoiceId] INT,
    [notes] NVARCHAR(1000),
    [customerName] NVARCHAR(160) NOT NULL,
    [customerPhone] NVARCHAR(40),
    [addressText] NVARCHAR(600),
    [cancelledAt] DATETIME2,
    [cancelledById] INT,
    [cancelReason] NVARCHAR(400),
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Invoice_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    [lockVersion] INT NOT NULL CONSTRAINT [Invoice_lockVersion_df] DEFAULT 0,
    CONSTRAINT [Invoice_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Invoice_number_key] UNIQUE NONCLUSTERED ([number])
);

-- CreateTable
CREATE TABLE [dbo].[InvoiceItem] (
    [id] INT NOT NULL IDENTITY(1,1),
    [invoiceId] INT NOT NULL,
    [lineNo] INT NOT NULL,
    [productId] INT NOT NULL,
    [productCode] NVARCHAR(30) NOT NULL,
    [productName] NVARCHAR(120) NOT NULL,
    [capacity] DECIMAL(18,3) NOT NULL,
    [capacityUnit] NVARCHAR(12) NOT NULL,
    [saleUnit] NVARCHAR(30) NOT NULL,
    [quantity] DECIMAL(18,3) NOT NULL,
    [unitPrice] DECIMAL(18,4) NOT NULL,
    [resolvedPrice] DECIMAL(18,4) NOT NULL,
    [priceSource] NVARCHAR(20) NOT NULL,
    [priceRefId] INT,
    [overrideReason] NVARCHAR(300),
    [lineTotal] DECIMAL(18,2) NOT NULL,
    [quantityReturned] DECIMAL(18,3) NOT NULL CONSTRAINT [InvoiceItem_quantityReturned_df] DEFAULT 0,
    [unitCost] DECIMAL(18,4) NOT NULL CONSTRAINT [InvoiceItem_unitCost_df] DEFAULT 0,
    CONSTRAINT [InvoiceItem_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [InvoiceItem_invoiceId_lineNo_key] UNIQUE NONCLUSTERED ([invoiceId],[lineNo])
);

-- CreateTable
CREATE TABLE [dbo].[Payment] (
    [id] INT NOT NULL IDENTITY(1,1),
    [number] NVARCHAR(30) NOT NULL,
    [customerId] INT NOT NULL,
    [paymentDate] DATE NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [methodId] INT NOT NULL,
    [reference] NVARCHAR(120),
    [notes] NVARCHAR(600),
    [allocated] DECIMAL(18,2) NOT NULL CONSTRAINT [Payment_allocated_df] DEFAULT 0,
    [advanceAtReceipt] DECIMAL(18,2) NOT NULL CONSTRAINT [Payment_advanceAtReceipt_df] DEFAULT 0,
    [receivedAtSale] BIT NOT NULL CONSTRAINT [Payment_receivedAtSale_df] DEFAULT 0,
    [saleInvoiceId] INT,
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [Payment_status_df] DEFAULT 'POSTED',
    [reversedAt] DATETIME2,
    [reversedById] INT,
    [reverseReason] NVARCHAR(400),
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Payment_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Payment_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Payment_number_key] UNIQUE NONCLUSTERED ([number])
);

-- CreateTable
CREATE TABLE [dbo].[CreditNote] (
    [id] INT NOT NULL IDENTITY(1,1),
    [number] NVARCHAR(30) NOT NULL,
    [kind] NVARCHAR(20) NOT NULL,
    [customerId] INT NOT NULL,
    [invoiceId] INT,
    [noteDate] DATE NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [allocated] DECIMAL(18,2) NOT NULL CONSTRAINT [CreditNote_allocated_df] DEFAULT 0,
    [reason] NVARCHAR(400) NOT NULL,
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [CreditNote_status_df] DEFAULT 'POSTED',
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [CreditNote_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [CreditNote_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [CreditNote_number_key] UNIQUE NONCLUSTERED ([number])
);

-- CreateTable
CREATE TABLE [dbo].[CreditNoteItem] (
    [id] INT NOT NULL IDENTITY(1,1),
    [creditNoteId] INT NOT NULL,
    [invoiceItemId] INT,
    [productId] INT NOT NULL,
    [productName] NVARCHAR(120) NOT NULL,
    [quantity] DECIMAL(18,3) NOT NULL,
    [unitPrice] DECIMAL(18,4) NOT NULL,
    [lineTotal] DECIMAL(18,2) NOT NULL,
    [restock] BIT NOT NULL CONSTRAINT [CreditNoteItem_restock_df] DEFAULT 1,
    CONSTRAINT [CreditNoteItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Allocation] (
    [id] INT NOT NULL IDENTITY(1,1),
    [invoiceId] INT NOT NULL,
    [paymentId] INT,
    [creditNoteId] INT,
    [amount] DECIMAL(18,2) NOT NULL,
    [allocatedOn] DATE NOT NULL,
    [createdById] INT,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Allocation_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [reversedAt] DATETIME2,
    [reversedById] INT,
    [reverseReason] NVARCHAR(300),
    CONSTRAINT [Allocation_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Refund] (
    [id] INT NOT NULL IDENTITY(1,1),
    [customerId] INT NOT NULL,
    [invoiceId] INT NOT NULL,
    [refundDate] DATE NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [methodId] INT NOT NULL,
    [reference] NVARCHAR(120),
    [reason] NVARCHAR(400) NOT NULL,
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Refund_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Refund_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Refund_invoiceId_key] UNIQUE NONCLUSTERED ([invoiceId])
);

-- CreateTable
CREATE TABLE [dbo].[LedgerEntry] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [customerId] INT NOT NULL,
    [seq] INT NOT NULL,
    [txDate] DATE NOT NULL,
    [type] NVARCHAR(30) NOT NULL,
    [debit] DECIMAL(18,2) NOT NULL CONSTRAINT [LedgerEntry_debit_df] DEFAULT 0,
    [credit] DECIMAL(18,2) NOT NULL CONSTRAINT [LedgerEntry_credit_df] DEFAULT 0,
    [balanceAfter] DECIMAL(18,2) NOT NULL,
    [reference] NVARCHAR(40) NOT NULL,
    [invoiceId] INT,
    [paymentId] INT,
    [creditNoteId] INT,
    [refundId] INT,
    [description] NVARCHAR(400) NOT NULL,
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [LedgerEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [LedgerEntry_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [LedgerEntry_customerId_seq_key] UNIQUE NONCLUSTERED ([customerId],[seq])
);

-- CreateTable
CREATE TABLE [dbo].[ExpenseCategory] (
    [id] INT NOT NULL IDENTITY(1,1),
    [name] NVARCHAR(80) NOT NULL,
    [description] NVARCHAR(300),
    [isActive] BIT NOT NULL CONSTRAINT [ExpenseCategory_isActive_df] DEFAULT 1,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [ExpenseCategory_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ExpenseCategory_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [ExpenseCategory_name_key] UNIQUE NONCLUSTERED ([name])
);

-- CreateTable
CREATE TABLE [dbo].[Expense] (
    [id] INT NOT NULL IDENTITY(1,1),
    [number] NVARCHAR(30) NOT NULL,
    [categoryId] INT NOT NULL,
    [expenseDate] DATE NOT NULL,
    [description] NVARCHAR(400) NOT NULL,
    [amount] DECIMAL(18,2) NOT NULL,
    [methodId] INT NOT NULL,
    [reference] NVARCHAR(120),
    [payee] NVARCHAR(160),
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [Expense_status_df] DEFAULT 'POSTED',
    [voidedAt] DATETIME2,
    [voidedById] INT,
    [voidReason] NVARCHAR(300),
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Expense_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [Expense_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Expense_number_key] UNIQUE NONCLUSTERED ([number])
);

-- CreateTable
CREATE TABLE [dbo].[Inventory] (
    [productId] INT NOT NULL,
    [onHand] DECIMAL(18,3) NOT NULL CONSTRAINT [Inventory_onHand_df] DEFAULT 0,
    [lockVersion] INT NOT NULL CONSTRAINT [Inventory_lockVersion_df] DEFAULT 0,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Inventory_pkey] PRIMARY KEY CLUSTERED ([productId])
);

-- CreateTable
CREATE TABLE [dbo].[StockMovement] (
    [id] BIGINT NOT NULL IDENTITY(1,1),
    [productId] INT NOT NULL,
    [moveDate] DATE NOT NULL,
    [type] NVARCHAR(20) NOT NULL,
    [quantity] DECIMAL(18,3) NOT NULL,
    [balanceAfter] DECIMAL(18,3) NOT NULL,
    [unitCost] DECIMAL(18,4),
    [reference] NVARCHAR(40) NOT NULL,
    [invoiceId] INT,
    [creditNoteId] INT,
    [notes] NVARCHAR(400),
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [StockMovement_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [StockMovement_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Delivery] (
    [id] INT NOT NULL IDENTITY(1,1),
    [number] NVARCHAR(30) NOT NULL,
    [customerId] INT NOT NULL,
    [addressId] INT,
    [invoiceId] INT,
    [scheduledDate] DATE NOT NULL,
    [status] NVARCHAR(20) NOT NULL CONSTRAINT [Delivery_status_df] DEFAULT 'PENDING',
    [assignedToId] INT,
    [notes] NVARCHAR(600),
    [failureReason] NVARCHAR(300),
    [deliveredAt] DATETIME2,
    [receivedBy] NVARCHAR(120),
    [confirmationNote] NVARCHAR(400),
    [addressText] NVARCHAR(600),
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Delivery_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Delivery_pkey] PRIMARY KEY CLUSTERED ([id]),
    CONSTRAINT [Delivery_number_key] UNIQUE NONCLUSTERED ([number]),
    CONSTRAINT [Delivery_invoiceId_key] UNIQUE NONCLUSTERED ([invoiceId])
);

-- CreateTable
CREATE TABLE [dbo].[DeliveryItem] (
    [id] INT NOT NULL IDENTITY(1,1),
    [deliveryId] INT NOT NULL,
    [productId] INT NOT NULL,
    [quantity] DECIMAL(18,3) NOT NULL,
    CONSTRAINT [DeliveryItem_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[DeliveryEvent] (
    [id] INT NOT NULL IDENTITY(1,1),
    [deliveryId] INT NOT NULL,
    [fromStatus] NVARCHAR(20),
    [toStatus] NVARCHAR(20) NOT NULL,
    [note] NVARCHAR(400),
    [userId] INT,
    [at] DATETIME2 NOT NULL CONSTRAINT [DeliveryEvent_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [DeliveryEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Session_userId_idx] ON [dbo].[Session]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_entity_entityId_idx] ON [dbo].[AuditLog]([entity], [entityId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_at_idx] ON [dbo].[AuditLog]([at]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [AuditLog_userId_idx] ON [dbo].[AuditLog]([userId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Location_name_idx] ON [dbo].[Location]([name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Customer_name_idx] ON [dbo].[Customer]([name]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Customer_phone_idx] ON [dbo].[Customer]([phone]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Customer_altPhone_idx] ON [dbo].[Customer]([altPhone]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Customer_status_idx] ON [dbo].[Customer]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerAddress_customerId_idx] ON [dbo].[CustomerAddress]([customerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerAddress_localName_idx] ON [dbo].[CustomerAddress]([localName]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerAddress_neighborhoodId_idx] ON [dbo].[CustomerAddress]([neighborhoodId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerAddress_districtId_idx] ON [dbo].[CustomerAddress]([districtId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerAddress_placeId_idx] ON [dbo].[CustomerAddress]([placeId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ProductPrice_productId_effectiveFrom_idx] ON [dbo].[ProductPrice]([productId], [effectiveFrom]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [GroupProductPrice_groupId_productId_effectiveFrom_idx] ON [dbo].[GroupProductPrice]([groupId], [productId], [effectiveFrom]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerProductPrice_customerId_productId_effectiveFrom_idx] ON [dbo].[CustomerProductPrice]([customerId], [productId], [effectiveFrom]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CustomerProductPrice_productId_idx] ON [dbo].[CustomerProductPrice]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PriceChangeLog_customerId_productId_idx] ON [dbo].[PriceChangeLog]([customerId], [productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PriceChangeLog_productId_idx] ON [dbo].[PriceChangeLog]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PriceChangeLog_changedAt_idx] ON [dbo].[PriceChangeLog]([changedAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Invoice_customerId_invoiceDate_idx] ON [dbo].[Invoice]([customerId], [invoiceDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Invoice_invoiceDate_idx] ON [dbo].[Invoice]([invoiceDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Invoice_status_idx] ON [dbo].[Invoice]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Invoice_kind_idx] ON [dbo].[Invoice]([kind]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [InvoiceItem_productId_idx] ON [dbo].[InvoiceItem]([productId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_customerId_paymentDate_idx] ON [dbo].[Payment]([customerId], [paymentDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_paymentDate_idx] ON [dbo].[Payment]([paymentDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Payment_status_idx] ON [dbo].[Payment]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CreditNote_customerId_noteDate_idx] ON [dbo].[CreditNote]([customerId], [noteDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CreditNote_noteDate_idx] ON [dbo].[CreditNote]([noteDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [CreditNoteItem_creditNoteId_idx] ON [dbo].[CreditNoteItem]([creditNoteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Allocation_invoiceId_idx] ON [dbo].[Allocation]([invoiceId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Allocation_paymentId_idx] ON [dbo].[Allocation]([paymentId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Allocation_creditNoteId_idx] ON [dbo].[Allocation]([creditNoteId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Refund_refundDate_idx] ON [dbo].[Refund]([refundDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LedgerEntry_customerId_txDate_idx] ON [dbo].[LedgerEntry]([customerId], [txDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LedgerEntry_txDate_idx] ON [dbo].[LedgerEntry]([txDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [LedgerEntry_type_idx] ON [dbo].[LedgerEntry]([type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Expense_expenseDate_idx] ON [dbo].[Expense]([expenseDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Expense_categoryId_idx] ON [dbo].[Expense]([categoryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockMovement_productId_moveDate_idx] ON [dbo].[StockMovement]([productId], [moveDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockMovement_moveDate_idx] ON [dbo].[StockMovement]([moveDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [StockMovement_type_idx] ON [dbo].[StockMovement]([type]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Delivery_scheduledDate_idx] ON [dbo].[Delivery]([scheduledDate]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Delivery_status_idx] ON [dbo].[Delivery]([status]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Delivery_assignedToId_idx] ON [dbo].[Delivery]([assignedToId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [Delivery_customerId_idx] ON [dbo].[Delivery]([customerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DeliveryItem_deliveryId_idx] ON [dbo].[DeliveryItem]([deliveryId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [DeliveryEvent_deliveryId_idx] ON [dbo].[DeliveryEvent]([deliveryId]);

-- AddForeignKey
ALTER TABLE [dbo].[RolePermission] ADD CONSTRAINT [RolePermission_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[Role]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[RolePermission] ADD CONSTRAINT [RolePermission_permissionId_fkey] FOREIGN KEY ([permissionId]) REFERENCES [dbo].[Permission]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[UserRole] ADD CONSTRAINT [UserRole_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[UserRole] ADD CONSTRAINT [UserRole_roleId_fkey] FOREIGN KEY ([roleId]) REFERENCES [dbo].[Role]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Session] ADD CONSTRAINT [Session_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AuditLog] ADD CONSTRAINT [AuditLog_userId_fkey] FOREIGN KEY ([userId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Location] ADD CONSTRAINT [Location_parentId_fkey] FOREIGN KEY ([parentId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Customer] ADD CONSTRAINT [Customer_groupId_fkey] FOREIGN KEY ([groupId]) REFERENCES [dbo].[CustomerGroup]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CustomerAddress] ADD CONSTRAINT [CustomerAddress_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customer]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CustomerAddress] ADD CONSTRAINT [CustomerAddress_districtId_fkey] FOREIGN KEY ([districtId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CustomerAddress] ADD CONSTRAINT [CustomerAddress_neighborhoodId_fkey] FOREIGN KEY ([neighborhoodId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CustomerAddress] ADD CONSTRAINT [CustomerAddress_placeId_fkey] FOREIGN KEY ([placeId]) REFERENCES [dbo].[Location]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ProductPrice] ADD CONSTRAINT [ProductPrice_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GroupProductPrice] ADD CONSTRAINT [GroupProductPrice_groupId_fkey] FOREIGN KEY ([groupId]) REFERENCES [dbo].[CustomerGroup]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[GroupProductPrice] ADD CONSTRAINT [GroupProductPrice_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CustomerProductPrice] ADD CONSTRAINT [CustomerProductPrice_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customer]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CustomerProductPrice] ADD CONSTRAINT [CustomerProductPrice_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Invoice] ADD CONSTRAINT [Invoice_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customer]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Invoice] ADD CONSTRAINT [Invoice_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Invoice] ADD CONSTRAINT [Invoice_relatedInvoiceId_fkey] FOREIGN KEY ([relatedInvoiceId]) REFERENCES [dbo].[Invoice]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InvoiceItem] ADD CONSTRAINT [InvoiceItem_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[Invoice]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[InvoiceItem] ADD CONSTRAINT [InvoiceItem_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customer]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_methodId_fkey] FOREIGN KEY ([methodId]) REFERENCES [dbo].[PaymentMethod]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Payment] ADD CONSTRAINT [Payment_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CreditNote] ADD CONSTRAINT [CreditNote_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customer]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CreditNote] ADD CONSTRAINT [CreditNote_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[Invoice]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CreditNote] ADD CONSTRAINT [CreditNote_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CreditNoteItem] ADD CONSTRAINT [CreditNoteItem_creditNoteId_fkey] FOREIGN KEY ([creditNoteId]) REFERENCES [dbo].[CreditNote]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[CreditNoteItem] ADD CONSTRAINT [CreditNoteItem_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Allocation] ADD CONSTRAINT [Allocation_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[Invoice]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Allocation] ADD CONSTRAINT [Allocation_paymentId_fkey] FOREIGN KEY ([paymentId]) REFERENCES [dbo].[Payment]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Allocation] ADD CONSTRAINT [Allocation_creditNoteId_fkey] FOREIGN KEY ([creditNoteId]) REFERENCES [dbo].[CreditNote]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Refund] ADD CONSTRAINT [Refund_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customer]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Refund] ADD CONSTRAINT [Refund_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[Invoice]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Refund] ADD CONSTRAINT [Refund_methodId_fkey] FOREIGN KEY ([methodId]) REFERENCES [dbo].[PaymentMethod]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LedgerEntry] ADD CONSTRAINT [LedgerEntry_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customer]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[LedgerEntry] ADD CONSTRAINT [LedgerEntry_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Expense] ADD CONSTRAINT [Expense_categoryId_fkey] FOREIGN KEY ([categoryId]) REFERENCES [dbo].[ExpenseCategory]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Expense] ADD CONSTRAINT [Expense_methodId_fkey] FOREIGN KEY ([methodId]) REFERENCES [dbo].[PaymentMethod]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Expense] ADD CONSTRAINT [Expense_createdById_fkey] FOREIGN KEY ([createdById]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Inventory] ADD CONSTRAINT [Inventory_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[StockMovement] ADD CONSTRAINT [StockMovement_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Delivery] ADD CONSTRAINT [Delivery_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customer]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Delivery] ADD CONSTRAINT [Delivery_addressId_fkey] FOREIGN KEY ([addressId]) REFERENCES [dbo].[CustomerAddress]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Delivery] ADD CONSTRAINT [Delivery_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[Invoice]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[Delivery] ADD CONSTRAINT [Delivery_assignedToId_fkey] FOREIGN KEY ([assignedToId]) REFERENCES [dbo].[User]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DeliveryItem] ADD CONSTRAINT [DeliveryItem_deliveryId_fkey] FOREIGN KEY ([deliveryId]) REFERENCES [dbo].[Delivery]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DeliveryItem] ADD CONSTRAINT [DeliveryItem_productId_fkey] FOREIGN KEY ([productId]) REFERENCES [dbo].[Product]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[DeliveryEvent] ADD CONSTRAINT [DeliveryEvent_deliveryId_fkey] FOREIGN KEY ([deliveryId]) REFERENCES [dbo].[Delivery]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
