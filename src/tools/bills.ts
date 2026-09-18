import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { readAttachmentFile } from "../attachments.js";
import { billLineItemSchema } from "../schemas/bill-line-item.js";

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
    async ({ page, page_size, supplier, status, date_after, date_before, ordering, search }) => {
      const result = await client.get("/bills/", {
        page,
        page_size,
        supplier,
        status,
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
        "Create a supplier bill (purchase invoice). Use list_taxes and list_expense_categories to obtain valid IDs before calling this tool.",
      inputSchema: {
        supplier: z.string().describe("Contact ID of the supplier issuing the bill"),
        date: z.string().describe("Bill issue date in YYYY-MM-DD format"),
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
        draft: z
          .boolean()
          .optional()
          .describe("Set true to save as draft without finalizing"),
      },
    },
    async ({ items, ...rest }) => {
      const mode = rest.calculator_mode ?? "initial";
      items.forEach((item, i) => {
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
      const body = {
        ...rest,
        items: items.map(({ title, ...item }) => ({ ...item, description: title })),
      };
      const result = await client.post("/bills/", body);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_bill",
    {
      description:
        "Update fields on an existing bill. Only provided fields are changed. Note: reference " +
        "can only be set while the bill is in draft — the API rejects any field changes once " +
        "a bill is issued, except for draft/date, so revert to draft first if needed.",
      inputSchema: {
        id: z.string().describe("The Elorus bill ID to update"),
        date: z.string().optional().describe("Bill issue date in YYYY-MM-DD format"),
        reference: z
          .string()
          .optional()
          .describe(
            "Reference number or identifier for this bill (e.g. a supplier's customer/account reference). " +
              "Only settable while the bill is in draft."
          ),
        draft: z
          .boolean()
          .optional()
          .describe(
            "Set false to issue a draft bill (required before a payment can be attached to it), or true to revert an unpaid bill back to draft"
          ),
      },
    },
    async ({ id, reference, ...fields }) => {
      if (reference !== undefined) {
        const result = await client.mergePut(`/bills/${id}/`, { ...fields, reference });
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }
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
        "Provide EITHER file_path (read directly off this machine's local disk, restricted to the " +
        "directory tree configured via the ELORUS_ATTACHMENT_ROOT environment variable) OR " +
        "content_base64 (raw bytes supplied by the caller). Prefer file_path whenever the file already " +
        "exists on disk under that root: it avoids pushing a large base64 string through the calling " +
        "client. By default the attachment is set as the primary receipt (the document shown in the " +
        "bill's receipt panel).",
      inputSchema: {
        id: z.string().describe("The Elorus bill ID to attach the file to"),
        file_path: z
          .string()
          .optional()
          .describe(
            "Absolute path to a file already on this machine's local disk, under the directory " +
              "configured via ELORUS_ATTACHMENT_ROOT. Use this instead of content_base64 whenever the " +
              "file already exists locally."
          ),
        filename: z
          .string()
          .optional()
          .describe(
            "File name including extension, e.g. 'bill.pdf'. Required when using content_base64; " +
              "inferred from file_path's basename when omitted."
          ),
        content_base64: z
          .string()
          .optional()
          .describe("Base64-encoded file content. Omit this and use file_path when the file already exists on disk."),
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
    async ({ id, file_path, filename, content_base64, title, primary }) => {
      let buffer: Buffer;
      let resolvedFilename: string;
      if (file_path) {
        buffer = await readAttachmentFile(file_path);
        resolvedFilename = filename ?? path.basename(file_path);
      } else if (content_base64) {
        if (!filename) {
          throw new Error("filename is required when providing content_base64");
        }
        buffer = Buffer.from(content_base64, "base64");
        resolvedFilename = filename;
      } else {
        throw new Error("Provide either file_path or content_base64");
      }
      const form = new FormData();
      if (title) form.append("title", title);
      form.append("file", new Blob([Uint8Array.from(buffer)]), resolvedFilename);
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
      const result = await client.put(`/bills/${id}/void/`, { void: true });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
