import { z } from "zod";

// Writable fields from the Elorus v1.2 international OpenAPI reference (2026-09-20).
// IDs stay strings to preserve precision, following the existing MCP tools.

const billingAddressSchema = z.object({
  address_line: z.string().max(200).describe("Address line"),
  city: z.string().max(100).describe("City"),
  state: z.string().max(100).optional().describe("State"),
  zip: z.string().max(20).describe("Zip"),
  country: z.string().describe("Country"),
});

const shippingAddressSchema = z.object({
  address_line: z.string().max(200).describe("Address line"),
  city: z.string().max(100).describe("City"),
  state: z.string().max(100).optional().describe("State"),
  zip: z.string().max(20).describe("Zip"),
  country: z.string().describe("Country"),
  branch_code: z.number().int().nullable().optional().describe("Branch code"),
});

const estimateItemTaxNestedSchema = z.object({
  tax: z.string().regex(/^\d+$/).describe("Tax ID from list_taxes."),
  auto_calculate: z.boolean().optional().describe("Calculate automatically"),
  amount: z.string().optional().describe("Tax amount"),
  vat_amount: z.string().optional().describe("VAT amount"),
  auto_calculate_vat: z.boolean().optional().describe("Calculate VAT amount automatically"),
});

const estimateItemCreateSchema = z.object({
  product: z.string().regex(/^\d+$/).nullable().optional().describe("Product / Service"),
  title: z.string().min(1).max(200).optional().describe("Title"),
  description: z.string().optional().describe("Description"),
  quantity: z.string().optional().describe("Quantity"),
  unit_measure: z.string().nullable().optional().describe("Unit of measurement symbol, e.g. item or kg."),
  unit_value: z.string().optional().describe("Unit price (net)"),
  unit_value_gross: z.string().optional().describe("Unit price (gross)"),
  unit_discount: z.string().optional().describe("Unit discount"),
  unit_discount_gross: z.string().optional().describe("Unit discount gross"),
  unit_discount_percentage: z.string().optional().describe("Discount percentage"),
  unit_discount_mode: z.enum(["percentage", "amount", "amount_gross"]).optional().describe("Discount value mode"),
  taxes: z.array(estimateItemTaxNestedSchema).optional().describe("taxes"),
  unit_total: z.string().optional().describe("Final unit price"),
});

const estimateStandardTaxNestedSchema = z.object({
  tax: z.string().regex(/^\d+$/).describe("Tax ID from list_taxes."),
  auto_calculate: z.boolean().optional().describe("Calculate automatically"),
  amount: z.string().optional().describe("Tax amount"),
});

const estimateCreateSchema = z.object({
  custom_id: z.string().max(256).optional().describe("Custom ID"),
  draft: z.boolean().optional().describe("Draft"),
  accept_status: z.enum(["", "accepted", "rejected"]).optional().describe("Accept status"),
  documenttype: z.string().regex(/^\d+$/).optional().describe("Document type"),
  sequence_flat: z.string().max(10).optional().describe("Numbering sequence name (not an ID)."),
  number: z.string().max(100).optional().describe("Number"),
  date: z.string().date().optional().describe("Date"),
  branch: z.string().regex(/^\d+$/).nullable().optional().describe("Branch"),
  client: z.string().regex(/^\d+$/).describe("Client"),
  client_display_name: z.string().min(1).max(203).optional().describe("Client name"),
  client_profession: z.string().max(100).optional().describe("Client profession"),
  client_vat_number: z.string().max(20).optional().describe("Client tax ID"),
  billing_address: billingAddressSchema.optional().describe("billing address"),
  shipping_address: shippingAddressSchema.optional().describe("shipping address"),
  client_contact_person: z.string().max(101).optional().describe("Contact person"),
  client_phone_number: z.string().max(30).optional().describe("Phone number"),
  client_email: z.string().max(100).optional().describe("Email"),
  currency_code: z.string().optional().describe("Currency"),
  exchange_rate: z.string().optional().describe("Exchange rate"),
  calculator_mode: z.enum(["initial", "total", "total_pre_discount"]).optional().describe("Value calculator mode"),
  items: z.array(estimateItemCreateSchema).describe("Full line list. On update include every existing line id to retain it; omitted lines are deleted."),
  taxes: z.array(estimateStandardTaxNestedSchema).optional().describe("taxes"),
  template: z.string().regex(/^\d+$/).optional().describe("Template"),
  terms: z.string().optional().describe("Terms & conditions"),
  public_notes: z.string().optional().describe("Public notes"),
});

export const createFields = estimateCreateSchema.shape;

const estimateItemUpdateSchema = z.object({
  id: z.string().min(1).optional().describe("Id"),
  product: z.string().regex(/^\d+$/).nullable().optional().describe("Product / Service"),
  title: z.string().min(1).max(200).optional().describe("Title"),
  description: z.string().optional().describe("Description"),
  quantity: z.string().optional().describe("Quantity"),
  unit_measure: z.string().nullable().optional().describe("Unit of measurement symbol, e.g. item or kg."),
  unit_value: z.string().optional().describe("Unit price (net)"),
  unit_value_gross: z.string().optional().describe("Unit price (gross)"),
  unit_discount: z.string().optional().describe("Unit discount"),
  unit_discount_gross: z.string().optional().describe("Unit discount gross"),
  unit_discount_percentage: z.string().optional().describe("Discount percentage"),
  unit_discount_mode: z.enum(["percentage", "amount", "amount_gross"]).optional().describe("Discount value mode"),
  taxes: z.array(estimateItemTaxNestedSchema).optional().describe("taxes"),
  unit_total: z.string().optional().describe("Final unit price"),
});

const estimateUpdateSchema = z.object({
  custom_id: z.string().max(256).optional().describe("Custom ID"),
  draft: z.boolean().optional().describe("Draft"),
  accept_status: z.enum(["", "accepted", "rejected"]).optional().describe("Accept status"),
  documenttype: z.string().regex(/^\d+$/).optional().describe("Document type"),
  sequence_flat: z.string().max(10).optional().describe("Numbering sequence name (not an ID)."),
  number: z.string().max(100).optional().describe("Number"),
  date: z.string().date().optional().describe("Date"),
  branch: z.string().regex(/^\d+$/).nullable().optional().describe("Branch"),
  client: z.string().regex(/^\d+$/).describe("Client"),
  client_display_name: z.string().min(1).max(203).optional().describe("Client name"),
  client_profession: z.string().max(100).optional().describe("Client profession"),
  client_vat_number: z.string().max(20).optional().describe("Client tax ID"),
  billing_address: billingAddressSchema.optional().describe("billing address"),
  shipping_address: shippingAddressSchema.optional().describe("shipping address"),
  currency_code: z.string().optional().describe("Currency"),
  exchange_rate: z.string().optional().describe("Exchange rate"),
  client_contact_person: z.string().max(101).optional().describe("Contact person"),
  client_phone_number: z.string().max(30).optional().describe("Phone number"),
  client_email: z.string().max(100).optional().describe("Email"),
  calculator_mode: z.enum(["initial", "total", "total_pre_discount"]).optional().describe("Value calculator mode"),
  items: z.array(estimateItemUpdateSchema).describe("Full line list. On update include every existing line id to retain it; omitted lines are deleted."),
  taxes: z.array(estimateStandardTaxNestedSchema).optional().describe("taxes"),
  template: z.string().regex(/^\d+$/).optional().describe("Template"),
  public_notes: z.string().optional().describe("Public notes"),
  active: z.boolean().optional().describe("Active"),
});

export const updateFields = estimateUpdateSchema.shape;

const estimatePatchSchema = z.object({
  custom_id: z.string().max(256).optional().describe("Custom ID"),
  draft: z.boolean().optional().describe("Draft"),
  template: z.string().regex(/^\d+$/).optional().describe("Template"),
  accept_status: z.enum(["", "accepted", "rejected"]).optional().describe("Accept status"),
});

export const patchFields = estimatePatchSchema.shape;

export const listFields = {
  ordering: z.string().optional().describe("Which field to use when ordering the results."),
  search: z.string().optional().describe("A search term."),
  search_fields: z.string().optional().describe("The fields on which search will be performed once a search term is provided."),
  period_from: z.string().optional().describe("Optionally filter results from a date onwards. Must be used with the `period_to` parameter, otherwise it won't have any effect. Date must be in the form of `YYYY-mm-dd`."),
  period_to: z.string().optional().describe("Optionally filter results from a date backwards. Must be used with the `period_from` parameter, otherwise it won't have any effect. Date must be in the form of `YYYY-mm-dd`."),
  period: z.string().optional().describe("Optionally filter results from a date period."),
  active: z.enum(["0", "1"]).optional().describe("Whether to show only active or inactive (archived) records. The available choices are: `1`, `0`."),
  status: z.string().optional().describe("Optionally filter by the document's status.  The available choices are: `draft`, `issued`, `accepted`, `rejected`, `invoiced`."),
  draft: z.enum(["0", "1"]).optional().describe("Optionally filter by draft status. The available choices are: `1`, `0`."),
  accept_status: z.string().optional().describe("Optionally filter by accept status. The available choices are: `accepted`, `rejected`, `empty`."),
  client: z.string().optional().describe("Optionally filter by client ID."),
  currency_code: z.string().optional().describe("Optionally filter by currency code."),
  documenttype: z.string().optional().describe("Optionally filter by document type ID."),
  sequence: z.string().optional().describe("Optionally filter by the numbering sequence."),
  custom_id: z.string().optional().describe("Optionally filter by custom ID."),
  created_after: z.string().optional().describe("Optionally filter results from a date onwards. Date must be in the form of `YYYY-mm-dd` or ISO-formatted."),
  created_before: z.string().optional().describe("Optionally filter results from a date backwards. Date must be in the form of `YYYY-mm-dd` or ISO-formatted."),
  modified_after: z.string().optional().describe("Optionally filter results from a date onwards. Date must be in the form of `YYYY-mm-dd` or ISO-formatted."),
  modified_before: z.string().optional().describe("Optionally filter results from a date backwards. Date must be in the form of `YYYY-mm-dd` or ISO-formatted."),
  modified_period: z.string().optional().describe("Optionally filter results from a date period."),
  created_period: z.string().optional().describe("Optionally filter results from a date period."),
  page: z.number().int().min(1).optional().describe("A page number within the paginated result set."),
  page_size: z.number().int().min(1).max(250).optional().describe("Number of results to return per page. Default is 100. The maximum allowed value is 250."),
};
