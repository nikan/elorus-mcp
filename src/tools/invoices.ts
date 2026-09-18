import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { lineItemSchema } from "../schemas/line-item.js";

/** The email defaults endpoint returns cc/bcc as comma-separated strings; the send endpoint expects arrays. */
function splitEmailList(value: string | undefined): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

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
      inputSchema: {
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
          .describe(
            "Payment due date in YYYY-MM-DD format. Converted to the API's due_days (days after the issue date)."
          ),
        draft: z
          .boolean()
          .optional()
          .describe(
            "Set true to save as draft without finalizing or submitting to tax authority"
          ),
        notes: z
          .string()
          .optional()
          .describe("Notes displayed on the invoice's printable form (maps to the API's public_notes field)"),
      },
    },
    async ({ due_date, notes, ...rest }) => {
      const mode = rest.calculator_mode ?? "initial";
      rest.items.forEach((item, i) => {
        if (mode === "initial" && !item.unit_value) {
          throw new Error(
            `items[${i}]: calculator_mode 'initial' requires unit_value (price before tax) on each line item`
          );
        }
        if (mode === "total" && !item.unit_total) {
          throw new Error(
            `items[${i}]: calculator_mode 'total' requires unit_total (price after tax) on each line item`
          );
        }
      });
      const body: Record<string, unknown> = { ...rest, public_notes: notes };
      if (due_date) {
        const days = Math.round(
          (Date.parse(due_date) - Date.parse(rest.date)) / (24 * 60 * 60 * 1000)
        );
        if (Number.isNaN(days) || days < 0) {
          throw new Error("due_date must be a valid YYYY-MM-DD date on or after the invoice date");
        }
        body.due_days = days;
      }
      const result = await client.post("/invoices/", body);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "void_invoice",
    {
      description: "Void an invoice. A voided invoice cannot be edited or paid and is excluded from financial reports.",
      inputSchema: {
        id: z.string().describe("The Elorus invoice ID to void"),
      },
    },
    async ({ id }) => {
      const result = await client.put(`/invoices/${id}/void/`, { void: true });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "send_invoice_email",
    {
      description:
        "Email an invoice to the client. First fetches the organization's default recipient/subject/message " +
        "for this invoice, then overrides them with any fields you provide before sending.",
      inputSchema: {
        id: z.string().describe("The Elorus invoice ID to send"),
        to: z
          .string()
          .email()
          .optional()
          .describe("Recipient email address (default: the client's stored email)"),
        subject: z
          .string()
          .optional()
          .describe("Email subject line (default: the organization's email template)"),
        message: z
          .string()
          .optional()
          .describe("Email body text, may contain HTML (default: the organization's email template)"),
        cc: z
          .array(z.string().email())
          .optional()
          .describe("CC email addresses (default: the organization's configured CC list)"),
        bcc: z
          .array(z.string().email())
          .optional()
          .describe("BCC email addresses (default: the organization's configured BCC list)"),
        attach_pdf: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether to attach the invoice PDF to the email (default: true)"),
      },
    },
    async ({ id, to, subject, message, cc, bcc, attach_pdf }) => {
      const defaults = await client.get<{
        to?: string;
        cc?: string;
        bcc?: string;
        subject?: string;
        message?: string;
      }>(`/invoices/${id}/email/`);
      const body = {
        to: to ?? defaults.to,
        subject: subject ?? defaults.subject,
        message: message ?? defaults.message,
        cc: cc ?? splitEmailList(defaults.cc),
        bcc: bcc ?? splitEmailList(defaults.bcc),
        attach_pdf,
      };
      const result = await client.post(`/invoices/${id}/email/`, body);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "export_invoice_pdf",
    {
      description: "Export an invoice as a PDF. Returns the PDF file content directly (base64-encoded).",
      inputSchema: {
        id: z.string().describe("The Elorus invoice ID to export"),
      },
    },
    async ({ id }) => {
      const { data, contentType } = await client.getBinary(`/invoices/${id}/pdf/`);
      return {
        content: [
          {
            type: "resource" as const,
            resource: {
              uri: `elorus://invoices/${id}/pdf`,
              mimeType: contentType,
              blob: data.toString("base64"),
            },
          },
        ],
      };
    }
  );
}
