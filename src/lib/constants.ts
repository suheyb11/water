// Domain constants shared by server and client. Status/type columns are validated against these lists.

export const CUSTOMER_TYPES = ["RESIDENTIAL", "BUSINESS", "OFFICE", "INSTITUTION", "RESELLER"] as const;
export const CUSTOMER_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export const LOCATION_KINDS = ["DISTRICT", "NEIGHBORHOOD", "PLACE"] as const;
export const PRODUCT_STATUSES = ["ACTIVE", "INACTIVE"] as const;

export const INVOICE_KINDS = ["SALE", "DEBIT_NOTE", "OPENING_BALANCE", "REFUND"] as const;
export const INVOICE_STATUSES = ["DRAFT", "UNPAID", "PARTIALLY_PAID", "PAID", "OVERDUE", "CANCELLED"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const CREDIT_NOTE_KINDS = ["RETURN", "ADJUSTMENT", "OPENING_BALANCE"] as const;
export const PAYMENT_METHOD_KINDS = ["CASH", "MOBILE", "BANK", "OTHER"] as const;

export const LEDGER_TYPES = {
  OPENING_BALANCE: { label: "Opening balance", side: "debit" },
  OPENING_CREDIT: { label: "Opening credit", side: "credit" },
  SALE: { label: "Sale", side: "debit" },
  DEBIT_NOTE: { label: "Debit adjustment / charge", side: "debit" },
  PAYMENT: { label: "Payment", side: "credit" },
  CREDIT_NOTE: { label: "Credit adjustment", side: "credit" },
  RETURN: { label: "Product return", side: "credit" },
  REFUND: { label: "Refund paid", side: "debit" },
  INVOICE_CANCELLATION: { label: "Invoice cancelled", side: "credit" },
  PAYMENT_REVERSAL: { label: "Payment reversed", side: "debit" },
} as const;
export type LedgerType = keyof typeof LEDGER_TYPES;

export const STOCK_MOVE_TYPES = {
  OPENING: { label: "Opening stock", sign: 1 },
  PRODUCTION: { label: "Production", sign: 1 },
  PURCHASE: { label: "Purchase", sign: 1 },
  RETURN: { label: "Customer return", sign: 1 },
  ADJUSTMENT_IN: { label: "Adjustment (+)", sign: 1 },
  CANCEL_SALE: { label: "Cancelled sale", sign: 1 },
  SALE: { label: "Sale", sign: -1 },
  DAMAGE: { label: "Damaged", sign: -1 },
  ADJUSTMENT_OUT: { label: "Adjustment (−)", sign: -1 },
} as const;
export type StockMoveType = keyof typeof STOCK_MOVE_TYPES;
/** Movements a user may enter by hand (the rest come from sales/returns/cancellations). */
export const MANUAL_STOCK_TYPES: StockMoveType[] = ["OPENING", "PRODUCTION", "PURCHASE", "DAMAGE", "ADJUSTMENT_IN", "ADJUSTMENT_OUT"];

export const DELIVERY_STATUSES = ["PENDING", "ASSIGNED", "OUT_FOR_DELIVERY", "DELIVERED", "FAILED", "CANCELLED"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export const DELIVERY_TRANSITIONS: Record<DeliveryStatus, DeliveryStatus[]> = {
  PENDING: ["ASSIGNED", "OUT_FOR_DELIVERY", "CANCELLED"],
  ASSIGNED: ["OUT_FOR_DELIVERY", "PENDING", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "FAILED"],
  FAILED: ["ASSIGNED", "OUT_FOR_DELIVERY", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export const REMINDER_OUTCOMES = {
  NO_ANSWER: "No answer / phone off",
  PROMISED: "Promised to pay later",
  PAID: "Paid / will pay now",
  OTHER: "Other",
} as const;
export type ReminderOutcome = keyof typeof REMINDER_OUTCOMES;

export const PRICE_SOURCES = {
  CUSTOMER: "Customer price",
  CUSTOMER_TEMP: "Temporary customer price",
  GROUP: "Group price",
  DEFAULT: "Default price",
  OVERRIDE: "Manual override",
} as const;
export type PriceSource = keyof typeof PRICE_SOURCES;

// ───────── Permissions ─────────
export const PERMISSIONS = {
  "dashboard.view": ["dashboard", "View the dashboard"],
  "customers.view": ["customers", "View customers and their profiles"],
  "customers.manage": ["customers", "Register and edit customers and addresses"],
  "locations.manage": ["customers", "Manage districts, neighbourhoods and local places"],
  "products.view": ["products", "View products"],
  "products.manage": ["products", "Add/edit products and default prices"],
  "pricing.view": ["pricing", "View customer and group prices"],
  "pricing.manage": ["pricing", "Change customer and group prices"],
  "sales.create": ["sales", "Post sales"],
  "sales.discount": ["sales", "Give discounts and extra charges on a sale"],
  "sales.override_price": ["sales", "Override the unit price on a sale"],
  "sales.backdate": ["sales", "Post documents with a date in the past"],
  "invoices.view": ["invoices", "View invoices"],
  "invoices.cancel": ["invoices", "Cancel posted invoices (reversal)"],
  "payments.view": ["payments", "View payments and receipts"],
  "payments.create": ["payments", "Record payments"],
  "payments.reverse": ["payments", "Reverse payments"],
  "ledger.view": ["ledger", "View customer ledgers and statements"],
  "ledger.adjust": ["ledger", "Post debit/credit adjustments, returns and refunds"],
  "reports.view": ["reports", "View daily statements and financial reports"],
  "expenses.view": ["expenses", "View expenses"],
  "expenses.manage": ["expenses", "Record and void expenses, manage categories"],
  "inventory.view": ["inventory", "View stock"],
  "inventory.manage": ["inventory", "Record stock movements"],
  "inventory.negative": ["inventory", "Allow a sale or movement to take stock below zero"],
  "reminders.view": ["reminders", "See payment reminders and the call-back pop-up"],
  "reminders.manage": ["reminders", "Create, log calls on and close payment reminders"],
  "deliveries.view": ["deliveries", "View all deliveries"],
  "deliveries.manage": ["deliveries", "Create and assign deliveries"],
  "deliveries.update": ["deliveries", "Update the status of deliveries assigned to me"],
  "users.manage": ["users", "Manage users, roles and permissions"],
  "audit.view": ["audit", "View the audit log"],
  "settings.manage": ["settings", "Change business settings and payment methods"],
} as const;
export type PermissionCode = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

const ACCOUNTANT: PermissionCode[] = [
  "dashboard.view", "customers.view", "products.view", "pricing.view", "invoices.view", "invoices.cancel",
  "payments.view", "payments.create", "payments.reverse", "ledger.view", "ledger.adjust", "reports.view",
  "expenses.view", "expenses.manage", "inventory.view", "deliveries.view", "sales.backdate",
  "reminders.view", "reminders.manage",
];
const SALES: PermissionCode[] = [
  "dashboard.view", "customers.view", "customers.manage", "products.view", "pricing.view", "sales.create",
  "invoices.view", "payments.view", "payments.create", "ledger.view", "inventory.view", "deliveries.view", "deliveries.manage",
  "reminders.view", "reminders.manage",
];

export const DEFAULT_ROLES: { code: string; name: string; description: string; permissions: PermissionCode[] }[] = [
  { code: "SUPER_ADMIN", name: "Super Admin", description: "Full system access", permissions: ALL_PERMISSIONS },
  {
    code: "ADMIN", name: "Admin", description: "Business management and financial access",
    permissions: ALL_PERMISSIONS.filter(p => p !== "users.manage"),
  },
  { code: "ACCOUNTANT", name: "Accountant", description: "Invoices, payments, ledgers, statements and reports", permissions: ACCOUNTANT },
  { code: "SALES", name: "Sales Staff", description: "Customer registration and sales", permissions: SALES },
  { code: "DELIVERY", name: "Delivery Staff", description: "Assigned deliveries and delivery updates", permissions: ["deliveries.update", "customers.view"] },
];

export function label(s: string | null | undefined) {
  if (!s) return "—";
  return s.toLowerCase().split("_").map(w => w[0]?.toUpperCase() + w.slice(1)).join(" ");
}
