import { z } from "zod";

const pricingFields = {
  unit_value: z
    .string()
    .optional()
    .describe(
      "Unit price before tax — required when calculator_mode is 'initial', e.g. '100.00'"
    ),
  unit_total: z
    .string()
    .optional()
    .describe(
      "Unit price after tax — required when calculator_mode is 'total', e.g. '124.00'"
    ),
};

function checkPricing(item: { unit_value?: string; unit_total?: string }, ctx: z.RefinementCtx) {
  if (!item.unit_value && !item.unit_total) {
    ctx.addIssue({
      code: "custom",
      path: ["unit_value"],
      message:
        "Each line item requires either unit_value (price before tax) or unit_total (price after tax)",
    });
  }
  if (item.unit_value && item.unit_total) {
    ctx.addIssue({
      code: "custom",
      path: ["unit_value"],
      message:
        "Provide unit_value or unit_total, not both — choose the one that matches calculator_mode",
    });
  }
}

const billLineItemFields = {
  title: z.string().describe("Line item description"),
  quantity: z
    .string()
    .describe("Quantity as a string to preserve precision, e.g. '2.5'"),
  ...pricingFields,
  expense_category: z
    .string()
    .describe("Expense category ID for this line item (obtain from list_expense_categories)"),
  taxes: z
    .array(z.string())
    .optional()
    .describe("Array of tax IDs to apply (obtain IDs via list_taxes)"),
  discount: z
    .string()
    .optional()
    .describe("Discount percentage as a string, e.g. '10.00' for 10%"),
  product: z
    .string()
    .optional()
    .describe("Product ID to link this line item to a catalog product"),
};

export const billLineItemSchema = z.object(billLineItemFields).superRefine(checkPricing);

/**
 * For update tools only: adds the optional `id` the base schema omits. Updating items goes
 * through a full PUT that replaces the entire line list, so an existing line's id must survive
 * validation — round-tripping it here is what lets the update tool keep rather than delete it.
 */
export const billLineItemUpdateSchema = z
  .object({
    ...billLineItemFields,
    id: z
      .string()
      .optional()
      .describe("Existing line item ID to update that line in place; omit to add a new line"),
  })
  .superRefine(checkPricing);

export type BillLineItem = z.infer<typeof billLineItemSchema>;
export type BillLineItemUpdate = z.infer<typeof billLineItemUpdateSchema>;
