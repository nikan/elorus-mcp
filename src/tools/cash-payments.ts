import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

export function registerCashPaymentTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_cash_payments",
    {
      description:
        "List payments made to suppliers. Returns paginated results. Filter by supplier, bill, or date range.",
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
        bill: z.string().optional().describe("Filter by linked bill ID"),
        date_after: z
          .string()
          .optional()
          .describe("Filter payments on or after this date (YYYY-MM-DD)"),
        date_before: z
          .string()
          .optional()
          .describe("Filter payments on or before this date (YYYY-MM-DD)"),
        ordering: z
          .string()
          .optional()
          .describe("Sort field, e.g. '-date' for newest first"),
      },
    },
    async ({ page, page_size, supplier, bill, date_after, date_before, ordering }) => {
      const result = await client.get("/cashpayments/", {
        page,
        page_size,
        contact: supplier,
        purchase: bill,
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
    "record_cash_payment",
    {
      description:
        "Record a payment made to a supplier. Optionally links the payment to a specific bill. Monetary amounts must be strings (e.g. '250.00').",
      inputSchema: {
        supplier: z.string().describe("Contact ID of the supplier being paid"),
        date: z.string().describe("Payment date in YYYY-MM-DD format"),
        amount: z.string().describe("Amount paid as a string, e.g. '250.00'"),
        payment_method: z
          .enum(["1", "2", "3", "4", "5", "6", "7"])
          .describe(
            "Payment method: 1=bank account, 2=cash, 3=cheque, 4=web banking, 5=POS, 6=PayPal, 7=other"
          ),
        bill: z
          .string()
          .optional()
          .describe("Bill ID to apply this payment against (optional)"),
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
            "Short label for this payment, e.g. the source bank and transaction reference " +
              "('Starling — Direct Debit, ref 609952404001'). Cash payments have no separate " +
              "notes field, so this is the only free-text field available."
          ),
      },
    },
    async ({ supplier, bill, amount, ...rest }) => {
      const result = await client.post("/cashpayments/", {
        ...rest,
        amount,
        contact: supplier,
        transaction_type: "ip",
        purchase_payments: bill ? [{ purchase: bill, amount }] : [],
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_cash_payment",
    {
      description:
        "Update fields on an existing cash payment (e.g. its title/bank reference, date, or amount). " +
        "Only provided fields are changed; the Elorus API only supports PUT on cash payments, so this " +
        "fetches the current record and merges your fields into it before saving.",
      inputSchema: {
        id: z.string().describe("The Elorus cash payment ID to update"),
        date: z.string().optional().describe("Payment date in YYYY-MM-DD format"),
        amount: z.string().optional().describe("Amount paid as a string, e.g. '250.00'"),
        title: z
          .string()
          .optional()
          .describe("Short label for this payment, e.g. the source bank and transaction reference"),
      },
    },
    async ({ id, ...fields }) => {
      const result = await client.mergePut(`/cashpayments/${id}/`, fields);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "delete_cash_payment",
    {
      description:
        "Permanently delete a payment made to a supplier. If the payment is linked to a bill, " +
        "the bill's paid amount is reduced accordingly; a fully-paid bill with no remaining " +
        "payments can then be reverted to draft via update_bill. This is a hard delete with no undo.",
      inputSchema: {
        id: z.string().describe("The Elorus cash payment ID to delete"),
      },
    },
    async ({ id }) => {
      await client.delete(`/cashpayments/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ id, deleted: true }, null, 2) }],
      };
    }
  );
}
