import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { expenseLineItemSchema } from "../schemas/expense-line-item.js";

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
      inputSchema: {
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
      },
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
      description:
        "Update fields on an existing expense. Only provided fields are changed (PATCH semantics); " +
        "the Elorus API only supports PUT on expenses, so this fetches the current record and merges your fields into it before saving.",
      inputSchema: {
        id: z.string().describe("The Elorus expense ID to update"),
        date: z.string().optional().describe("Expense date in YYYY-MM-DD format"),
        supplier: z.string().optional().describe("Supplier contact ID"),
        expense_category: z
          .string()
          .optional()
          .describe("Expense category ID (obtain from list_expense_categories)"),
        notes: z.string().optional().describe("Internal notes"),
        reference: z.string().optional().describe("Reference number or identifier for this expense"),
      },
    },
    async ({ id, ...fields }) => {
      const result = await client.mergePut(`/expenses/${id}/`, fields);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "add_expense_attachment",
    {
      description:
        "Attach a file (e.g. a scanned receipt or supplier invoice PDF) to an existing expense. " +
        "Provide the file content as base64. By default the attachment is set as the primary " +
        "receipt (the document shown in the expense's receipt panel).",
      inputSchema: {
        id: z.string().describe("The Elorus expense ID to attach the file to"),
        filename: z.string().describe("File name including extension, e.g. 'receipt.pdf'"),
        content_base64: z.string().describe("Base64-encoded file content"),
        title: z
          .string()
          .optional()
          .describe("Internal title to help identify the attachment (not the file name)"),
        primary: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Whether this attachment should be shown as the expense's primary receipt document. Default true."
          ),
      },
    },
    async ({ id, filename, content_base64, title, primary }) => {
      const form = new FormData();
      if (title) form.append("title", title);
      form.append("file", new Blob([Buffer.from(content_base64, "base64")]), filename);
      const result = await client.postMultipart<{ id: string }>(`/expenses/${id}/attachments/`, form);
      if (primary) {
        await client.patch(`/expenses/${id}/attachments/${result.id}/`, { primary: true });
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ...result, primary }, null, 2) }],
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
