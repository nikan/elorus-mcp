import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { lineItemSchema } from "../schemas/line-item.js";
import { splitEmailList } from "../email.js";

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
    "get_credit_note",
    {
      description: "Fetch a single credit note by its Elorus ID.",
      inputSchema: {
        id: z.string().describe("The Elorus credit note ID"),
      },
    },
    async ({ id }) => {
      const result = await client.get(`/creditnotes/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_credit_note",
    {
      description:
        "Update fields on an existing credit note. custom_id and draft are PATCH-safe and can be " +
        "changed regardless of status (verified live: every other PATCH field tested — date, client, " +
        "notes — returns 200 but silently has no effect). Every other field here — date, client, " +
        "documenttype, items, currency_code, exchange_rate, notes — is only editable while the credit " +
        "note is still a draft, and is applied via a full PUT rather than PATCH. Updating items this " +
        "way REPLACES THE ENTIRE LINE LIST: include every existing line's id you want to keep, or that " +
        "line is deleted.",
      inputSchema: {
        id: z.string().describe("The Elorus credit note ID to update"),
        custom_id: z.string().optional().describe("Custom/external ID for this credit note (PATCH-safe, any status)"),
        draft: z
          .boolean()
          .optional()
          .describe("Whether the credit note is a draft (PATCH-safe, any status)"),
        date: z
          .string()
          .optional()
          .describe("Credit note issue date in YYYY-MM-DD format. Draft-only — requires a full PUT."),
        client: z.string().optional().describe("Contact ID of the client. Draft-only — requires a full PUT."),
        documenttype: z
          .string()
          .optional()
          .describe("Document type ID (obtain from list_document_types). Draft-only — requires a full PUT."),
        items: z
          .array(lineItemSchema)
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
              "Only relevant when items is provided."
          ),
        currency_code: z
          .string()
          .length(3)
          .optional()
          .describe("ISO 4217 currency code, e.g. 'EUR'. Draft-only — requires a full PUT."),
        exchange_rate: z
          .string()
          .optional()
          .describe(
            "Exchange rate to organization base currency, e.g. '1.000000'. Draft-only — requires a full " +
              "PUT (unverified whether this has any effect when currency_code matches the organization's " +
              "base currency — live testing showed no effect in that case)."
          ),
        notes: z
          .string()
          .optional()
          .describe(
            "Notes displayed on the credit note's printable form (maps to public_notes). Draft-only — requires a full PUT."
          ),
      },
    },
    async ({ id, custom_id, draft, date, client: clientId, documenttype, items, calculator_mode, currency_code, exchange_rate, notes }) => {
      const draftOnlyFieldProvided =
        date !== undefined ||
        clientId !== undefined ||
        documenttype !== undefined ||
        items !== undefined ||
        currency_code !== undefined ||
        exchange_rate !== undefined ||
        notes !== undefined;

      if (!draftOnlyFieldProvided) {
        const patchBody: Record<string, unknown> = {};
        if (custom_id !== undefined) patchBody.custom_id = custom_id;
        if (draft !== undefined) patchBody.draft = draft;
        const result = await client.patch(`/creditnotes/${id}/`, patchBody);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      if (items) {
        const mode = calculator_mode ?? "initial";
        items.forEach((item, i) => {
          if (mode === "initial" && !item.unit_value) {
            throw new Error(`items[${i}]: calculator_mode 'initial' requires unit_value on each line item`);
          }
          if (mode === "total" && !item.unit_total) {
            throw new Error(`items[${i}]: calculator_mode 'total' requires unit_total on each line item`);
          }
        });
      }

      const result = await client.mergePut(`/creditnotes/${id}/`, (current) => {
        if (current.draft !== true) {
          throw new Error(
            `Cannot update date/client/documenttype/items/currency_code/exchange_rate/notes on credit ` +
              `note ${id}: these fields are only editable while the credit note is a draft. Only ` +
              "custom_id and draft can be changed once a credit note is issued."
          );
        }
        const overrides: Record<string, unknown> = {};
        if (custom_id !== undefined) overrides.custom_id = custom_id;
        if (draft !== undefined) overrides.draft = draft;
        if (date !== undefined) overrides.date = date;
        if (clientId !== undefined) overrides.client = clientId;
        if (documenttype !== undefined) overrides.documenttype = documenttype;
        if (items !== undefined) overrides.items = items;
        if (currency_code !== undefined) overrides.currency_code = currency_code;
        if (exchange_rate !== undefined) overrides.exchange_rate = exchange_rate;
        if (notes !== undefined) overrides.public_notes = notes;
        return overrides;
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
      inputSchema: {
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
        notes: z
          .string()
          .optional()
          .describe("Notes displayed on the credit note's printable form (maps to the API's public_notes field)"),
      },
    },
    async ({ notes, ...rest }) => {
      const mode = rest.calculator_mode ?? "initial";
      rest.items.forEach((item, i) => {
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
      const result = await client.post("/creditnotes/", { ...rest, public_notes: notes });
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
    async ({ id, invoice, amount }) => {
      const result = await client.post(`/creditnotes/${id}/applied-credit/`, [{ invoice, amount }]);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "delete_credit_note",
    {
      description:
        "Permanently delete a credit note. Unlike void_credit_note, this removes the record entirely — " +
        "prefer void_credit_note for issued credit notes with financial history; this is intended for " +
        "draft cleanup. This is a hard delete with no undo.",
      inputSchema: {
        id: z.string().describe("The Elorus credit note ID to delete"),
      },
    },
    async ({ id }) => {
      await client.delete(`/creditnotes/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ id, deleted: true }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "void_credit_note",
    {
      description:
        "Void a credit note. A voided credit note cannot be edited or applied and is excluded from financial reports.",
      inputSchema: {
        id: z.string().describe("The Elorus credit note ID to void"),
      },
    },
    async ({ id }) => {
      const result = await client.put(`/creditnotes/${id}/void/`, { void: true });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "send_credit_note_email",
    {
      description:
        "Email a credit note to the client. First fetches the organization's default recipient/subject/message " +
        "for this credit note, then overrides them with any fields you provide before sending.",
      inputSchema: {
        id: z.string().describe("The Elorus credit note ID to send"),
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
          .describe("Whether to attach the credit note PDF to the email (default: true)"),
      },
    },
    async ({ id, to, subject, message, cc, bcc, attach_pdf }) => {
      const defaults = await client.get<{
        to?: string;
        cc?: string;
        bcc?: string;
        subject?: string;
        message?: string;
      }>(`/creditnotes/${id}/email/`);
      const body = {
        to: to ?? defaults.to,
        subject: subject ?? defaults.subject,
        message: message ?? defaults.message,
        cc: cc ?? splitEmailList(defaults.cc),
        bcc: bcc ?? splitEmailList(defaults.bcc),
        attach_pdf,
      };
      const result = await client.post(`/creditnotes/${id}/email/`, body);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "export_credit_note_pdf",
    {
      description: "Export a credit note as a PDF. Returns the PDF file content directly (base64-encoded).",
      inputSchema: {
        id: z.string().describe("The Elorus credit note ID to export"),
      },
    },
    async ({ id }) => {
      const { data, contentType } = await client.getBinary(`/creditnotes/${id}/pdf/`);
      return {
        content: [
          {
            type: "resource" as const,
            resource: {
              uri: `elorus://creditnotes/${id}/pdf`,
              mimeType: contentType,
              blob: data.toString("base64"),
            },
          },
        ],
      };
    }
  );
}
