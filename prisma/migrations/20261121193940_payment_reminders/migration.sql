BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[PaymentReminder] (
    [id] INT NOT NULL IDENTITY(1,1),
    [customerId] INT NOT NULL,
    [invoiceId] INT,
    [remindAt] DATETIME2 NOT NULL,
    [expectedAmount] DECIMAL(18,2),
    [note] NVARCHAR(600),
    [status] NVARCHAR(12) NOT NULL CONSTRAINT [PaymentReminder_status_df] DEFAULT 'OPEN',
    [assignedToId] INT,
    [callCount] INT NOT NULL CONSTRAINT [PaymentReminder_callCount_df] DEFAULT 0,
    [lastCallAt] DATETIME2,
    [outcome] NVARCHAR(400),
    [closedAt] DATETIME2,
    [closedById] INT,
    [createdById] INT NOT NULL,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [PaymentReminder_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [PaymentReminder_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[ReminderEvent] (
    [id] INT NOT NULL IDENTITY(1,1),
    [reminderId] INT NOT NULL,
    [action] NVARCHAR(20) NOT NULL,
    [outcome] NVARCHAR(20),
    [note] NVARCHAR(600),
    [nextAt] DATETIME2,
    [userId] INT,
    [at] DATETIME2 NOT NULL CONSTRAINT [ReminderEvent_at_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [ReminderEvent_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PaymentReminder_status_remindAt_idx] ON [dbo].[PaymentReminder]([status], [remindAt]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [PaymentReminder_customerId_idx] ON [dbo].[PaymentReminder]([customerId]);

-- CreateIndex
CREATE NONCLUSTERED INDEX [ReminderEvent_reminderId_idx] ON [dbo].[ReminderEvent]([reminderId]);

-- AddForeignKey
ALTER TABLE [dbo].[PaymentReminder] ADD CONSTRAINT [PaymentReminder_customerId_fkey] FOREIGN KEY ([customerId]) REFERENCES [dbo].[Customer]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[PaymentReminder] ADD CONSTRAINT [PaymentReminder_invoiceId_fkey] FOREIGN KEY ([invoiceId]) REFERENCES [dbo].[Invoice]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[ReminderEvent] ADD CONSTRAINT [ReminderEvent_reminderId_fkey] FOREIGN KEY ([reminderId]) REFERENCES [dbo].[PaymentReminder]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
