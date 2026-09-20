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

const goodsReceiptItemCreateSchema = z.object({
  product: z.string().regex(/^\d+$/).nullable().optional().describe("Product / Service"),
  title: z.string().min(1).max(200).optional().describe("Title"),
  description: z.string().optional().describe("Description"),
  quantity: z.string().optional().describe("Quantity"),
  unit_measure: z.string().nullable().optional().describe("Unit of measurement symbol, e.g. item or kg."),
  warehouse: z.string().regex(/^\d+$/).nullable().optional().describe("Warehouse"),
  skip_stock_update: z.boolean().optional().describe("Skip stock update"),
});

const goodsReceiptCreateSchema = z.object({
  custom_id: z.string().max(256).optional().describe("Custom ID"),
  draft: z.boolean().optional().describe("Draft"),
  sequence_flat: z.string().max(10).optional().describe("Numbering sequence name (not an ID)."),
  number: z.string().max(100).optional().describe("Number"),
  date: z.string().date().optional().describe("Date"),
  branch: z.string().regex(/^\d+$/).nullable().optional().describe("Branch"),
  supplier: z.string().regex(/^\d+$/).describe("Supplier"),
  supplier_display_name: z.string().max(203).optional().describe("Supplier name"),
  supplier_profession: z.string().max(100).optional().describe("Supplier profession"),
  supplier_vat_number: z.string().max(20).optional().describe("Supplier tax ID"),
  supplier_contact_person: z.string().max(101).optional().describe("Contact person"),
  supplier_phone_number: z.string().max(30).optional().describe("Phone number"),
  supplier_email: z.string().max(100).optional().describe("Email"),
  billing_address: billingAddressSchema.optional().describe("billing address"),
  items: z.array(goodsReceiptItemCreateSchema).describe("Full line list. On update include every existing line id to retain it; omitted lines are deleted."),
  template: z.string().regex(/^\d+$/).nullable().optional().describe("Template"),
  public_notes: z.string().optional().describe("Public notes"),
});

export const createFields = goodsReceiptCreateSchema.shape;

const goodsReceiptItemUpdateSchema = z.object({
  id: z.string().min(1).optional().describe("Id"),
  product: z.string().regex(/^\d+$/).nullable().optional().describe("Product / Service"),
  title: z.string().min(1).max(200).optional().describe("Title"),
  description: z.string().optional().describe("Description"),
  quantity: z.string().optional().describe("Quantity"),
  unit_measure: z.string().nullable().optional().describe("Unit of measurement symbol, e.g. item or kg."),
  warehouse: z.string().regex(/^\d+$/).nullable().optional().describe("Warehouse"),
  skip_stock_update: z.boolean().optional().describe("Skip stock update"),
});

const goodsReceiptUpdateSchema = z.object({
  custom_id: z.string().max(256).optional().describe("Custom ID"),
  draft: z.boolean().optional().describe("Draft"),
  sequence_flat: z.string().max(10).optional().describe("Numbering sequence name (not an ID)."),
  number: z.string().max(100).optional().describe("Number"),
  date: z.string().date().optional().describe("Date"),
  branch: z.string().regex(/^\d+$/).nullable().optional().describe("Branch"),
  supplier: z.string().regex(/^\d+$/).describe("Supplier"),
  supplier_display_name: z.string().max(203).optional().describe("Supplier name"),
  supplier_profession: z.string().max(100).optional().describe("Supplier profession"),
  supplier_vat_number: z.string().max(20).optional().describe("Supplier tax ID"),
  supplier_contact_person: z.string().max(101).optional().describe("Contact person"),
  supplier_phone_number: z.string().max(30).optional().describe("Phone number"),
  supplier_email: z.string().max(100).optional().describe("Email"),
  billing_address: billingAddressSchema.optional().describe("billing address"),
  items: z.array(goodsReceiptItemUpdateSchema).describe("Full line list. On update include every existing line id to retain it; omitted lines are deleted."),
  template: z.string().regex(/^\d+$/).nullable().optional().describe("Template"),
  public_notes: z.string().optional().describe("Public notes"),
});

export const updateFields = goodsReceiptUpdateSchema.shape;

const goodsReceiptPatchSchema = z.object({
  custom_id: z.string().max(256).optional().describe("Custom ID"),
  draft: z.boolean().optional().describe("Draft"),
  template: z.string().regex(/^\d+$/).nullable().optional().describe("Template"),
});

export const patchFields = goodsReceiptPatchSchema.shape;

export const listFields = {
  ordering: z.string().optional().describe("Which field to use when ordering the results."),
  search: z.string().optional().describe("A search term."),
  search_fields: z.string().optional().describe("The fields on which search will be performed once a search term is provided."),
  period_from: z.string().optional().describe("Optionally filter results from a date onwards. Must be used with the `period_to` parameter, otherwise it won't have any effect. Date must be in the form of `YYYY-mm-dd`."),
  period_to: z.string().optional().describe("Optionally filter results from a date backwards. Must be used with the `period_from` parameter, otherwise it won't have any effect. Date must be in the form of `YYYY-mm-dd`."),
  period: z.string().optional().describe("Optionally filter results from a date period."),
  status: z.string().optional().describe("Optionally filter by the document's status.  The available choices are: `draft`, `issued`, `void`, `pending`."),
  draft: z.enum(["0", "1"]).optional().describe("Optionally filter by draft status. The available choices are: `1`, `0`."),
  supplier: z.string().optional().describe("Optionally filter by supplier ID."),
  sequence: z.string().optional().describe("Optionally filter by the numbering sequence."),
  branch_id: z.string().optional().describe("Optionally filter by branch ID."),
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
