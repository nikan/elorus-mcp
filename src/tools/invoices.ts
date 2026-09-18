import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { lineItemSchema, lineItemUpdateSchema } from "../schemas/line-item.js";
import { splitEmailList } from "../email.js";

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
    "update_invoice",
    {
      description:
        "Update fields on an existing invoice. custom_id, draft, exchange_rate, payment_gateways, and " +
        "trackingcategories are PATCH-safe and can be changed regardless of status. Every other field " +
        "here — date, client, documenttype, items, calculator_mode, currency_code, due_date, notes — is " +
        "only editable while the invoice is still a draft, and is applied via a full PUT rather than " +
        "PATCH. Updating items this way REPLACES THE ENTIRE LINE LIST: include every existing line's id " +
        "you want to keep, or that line is deleted.",
      inputSchema: {
        id: z.string().describe("The Elorus invoice ID to update"),
        custom_id: z.string().optional().describe("Custom/external ID for this invoice (PATCH-safe, any status)"),
        draft: z
          .boolean()
          .optional()
          .describe("Whether the invoice is a draft (PATCH-safe, any status)"),
        exchange_rate: z
          .string()
          .optional()
          .describe("Exchange rate to organization base currency, e.g. '1.000000' (PATCH-safe, any status)"),
        payment_gateways: z
          .array(z.record(z.string(), z.unknown()))
          .optional()
          .describe("Enabled payment gateway configuration for this invoice (PATCH-safe, any status)"),
        trackingcategories: z
          .array(z.record(z.string(), z.unknown()))
          .optional()
          .describe("Tracking category assignments for this invoice (PATCH-safe, any status)"),
        date: z
          .string()
          .optional()
          .describe("Invoice issue date in YYYY-MM-DD format. Draft-only — requires a full PUT."),
        client: z.string().optional().describe("Contact ID of the client. Draft-only — requires a full PUT."),
        documenttype: z
          .string()
          .optional()
          .describe("Document type ID (obtain from list_document_types). Draft-only — requires a full PUT."),
        items: z
          .array(lineItemUpdateSchema)
          .min(1)
          .optional()
          .describe(
            "Full replacement line item list — include every existing line's id to keep it, since any " +
              "existing line whose id is omitted is deleted. Draft-only — requires a full PUT."
          ),
        calculator_mode: z
          .enum(["initial", "total"])
          .optional()
          .describe(
            "'initial' means each item must have unit_value; 'total' means each item must have unit_total. " +
              "Validates items when provided, and is itself persisted on the invoice — Draft-only, requires " +
              "a full PUT even when items is omitted."
          ),
        currency_code: z
          .string()
          .length(3)
          .optional()
          .describe("ISO 4217 currency code, e.g. 'EUR'. Draft-only — requires a full PUT."),
        due_date: z
          .string()
          .optional()
          .describe(
            "Payment due date in YYYY-MM-DD format, converted to due_days. Draft-only — requires a full PUT."
          ),
        notes: z
          .string()
          .optional()
          .describe(
            "Notes displayed on the invoice's printable form (maps to public_notes). Draft-only — requires a full PUT."
          ),
      },
    },
    async ({
      id,
      custom_id,
      draft,
      exchange_rate,
      payment_gateways,
      trackingcategories,
      date,
      client: clientId,
      documenttype,
      items,
      calculator_mode,
      currency_code,
      due_date,
      notes,
    }) => {
      const draftOnlyFieldProvided =
        date !== undefined ||
        clientId !== undefined ||
        documenttype !== undefined ||
        items !== undefined ||
        calculator_mode !== undefined ||
        currency_code !== undefined ||
        due_date !== undefined ||
        notes !== undefined;

      if (!draftOnlyFieldProvided) {
        const patchBody: Record<string, unknown> = {};
        if (custom_id !== undefined) patchBody.custom_id = custom_id;
        if (draft !== undefined) patchBody.draft = draft;
        if (exchange_rate !== undefined) patchBody.exchange_rate = exchange_rate;
        if (payment_gateways !== undefined) patchBody.payment_gateways = payment_gateways;
        if (trackingcategories !== undefined) patchBody.trackingcategories = trackingcategories;
        const result = await client.patch(`/invoices/${id}/`, patchBody);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (items) {
        const mode = calculator_mode ?? "initial";
        items.forEach((item, i) => {
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
      }

      const result = await client.mergePut(`/invoices/${id}/`, (current) => {
        if (current.draft !== true) {
          throw new Error(
            `Cannot update date/client/documenttype/items/calculator_mode/currency_code/due_date/notes on invoice ${id}: ` +
              "these fields are only editable while the invoice is a draft. Only custom_id, draft, " +
              "exchange_rate, payment_gateways, and trackingcategories can be changed once an invoice is issued."
          );
        }
        const overrides: Record<string, unknown> = {};
        if (custom_id !== undefined) overrides.custom_id = custom_id;
        if (draft !== undefined) overrides.draft = draft;
        if (exchange_rate !== undefined) overrides.exchange_rate = exchange_rate;
        if (payment_gateways !== undefined) overrides.payment_gateways = payment_gateways;
        if (trackingcategories !== undefined) overrides.trackingcategories = trackingcategories;
        if (date !== undefined) overrides.date = date;
        if (clientId !== undefined) overrides.client = clientId;
        if (documenttype !== undefined) overrides.documenttype = documenttype;
        if (items !== undefined) overrides.items = items;
        if (calculator_mode !== undefined) overrides.calculator_mode = calculator_mode;
        if (currency_code !== undefined) overrides.currency_code = currency_code;
        if (notes !== undefined) overrides.public_notes = notes;
        if (due_date !== undefined) {
          const baseDate = date ?? (current.date as string);
          const days = Math.round((Date.parse(due_date) - Date.parse(baseDate)) / (24 * 60 * 60 * 1000));
          if (Number.isNaN(days) || days < 0) {
            throw new Error("due_date must be a valid YYYY-MM-DD date on or after the invoice date");
          }
          overrides.due_days = days;
        }
        return overrides;
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "delete_invoice",
    {
      description:
        "Permanently delete an invoice. Unlike void_invoice, this removes the record entirely — prefer " +
        "void_invoice for issued invoices with financial history; this is intended for draft cleanup. " +
        "This is a hard delete with no undo.",
      inputSchema: {
        id: z.string().describe("The Elorus invoice ID to delete"),
      },
    },
    async ({ id }) => {
      await client.delete(`/invoices/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ id, deleted: true }, null, 2) }],
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
