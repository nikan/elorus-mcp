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

const loadingAddressSchema = z.object({
  address_line: z.string().max(200).describe("Address line"),
  city: z.string().max(100).describe("City"),
  state: z.string().max(100).optional().describe("State"),
  zip: z.string().max(20).describe("Zip"),
  country: z.string().describe("Country"),
  branch_code: z.number().int().nullable().optional().describe("Branch code"),
});

const deliveryNoteItemTaxNestedSchema = z.object({
  tax: z.string().regex(/^\d+$/).describe("Tax ID from list_taxes."),
  auto_calculate: z.boolean().optional().describe("Calculate automatically"),
  amount: z.string().optional().describe("Tax amount"),
  vat_amount: z.string().optional().describe("VAT amount"),
  auto_calculate_vat: z.boolean().optional().describe("Calculate VAT amount automatically"),
});

const deliveryNoteItemCreateSchema = z.object({
  product: z.string().regex(/^\d+$/).nullable().optional().describe("Product / Service"),
  title: z.string().min(1).max(200).optional().describe("Title"),
  description: z.string().optional().describe("Description"),
  quantity: z.string().optional().describe("Quantity"),
  unit_measure: z.string().describe("Unit of measurement symbol, e.g. item or kg."),
  unit_value: z.string().optional().describe("Unit price (net)"),
  unit_value_gross: z.string().optional().describe("Unit price (gross)"),
  unit_discount: z.string().optional().describe("Unit discount"),
  unit_discount_gross: z.string().optional().describe("Unit discount gross"),
  unit_discount_mode: z.enum(["percentage", "amount", "amount_gross"]).optional().describe("Discount value mode"),
  unit_discount_percentage: z.string().optional().describe("Discount percentage"),
  taxes: z.array(deliveryNoteItemTaxNestedSchema).optional().describe("taxes"),
  taric_code: z.union([z.literal(""), z.string().length(10)]).optional().describe("Taric Code"),
  unit_total: z.string().optional().describe("Final unit price"),
  warehouse: z.string().regex(/^\d+$/).nullable().optional().describe("Warehouse"),
  skip_stock_update: z.boolean().optional().describe("Skip stock update"),
  target_warehouse: z.string().regex(/^\d+$/).nullable().optional().describe("Target warehouse"),
  move_purpose: z.number().int().nullable().optional().describe("Move purpose"),
  other_move_purpose_title: z.string().max(150).optional().describe("Move purpose description"),
});

const deliveryNoteStandardTaxNestedSchema = z.object({
  tax: z.string().regex(/^\d+$/).describe("Tax ID from list_taxes."),
  auto_calculate: z.boolean().optional().describe("Calculate automatically"),
  amount: z.string().optional().describe("Tax amount"),
});

const deliveryNoteRelatedEntitiesSchema = z.object({
  contact: z.string().regex(/^\d+$/).describe("Contact"),
  contact_display_name: z.string().min(1).max(203).describe("Contact name"),
  contact_vat_number: z.string().max(20).optional().describe("Contact tax ID"),
  type: z.number().int().describe("Entity role"),
  billing_address: billingAddressSchema.optional().describe("billing address"),
});

const deliveryNotePackageNestedSchema = z.object({
  packaging_type: z.number().int().describe("Packaging type"),
  quantity: z.number().int().min(1).max(32767).describe("Quantity"),
  other_packaging_type_title: z.string().max(150).optional().describe("Other packaging type title"),
});

const deliveryNoteCreateSchema = z.object({
  custom_id: z.string().max(256).optional().describe("Custom ID"),
  draft: z.boolean().optional().describe("Draft"),
  documenttype: z.string().regex(/^\d+$/).optional().describe("Document type"),
  sequence_flat: z.string().max(10).optional().describe("Numbering sequence name (not an ID)."),
  number: z.string().max(100).optional().describe("Number"),
  date: z.string().date().optional().describe("Date"),
  intra_transfer: z.boolean().optional().describe("Intra-Transfer"),
  reverse_delivery_note_purpose: z.number().int().nullable().optional().describe("Reverse movement reason"),
  branch: z.string().regex(/^\d+$/).nullable().optional().describe("Branch"),
  contact: z.string().regex(/^\d+$/).nullable().optional().describe("Contact"),
  contact_display_name: z.string().max(203).optional().describe("Contact name"),
  contact_profession: z.string().max(100).optional().describe("Contact profession"),
  contact_vat_number: z.string().max(20).optional().describe("Contact tax ID"),
  billing_address: billingAddressSchema.optional().describe("billing address"),
  shipping_address: shippingAddressSchema.optional().describe("shipping address"),
  loading_address: loadingAddressSchema.optional().describe("loading address"),
  contact_person: z.string().max(101).optional().describe("Contact person"),
  contact_phone_number: z.string().max(30).optional().describe("Phone number"),
  contact_email: z.string().max(100).optional().describe("Email"),
  dispatch_date: z.string().date().nullable().optional().describe("Dispatch date"),
  dispatch_time: z.string().nullable().optional().describe("Dispatch time"),
  vehicle_number: z.string().max(150).optional().describe("Vehicle number"),
  move_purpose: z.number().int().describe("Move purpose"),
  other_move_purpose_title: z.string().max(150).optional().describe("Move purpose description"),
  to_weigh: z.boolean().optional().describe("To weigh"),
  currency_code: z.string().optional().describe("Currency"),
  exchange_rate: z.string().optional().describe("Exchange rate"),
  calculator_mode: z.enum(["initial", "total"]).optional().describe("Value calculator mode"),
  items: z.array(deliveryNoteItemCreateSchema).describe("Full line list. On update include every existing line id to retain it; omitted lines are deleted."),
  taxes: z.array(deliveryNoteStandardTaxNestedSchema).optional().describe("taxes"),
  template: z.string().regex(/^\d+$/).nullable().optional().describe("Template"),
  public_notes: z.string().optional().describe("Public notes"),
  related_entities: z.array(deliveryNoteRelatedEntitiesSchema).nullable().optional().describe("related entities"),
  packages: z.array(deliveryNotePackageNestedSchema).nullable().optional().describe("packages"),
});

export const createFields = deliveryNoteCreateSchema.shape;

const deliveryNoteItemUpdateSchema = z.object({
  id: z.string().min(1).optional().describe("Id"),
  product: z.string().regex(/^\d+$/).nullable().optional().describe("Product / Service"),
  title: z.string().min(1).max(200).optional().describe("Title"),
  description: z.string().optional().describe("Description"),
  quantity: z.string().optional().describe("Quantity"),
  unit_measure: z.string().describe("Unit of measurement symbol, e.g. item or kg."),
  unit_value: z.string().optional().describe("Unit price (net)"),
  unit_value_gross: z.string().optional().describe("Unit price (gross)"),
  unit_discount: z.string().optional().describe("Unit discount"),
  unit_discount_gross: z.string().optional().describe("Unit discount gross"),
  unit_discount_mode: z.enum(["percentage", "amount", "amount_gross"]).optional().describe("Discount value mode"),
  unit_discount_percentage: z.string().optional().describe("Discount percentage"),
  taxes: z.array(deliveryNoteItemTaxNestedSchema).optional().describe("taxes"),
  taric_code: z.union([z.literal(""), z.string().length(10)]).optional().describe("Taric Code"),
  unit_total: z.string().optional().describe("Final unit price"),
  warehouse: z.string().regex(/^\d+$/).nullable().optional().describe("Warehouse"),
  skip_stock_update: z.boolean().optional().describe("Skip stock update"),
  target_warehouse: z.string().regex(/^\d+$/).nullable().optional().describe("Target warehouse"),
  move_purpose: z.number().int().nullable().optional().describe("Move purpose"),
  other_move_purpose_title: z.string().max(150).optional().describe("Move purpose description"),
});

const deliveryNoteUpdateSchema = z.object({
  custom_id: z.string().max(256).optional().describe("Custom ID"),
  draft: z.boolean().optional().describe("Draft"),
  documenttype: z.string().regex(/^\d+$/).optional().describe("Document type"),
  sequence_flat: z.string().max(10).optional().describe("Numbering sequence name (not an ID)."),
  number: z.string().max(100).optional().describe("Number"),
  date: z.string().date().optional().describe("Date"),
  intra_transfer: z.boolean().optional().describe("Intra-Transfer"),
  reverse_delivery_note_purpose: z.number().int().nullable().optional().describe("Reverse movement reason"),
  branch: z.string().regex(/^\d+$/).nullable().optional().describe("Branch"),
  contact: z.string().regex(/^\d+$/).nullable().optional().describe("Contact"),
  contact_display_name: z.string().max(203).optional().describe("Contact name"),
  contact_profession: z.string().max(100).optional().describe("Contact profession"),
  contact_vat_number: z.string().max(20).optional().describe("Contact tax ID"),
  billing_address: billingAddressSchema.optional().describe("billing address"),
  shipping_address: shippingAddressSchema.optional().describe("shipping address"),
  loading_address: loadingAddressSchema.optional().describe("loading address"),
  contact_person: z.string().max(101).optional().describe("Contact person"),
  contact_phone_number: z.string().max(30).optional().describe("Phone number"),
  contact_email: z.string().max(100).optional().describe("Email"),
  dispatch_date: z.string().date().nullable().optional().describe("Dispatch date"),
  dispatch_time: z.string().nullable().optional().describe("Dispatch time"),
  vehicle_number: z.string().max(150).optional().describe("Vehicle number"),
  move_purpose: z.number().int().describe("Move purpose"),
  other_move_purpose_title: z.string().max(150).optional().describe("Move purpose description"),
  to_weigh: z.boolean().optional().describe("To weigh"),
  currency_code: z.string().optional().describe("Currency"),
  exchange_rate: z.string().optional().describe("Exchange rate"),
  calculator_mode: z.enum(["initial", "total"]).optional().describe("Value calculator mode"),
  items: z.array(deliveryNoteItemUpdateSchema).describe("Full line list. On update include every existing line id to retain it; omitted lines are deleted."),
  taxes: z.array(deliveryNoteStandardTaxNestedSchema).optional().describe("taxes"),
  template: z.string().regex(/^\d+$/).nullable().optional().describe("Template"),
  public_notes: z.string().optional().describe("Public notes"),
  related_entities: z.array(deliveryNoteRelatedEntitiesSchema).nullable().optional().describe("related entities"),
  packages: z.array(deliveryNotePackageNestedSchema).nullable().optional().describe("packages"),
});

export const updateFields = deliveryNoteUpdateSchema.shape;

const deliveryNotePatchSchema = z.object({
  custom_id: z.string().max(256).optional().describe("Custom ID"),
  draft: z.boolean().optional().describe("Draft"),
  template: z.string().regex(/^\d+$/).nullable().optional().describe("Template"),
});

export const patchFields = deliveryNotePatchSchema.shape;

export const listFields = {
  ordering: z.string().optional().describe("Which field to use when ordering the results."),
  search: z.string().optional().describe("A search term."),
  search_fields: z.string().optional().describe("The fields on which search will be performed once a search term is provided."),
  period_from: z.string().optional().describe("Optionally filter results from a date onwards. Must be used with the `period_to` parameter, otherwise it won't have any effect. Date must be in the form of `YYYY-mm-dd`."),
  period_to: z.string().optional().describe("Optionally filter results from a date backwards. Must be used with the `period_from` parameter, otherwise it won't have any effect. Date must be in the form of `YYYY-mm-dd`."),
  period: z.string().optional().describe("Optionally filter results from a date period."),
  status: z.string().optional().describe("Optionally filter by the document's status. Available choices are `draft` and `issued` The available choices are: `draft`, `issued`."),
  draft: z.enum(["0", "1"]).optional().describe("Optionally filter by draft status. The available choices are: `1`, `0`."),
  contact: z.string().optional().describe("Optionally filter by contact ID."),
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
