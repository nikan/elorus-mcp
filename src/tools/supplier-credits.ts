import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { lineItemSchema } from "../schemas/line-item.js";

export function registerSupplierCreditTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_supplier_credits",
    {
      description:
        "List supplier credit notes (credits received from suppliers). Returns paginated results. Filter by supplier or date range.",
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
        date_after: z
          .string()
          .optional()
          .describe("Filter supplier credits on or after this date (YYYY-MM-DD)"),
        date_before: z
          .string()
          .optional()
          .describe("Filter supplier credits on or before this date (YYYY-MM-DD)"),
        ordering: z
          .string()
          .optional()
          .describe("Sort field, e.g. '-date' for newest first"),
      },
    },
    async ({ page, page_size, supplier, date_after, date_before, ordering }) => {
      const result = await client.get("/suppliercredits/", {
        page,
        page_size,
        supplier,
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
    "create_supplier_credit",
    {
      description:
        "Record a credit note received from a supplier (e.g. a refund or price correction on a bill). Use list_taxes and list_document_types to obtain valid IDs.",
      inputSchema: z
        .object({
          supplier: z.string().describe("Contact ID of the supplier"),
          date: z.string().describe("Supplier credit date in YYYY-MM-DD format"),
          documenttype: z
            .string()
            .describe("Document type ID (obtain from list_document_types)"),
          items: z
            .array(lineItemSchema)
            .min(1)
            .describe("Line items on this supplier credit (at least one required)"),
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
      const result = await client.post("/suppliercredits/", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "apply_supplier_credit",
    {
      description:
        "Apply a supplier credit against an open bill to reduce the amount owed to the supplier.",
      inputSchema: {
        id: z.string().describe("The supplier credit ID to apply"),
        bill: z.string().describe("The bill ID to apply the supplier credit against"),
        amount: z
          .string()
          .describe("Amount to apply as a string, e.g. '100.00' (cannot exceed supplier credit balance)"),
      },
    },
    async ({ id, ...body }) => {
      const result = await client.post(`/suppliercredits/${id}/apply/`, body);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
