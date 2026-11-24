"use server";
// Server Actions: thin wrappers. Authorisation, validation and posting rules live in src/server/services.
import { runAction } from "@/server/action";
import * as customers from "@/server/services/customers";
import * as locations from "@/server/services/locations";
import * as pricing from "@/server/services/pricing";
import * as products from "@/server/services/products";
import * as sales from "@/server/services/sales";
import * as payments from "@/server/services/payments";
import * as adj from "@/server/services/adjustments";
import * as inventory from "@/server/services/inventory";
import * as deliveries from "@/server/services/deliveries";
import * as expenses from "@/server/services/expenses";
import * as users from "@/server/services/users";
import * as settings from "@/server/services/settings";
import * as reminders from "@/server/services/reminders";

type In<F> = F extends (actor: never, ...args: infer A) => unknown ? A : never;

// customers & locations
export async function createCustomerAction(input: In<typeof customers.createCustomer>[0], allowDuplicatePhone = false) {
  return runAction(a => customers.createCustomer(a, input, { allowDuplicatePhone }).then(c => ({ id: c.id, code: c.code, name: c.name, phone: c.phone })));
}
export async function updateCustomerAction(id: number, input: In<typeof customers.updateCustomer>[1], allowDuplicatePhone = false) {
  return runAction(a => customers.updateCustomer(a, id, input, { allowDuplicatePhone }).then(c => ({ id: c.id })));
}
export async function saveAddressAction(customerId: number, input: In<typeof customers.saveAddress>[1]) {
  return runAction(a => customers.saveAddress(a, customerId, input).then(r => ({ id: r.id })));
}
export async function removeAddressAction(customerId: number, addressId: number) {
  return runAction(a => customers.deactivateAddress(a, customerId, addressId).then(() => null));
}
export async function saveLocationAction(input: In<typeof locations.saveLocation>[0]) {
  return runAction(a => locations.saveLocation(a, input).then(r => ({ id: r.id })));
}

// pricing
export async function setCustomerPriceAction(input: In<typeof pricing.setCustomerPrice>[0]) {
  return runAction(a => pricing.setCustomerPrice(a, input).then(r => ({ id: r.id })));
}
export async function removeCustomerPriceAction(priceId: number, reason?: string) {
  return runAction(a => pricing.removeCustomerPrice(a, priceId, undefined, reason).then(() => null));
}
export async function bulkPriceAction(input: In<typeof pricing.bulkUpdateCustomerPrices>[0]) {
  return runAction(a => pricing.bulkUpdateCustomerPrices(a, input));
}
export async function setGroupPriceAction(input: In<typeof pricing.setGroupPrice>[0]) {
  return runAction(a => pricing.setGroupPrice(a, input).then(() => null));
}
export async function saveGroupAction(input: unknown) {
  return runAction(a => settings.saveCustomerGroup(a, input).then(r => ({ id: r.id })));
}

// products & stock
export async function createProductAction(input: products.ProductInput) {
  return runAction(a => products.createProduct(a, input).then(r => ({ id: r.id })));
}
export async function updateProductAction(id: number, input: products.ProductInput) {
  return runAction(a => products.updateProduct(a, id, input).then(r => ({ id: r.id })));
}
export async function stockMoveAction(input: In<typeof inventory.recordStockMovement>[0]) {
  return runAction(a => inventory.recordStockMovement(a, input).then(r => ({ id: r.id.toString() })));
}

// sales, invoices, payments
export async function postSaleAction(input: sales.SaleInput) {
  return runAction(a => sales.postSale(a, input).then(r => ({ id: r.id, number: r.number })));
}
export async function cancelInvoiceAction(input: In<typeof sales.cancelInvoice>[0]) {
  return runAction(a => sales.cancelInvoice(a, input).then(r => ({ id: r.id })));
}
export async function recordPaymentAction(input: payments.PaymentInput) {
  return runAction(a => payments.recordPayment(a, input).then(r => ({ id: r.id, number: r.number })));
}
export async function reversePaymentAction(input: In<typeof payments.reversePayment>[0]) {
  return runAction(a => payments.reversePayment(a, input).then(r => ({ id: r.id })));
}
export async function applyCreditAction(customerId: number, invoiceIds?: number[]) {
  return runAction(a => payments.applyAvailableCredit(a, customerId, invoiceIds));
}

// adjustments
export async function debitNoteAction(input: In<typeof adj.createDebitNote>[0]) {
  return runAction(a => adj.createDebitNote(a, input).then(r => ({ id: r.id, number: r.number })));
}
export async function creditAdjustmentAction(input: In<typeof adj.createCreditAdjustment>[0]) {
  return runAction(a => adj.createCreditAdjustment(a, input).then(r => ({ id: r.id, number: r.number })));
}
export async function returnAction(input: In<typeof adj.createReturn>[0]) {
  return runAction(a => adj.createReturn(a, input).then(r => ({ id: r.id, number: r.number })));
}
export async function refundAction(input: In<typeof adj.createRefund>[0]) {
  return runAction(a => adj.createRefund(a, input).then(r => ({ id: r.id })));
}

// deliveries
export async function createDeliveryAction(input: In<typeof deliveries.createDelivery>[0]) {
  return runAction(a => deliveries.createDelivery(a, input).then(r => ({ id: r.id, number: r.number })));
}
export async function deliveryStatusAction(input: In<typeof deliveries.updateDeliveryStatus>[0]) {
  return runAction(a => deliveries.updateDeliveryStatus(a, input).then(r => ({ id: r.id, status: r.status })));
}

// expenses
export async function recordExpenseAction(input: In<typeof expenses.recordExpense>[0]) {
  return runAction(a => expenses.recordExpense(a, input).then(r => ({ id: r.id, number: r.number })));
}
export async function voidExpenseAction(id: number, reason: string) {
  return runAction(a => expenses.voidExpense(a, id, reason).then(() => null));
}
export async function saveExpenseCategoryAction(input: In<typeof expenses.saveExpenseCategory>[0]) {
  return runAction(a => expenses.saveExpenseCategory(a, input).then(r => ({ id: r.id })));
}

// users & settings
export async function createUserAction(input: In<typeof users.createUser>[0]) {
  return runAction(a => users.createUser(a, input).then(r => ({ id: r.id })));
}
export async function updateUserAction(id: number, input: In<typeof users.updateUser>[1]) {
  return runAction(a => users.updateUser(a, id, input).then(r => ({ id: r.id })));
}
export async function saveRoleAction(input: In<typeof users.saveRole>[0]) {
  return runAction(a => users.saveRole(a, input).then(r => ({ id: r.id })));
}
export async function updateSettingsAction(input: unknown) {
  return runAction(a => settings.updateSettings(a, input).then(() => null));
}
export async function savePaymentMethodAction(input: unknown) {
  return runAction(a => settings.savePaymentMethod(a, input).then(r => ({ id: r.id })));
}

// payment reminders
export async function createReminderAction(input: reminders.ReminderInput) {
  return runAction(a => reminders.createReminder(a, input).then(r => ({ id: r.id })));
}
export async function logCallAction(input: In<typeof reminders.logCall>[0]) {
  return runAction(a => reminders.logCall(a, input).then(r => ({ id: r.id, status: r.status })));
}
export async function cancelReminderAction(id: number, note?: string | null) {
  return runAction(a => reminders.cancelReminder(a, id, note).then(() => null));
}
