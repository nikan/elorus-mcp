import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

const expenseLineItemSchema = z
  .object({
    title: z.string().describe("Line item description"),
    quantity: z.string().describe("Quantity as a string, e.g. '1'"),
    unit_value: z
      .string()
      .optional()
      .describe("Unit price before tax — required when calculator_mode is 'initial'"),
    unit_total: z
      .string()
      .optional()
      .describe("Unit price after tax — required when calculator_mode is 'total'"),
    taxes: z
      .array(z.string())
      .optional()
      .describe("Array of tax IDs to apply (obtain via list_taxes)"),
    discount: z
      .string()
      .optional()
      .describe("Discount percentage as a string, e.g. '10.00' for 10%"),
  })
  .superRefine((item, ctx) => {
    if (!item.unit_value && !item.unit_total) {
      ctx.addIssue({
        code: "custom",
        path: ["unit_value"],
        message: "Each line item requires either unit_value or unit_total",
      });
    }
  });

export function registerExpenseTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_expenses",
    {
      description:
        "List expense records. Returns paginated results. Filter by supplier, category, or date range.",
      inputSchema: {
        page: z.number().int().min(1).optional().describe("Page number (default: 1)"),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Results per page (default: 20, max: 100)"),
        supplier: z.string().optional().describe("Filter by supplier contact ID"),
        expense_category: z
          .string()
          .optional()
          .describe("Filter by expense category ID (obtain from list_expense_categories)"),
        date_after: z
          .string()
          .optional()
          .describe("Filter expenses on or after this date (YYYY-MM-DD)"),
        date_before: z
          .string()
          .optional()
          .describe("Filter expenses on or before this date (YYYY-MM-DD)"),
        ordering: z
          .string()
          .optional()
          .describe("Sort field, e.g. '-date' for newest first"),
        search: z
          .string()
          .optional()
          .describe("Search term for expense description or supplier name"),
      },
    },
    async ({ page, page_size, supplier, expense_category, date_after, date_before, ordering, search }) => {
      const result = await client.get("/expenses/", {
        page,
        page_size,
        supplier,
        expense_category,
        date_after,
        date_before,
        ordering,
        search,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_expense",
    {
      description: "Fetch a single expense record by its Elorus ID.",
      inputSchema: {
        id: z.string().describe("The Elorus expense ID"),
      },
    },
    async ({ id }) => {
      const result = await client.get(`/expenses/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "create_expense",
    {
      description:
        "Record a new business expense. Use list_taxes, list_document_types, and list_expense_categories to obtain valid IDs before calling this tool.",
      inputSchema: z
        .object({
          date: z.string().describe("Expense date in YYYY-MM-DD format"),
          documenttype: z
            .string()
            .describe("Document type ID (obtain from list_document_types)"),
          items: z
            .array(expenseLineItemSchema)
            .min(1)
            .describe("Line items on this expense (at least one required)"),
          calculator_mode: z
            .enum(["initial", "total"])
            .optional()
            .default("initial")
            .describe(
              "'initial': each item must have unit_value (pre-tax); 'total': each item must have unit_total (post-tax)"
            ),
          supplier: z
            .string()
            .optional()
            .describe("Contact ID of the supplier (for expenses tied to a specific supplier)"),
          expense_category: z
            .string()
            .optional()
            .describe("Expense category ID (obtain from list_expense_categories)"),
          currency_code: z
            .string()
            .length(3)
            .optional()
            .describe("ISO 4217 currency code, e.g. 'EUR'"),
          exchange_rate: z
            .string()
            .optional()
            .describe("Exchange rate to organization base currency, e.g. '1.000000'"),
          notes: z.string().optional().describe("Internal notes"),
        })
        .superRefine((data, ctx) => {
          const mode = data.calculator_mode;
          data.items.forEach((item, i) => {
            if (mode === "initial" && !item.unit_value) {
              ctx.addIssue({
                code: "custom",
                path: ["items", i, "unit_value"],
                message: "calculator_mode 'initial' requires unit_value on each line item",
              });
            }
            if (mode === "total" && !item.unit_total) {
              ctx.addIssue({
                code: "custom",
                path: ["items", i, "unit_total"],
                message: "calculator_mode 'total' requires unit_total on each line item",
              });
            }
          });
        }),
    },
    async (args) => {
      const result = await client.post("/expenses/", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_expense",
    {
      description: "Update fields on an existing expense. Only provided fields are changed (PATCH semantics).",
      inputSchema: {
        id: z.string().describe("The Elorus expense ID to update"),
        date: z.string().optional().describe("Expense date in YYYY-MM-DD format"),
        supplier: z.string().optional().describe("Supplier contact ID"),
        expense_category: z
          .string()
          .optional()
          .describe("Expense category ID (obtain from list_expense_categories)"),
        notes: z.string().optional().describe("Internal notes"),
      },
    },
    async ({ id, ...fields }) => {
      const result = await client.patch(`/expenses/${id}/`, fields);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "export_expense_pdf",
    {
      description: "Export an expense document as a PDF. Returns a download URL for the generated PDF file.",
      inputSchema: {
        id: z.string().describe("The Elorus expense ID to export"),
      },
    },
    async ({ id }) => {
      const result = await client.get(`/expenses/${id}/pdf/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
