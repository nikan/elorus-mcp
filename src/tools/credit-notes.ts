import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

const lineItemSchema = z
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

export function registerCreditNoteTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_credit_notes",
    {
      description:
        "List credit notes issued to clients. Returns paginated results. Filter by client or date range.",
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
        date_after: z
          .string()
          .optional()
          .describe("Filter credit notes issued on or after this date (YYYY-MM-DD)"),
        date_before: z
          .string()
          .optional()
          .describe("Filter credit notes issued on or before this date (YYYY-MM-DD)"),
        ordering: z
          .string()
          .optional()
          .describe("Sort field, e.g. '-date' for newest first"),
      },
    },
    async ({ page, page_size, client: clientId, date_after, date_before, ordering }) => {
      const result = await client.get("/creditnotes/", {
        page,
        page_size,
        client: clientId,
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
    "create_credit_note",
    {
      description:
        "Create a credit note to reduce or cancel an amount owed by a client. Use list_taxes and list_document_types to obtain valid IDs before calling this tool.",
      inputSchema: z
        .object({
          client: z.string().describe("Contact ID of the client"),
          date: z.string().describe("Credit note issue date in YYYY-MM-DD format"),
          documenttype: z
            .string()
            .describe("Document type ID (obtain from list_document_types)"),
          items: z
            .array(lineItemSchema)
            .min(1)
            .describe("Line items on this credit note (at least one required)"),
          calculator_mode: z
            .enum(["initial", "total"])
            .optional()
            .default("initial")
            .describe(
              "'initial': each item must have unit_value (pre-tax); 'total': each item must have unit_total (post-tax)"
            ),
          currency_code: z
            .string()
            .length(3)
            .optional()
            .describe("ISO 4217 currency code, e.g. 'EUR'"),
          exchange_rate: z
            .string()
            .optional()
            .describe("Exchange rate to organization base currency, e.g. '1.000000'"),
          notes: z.string().optional().describe("Internal or external notes"),
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
      const result = await client.post("/creditnotes/", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "apply_credit_note",
    {
      description:
        "Apply a credit note against an open invoice to reduce the amount owed. The credit note and invoice must belong to the same client.",
      inputSchema: {
        id: z.string().describe("The credit note ID to apply"),
        invoice: z.string().describe("The invoice ID to apply the credit against"),
        amount: z
          .string()
          .describe("Amount to apply as a string, e.g. '150.00' (cannot exceed credit note balance)"),
      },
    },
    async ({ id, ...body }) => {
      const result = await client.post(`/creditnotes/${id}/apply/`, body);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
