import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { lineItemSchema as billLineItemSchema } from "../schemas/line-item.js";

export function registerBillTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_bills",
    {
      description:
        "List supplier bills (purchase invoices). Returns paginated results. Filter by supplier, status, or date range.",
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
        status: z
          .enum(["draft", "sent", "paid", "overdue", "void"])
          .optional()
          .describe("Filter by bill status"),
        date_after: z
          .string()
          .optional()
          .describe("Filter bills issued on or after this date (YYYY-MM-DD)"),
        date_before: z
          .string()
          .optional()
          .describe("Filter bills issued on or before this date (YYYY-MM-DD)"),
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
          .describe("Search term for bill number or supplier name"),
      },
    },
    async ({
      page,
      page_size,
      supplier,
      status,
      date_after,
      date_before,
      due_date_after,
      due_date_before,
      ordering,
      search,
    }) => {
      const result = await client.get("/bills/", {
        page,
        page_size,
        supplier,
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
    "get_bill",
    {
      description: "Fetch a single supplier bill by its Elorus ID.",
      inputSchema: {
        id: z.string().describe("The Elorus bill ID"),
      },
    },
    async ({ id }) => {
      const result = await client.get(`/bills/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "create_bill",
    {
      description:
        "Create a supplier bill (purchase invoice). Use list_taxes and list_document_types to obtain valid IDs before calling this tool.",
      inputSchema: {
        supplier: z.string().describe("Contact ID of the supplier issuing the bill"),
        date: z.string().describe("Bill issue date in YYYY-MM-DD format"),
        documenttype: z
          .string()
          .describe("Document type ID (obtain from list_document_types)"),
        items: z
          .array(billLineItemSchema)
          .min(1)
          .describe("Line items on this bill (at least one required)"),
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
        due_date: z
          .string()
          .optional()
          .describe("Payment due date in YYYY-MM-DD format"),
        draft: z
          .boolean()
          .optional()
          .describe("Set true to save as draft without finalizing"),
        notes: z.string().optional().describe("Internal notes"),
      },
    },
    async (args) => {
      const mode = args.calculator_mode ?? "initial";
      args.items.forEach((item, i) => {
        if (mode === "initial" && !item.unit_value) {
          throw new Error(
            `items[${i}]: calculator_mode 'initial' requires unit_value on each line item`
          );
        }
        if (mode === "total" && !item.unit_total) {
          throw new Error(
            `items[${i}]: calculator_mode 'total' requires unit_total on each line item`
          );
        }
      });
      const result = await client.post("/bills/", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_bill",
    {
      description: "Update fields on an existing bill. Only provided fields are changed (PATCH semantics).",
      inputSchema: {
        id: z.string().describe("The Elorus bill ID to update"),
        date: z.string().optional().describe("Bill issue date in YYYY-MM-DD format"),
        due_date: z.string().optional().describe("Payment due date in YYYY-MM-DD format"),
        notes: z.string().optional().describe("Internal notes"),
        reference: z
          .string()
          .optional()
          .describe(
            "Reference number or identifier for this bill (e.g. a supplier's customer/account reference)"
          ),
        draft: z
          .boolean()
          .optional()
          .describe(
            "Set false to issue a draft bill (required before a payment can be attached to it), or true to revert an unpaid bill back to draft"
          ),
      },
    },
    async ({ id, ...fields }) => {
      const result = await client.patch(`/bills/${id}/`, fields);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "add_bill_attachment",
    {
      description:
        "Attach a file (e.g. a scanned receipt or supplier bill PDF) to an existing bill. " +
        "Provide the file content as base64. By default the attachment is set as the primary " +
        "receipt (the document shown in the bill's receipt panel).",
      inputSchema: {
        id: z.string().describe("The Elorus bill ID to attach the file to"),
        filename: z.string().describe("File name including extension, e.g. 'bill.pdf'"),
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
            "Whether this attachment should be shown as the bill's primary receipt document. Default true."
          ),
      },
    },
    async ({ id, filename, content_base64, title, primary }) => {
      const form = new FormData();
      if (title) form.append("title", title);
      form.append("file", new Blob([Buffer.from(content_base64, "base64")]), filename);
      const result = await client.postMultipart<{ id: string }>(`/bills/${id}/attachments/`, form);
      if (primary) {
        await client.patch(`/bills/${id}/attachments/${result.id}/`, { primary: true });
      }
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ ...result, primary }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "void_bill",
    {
      description: "Void a supplier bill. A voided bill is excluded from financial reports and cannot be paid.",
      inputSchema: {
        id: z.string().describe("The Elorus bill ID to void"),
      },
    },
    async ({ id }) => {
      const result = await client.post(`/bills/${id}/void/`, {});
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
