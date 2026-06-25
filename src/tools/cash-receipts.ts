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
        client: clientId,
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
        payment_method: z
          .enum(["1", "2", "3", "4", "5", "6", "7"])
          .describe(
            "Payment method: 1=bank account, 2=cash, 3=cheque, 4=web banking, 5=POS, 6=PayPal, 7=other"
          ),
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
        notes: z.string().optional().describe("Internal notes about this payment"),
      },
    },
    async (args) => {
      const result = await client.post("/cashreceipts/", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "export_cash_receipt_pdf",
    {
      description: "Export a cash receipt as a PDF. Returns a download URL for the generated PDF file.",
      inputSchema: {
        id: z.string().describe("The Elorus cash receipt ID to export"),
      },
    },
    async ({ id }) => {
      const result = await client.get(`/cashreceipts/${id}/pdf/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
