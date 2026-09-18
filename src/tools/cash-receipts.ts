import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

export function registerCashReceiptTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_cash_receipts",
    {
      description:
        "List payments received from clients. Returns paginated results. Filter by client, invoice, or date range.",
      inputSchema: {
        page: z.number().int().min(1).optional().describe("Page number (default: 1)"),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Results per page (default: 20, max: 100)"),
        client: z.string().optional().describe("Filter by client contact ID"),
        invoice: z.string().optional().describe("Filter by linked invoice ID"),
        date_after: z
          .string()
          .optional()
          .describe("Filter receipts on or after this date (YYYY-MM-DD)"),
        date_before: z
          .string()
          .optional()
          .describe("Filter receipts on or before this date (YYYY-MM-DD)"),
        ordering: z
          .string()
          .optional()
          .describe("Sort field, e.g. '-date' for newest first"),
      },
    },
    async ({ page, page_size, client: clientId, invoice, date_after, date_before, ordering }) => {
      const result = await client.get("/cashreceipts/", {
        page,
        page_size,
        contact: clientId,
        invoice,
        date_after,
        date_before,
        ordering,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "record_cash_receipt",
    {
      description:
        "Record a payment received from a client. Optionally links the payment to a specific invoice. Monetary amounts must be strings (e.g. '500.00').",
      inputSchema: {
        client: z.string().describe("Contact ID of the paying client"),
        date: z.string().describe("Payment date in YYYY-MM-DD format"),
        amount: z.string().describe("Amount received as a string, e.g. '500.00'"),
        invoice: z
          .string()
          .optional()
          .describe("Invoice ID to apply this payment against (optional)"),
        currency_code: z
          .string()
          .length(3)
          .optional()
          .describe("ISO 4217 currency code, e.g. 'EUR' (default: organization currency)"),
        exchange_rate: z
          .string()
          .optional()
          .describe("Exchange rate to organization base currency as a string, e.g. '1.000000'"),
        title: z
          .string()
          .optional()
          .describe(
            "Short label/reason for this payment. Cash receipts have no separate notes field, " +
              "so this is the only free-text field available."
          ),
      },
    },
    async ({ client: clientId, invoice, amount, ...rest }) => {
      const result = await client.post("/cashreceipts/", {
        ...rest,
        amount,
        contact: clientId,
        transaction_type: "ip",
        invoice_payments: invoice ? [{ invoice, amount }] : [],
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "export_cash_receipt_pdf",
    {
      description: "Export a cash receipt as a PDF. Returns the PDF file content directly (base64-encoded).",
      inputSchema: {
        id: z.string().describe("The Elorus cash receipt ID to export"),
      },
    },
    async ({ id }) => {
      const { data, contentType } = await client.getBinary(`/cashreceipts/${id}/pdf/`);
      return {
        content: [
          {
            type: "resource" as const,
            resource: {
              uri: `elorus://cashreceipts/${id}/pdf`,
              mimeType: contentType,
              blob: data.toString("base64"),
            },
          },
        ],
      };
    }
  );
}
