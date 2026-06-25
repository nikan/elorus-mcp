import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

const lineItemSchema = z
  .object({
    title: z.string().describe("Line item description / product name"),
    quantity: z
      .string()
      .describe("Quantity as a string to preserve precision, e.g. '2.5'"),
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
  })
  .superRefine((item, ctx) => {
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
  });

export function registerInvoiceTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_invoices",
    {
      description:
        "List and filter sales invoices. Returns paginated results with count and pagination links.",
      inputSchema: {
        page: z.number().int().min(1).optional().describe("Page number (default: 1)"),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Results per page (default: 20, max: 100)"),
        client: z
          .string()
          .optional()
          .describe("Filter by client contact ID"),
        status: z
          .enum(["draft", "sent", "paid", "overdue", "void"])
          .optional()
          .describe("Filter by invoice status"),
        date_after: z
          .string()
          .optional()
          .describe("Filter invoices issued on or after this date (YYYY-MM-DD)"),
        date_before: z
          .string()
          .optional()
          .describe("Filter invoices issued on or before this date (YYYY-MM-DD)"),
        due_date_after: z
          .string()
          .optional()
          .describe("Filter by due date on or after (YYYY-MM-DD)"),
        due_date_before: z
          .string()
          .optional()
          .describe("Filter by due date on or before (YYYY-MM-DD)"),
        ordering: z
          .string()
          .optional()
          .describe("Sort field, e.g. '-date' for newest first"),
        search: z
          .string()
          .optional()
          .describe("Search term for invoice number or client name"),
      },
    },
    async ({
      page,
      page_size,
      client: clientId,
      status,
      date_after,
      date_before,
      due_date_after,
      due_date_before,
      ordering,
      search,
    }) => {
      const result = await client.get("/invoices/", {
        page,
        page_size,
        client: clientId,
        status,
        date_after,
        date_before,
        due_date_after,
        due_date_before,
        ordering,
        search,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_invoice",
    {
      description: "Fetch a single invoice by its Elorus ID.",
      inputSchema: {
        id: z.string().describe("The Elorus invoice ID"),
      },
    },
    async ({ id }) => {
      const result = await client.get(`/invoices/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "create_invoice",
    {
      description:
        "Create a new sales invoice. Monetary values must be strings (e.g. '1500.00') to avoid floating-point issues. Use list_taxes and list_document_types to obtain valid IDs before calling this tool.",
      inputSchema: z
        .object({
          client: z
            .string()
            .describe("Contact ID of the client being invoiced"),
          date: z
            .string()
            .describe("Invoice issue date in YYYY-MM-DD format"),
          documenttype: z
            .string()
            .describe(
              "Document type ID (obtain from list_document_types). Required for correct accounting and myDATA classification."
            ),
          items: z
            .array(lineItemSchema)
            .min(1)
            .describe("Line items on this invoice (at least one required)"),
          calculator_mode: z
            .enum(["initial", "total"])
            .optional()
            .default("initial")
            .describe(
              "'initial' means each item must have unit_value (price before tax); 'total' means each item must have unit_total (price after tax)"
            ),
          currency_code: z
            .string()
            .length(3)
            .optional()
            .describe("ISO 4217 currency code, e.g. 'EUR', 'USD' (default: organization currency)"),
          exchange_rate: z
            .string()
            .optional()
            .describe(
              "Exchange rate to organization base currency as a string, e.g. '1.000000'"
            ),
          due_date: z
            .string()
            .optional()
            .describe("Payment due date in YYYY-MM-DD format"),
          draft: z
            .boolean()
            .optional()
            .describe(
              "Set true to save as draft without finalizing or submitting to tax authority"
            ),
          paid_on_receipt: z
            .string()
            .optional()
            .describe("Amount paid immediately upon issue as a string, e.g. '0.00'"),
          payment_method: z
            .enum(["1", "2", "3", "4", "5", "6", "7"])
            .optional()
            .describe(
              "Payment method: 1=bank account, 2=cash, 3=cheque, 4=web banking, 5=POS, 6=PayPal, 7=other"
            ),
          notes: z.string().optional().describe("Internal or external notes on the invoice"),
          mydata_document_type: z
            .string()
            .optional()
            .describe(
              "AADE myDATA document type code (e.g. '1.1' for domestic sales invoice). Required for Greek organizations."
            ),
        })
        .superRefine((data, ctx) => {
          const mode = data.calculator_mode;
          data.items.forEach((item, i) => {
            if (mode === "initial" && !item.unit_value) {
              ctx.addIssue({
                code: "custom",
                path: ["items", i, "unit_value"],
                message: "calculator_mode 'initial' requires unit_value (price before tax) on each line item",
              });
            }
            if (mode === "total" && !item.unit_total) {
              ctx.addIssue({
                code: "custom",
                path: ["items", i, "unit_total"],
                message: "calculator_mode 'total' requires unit_total (price after tax) on each line item",
              });
            }
          });
        }),
    },
    async (args) => {
      const result = await client.post("/invoices/", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
