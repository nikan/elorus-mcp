import { z } from "zod";

export const expenseLineItemSchema = z.object({
  expense_category: z
    .string()
    .describe("Expense category ID for this line item (obtain from list_expense_categories)"),
  amount: z
    .string()
    .describe(
      "Line amount as a string — pre-tax when calculator_mode is 'initial', post-tax when calculator_mode is 'total', e.g. '100.00'"
    ),
  description: z.string().optional().describe("Line item description"),
  taxes: z
    .array(z.string())
    .optional()
    .describe("Array of tax IDs to apply (obtain IDs via list_taxes)"),
  project: z.string().optional().describe("Project ID to bill this line item against"),
  billable: z.boolean().optional().describe("Whether this line item is billable to a client"),
});

export type ExpenseLineItem = z.infer<typeof expenseLineItemSchema>;
