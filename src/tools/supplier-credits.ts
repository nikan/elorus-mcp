import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { billLineItemSchema, billLineItemUpdateSchema } from "../schemas/bill-line-item.js";
import { splitEmailList } from "../email.js";

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
    "get_supplier_credit",
    {
      description: "Fetch a single supplier credit by its Elorus ID.",
      inputSchema: {
        id: z.string().describe("The Elorus supplier credit ID"),
      },
    },
    async ({ id }) => {
      const result = await client.get(`/suppliercredits/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_supplier_credit",
    {
      description:
        "Update fields on an existing supplier credit. custom_id and draft are PATCH-safe and can be " +
        "changed regardless of status (verified live: every other PATCH field tested — date, reference, " +
        "notes — returns 200 but silently has no effect). Every other field here — date, supplier, " +
        "documenttype, items, calculator_mode, currency_code, exchange_rate, notes, reference — is only " +
        "editable while the supplier credit is still a draft, and is applied via a full PUT rather than " +
        "PATCH. Updating items this way REPLACES THE ENTIRE LINE LIST: include every existing line's id " +
        "you want to keep, or that line is deleted. Line items use the same shape as bills — supply " +
        "title (mapped to the API's description) and a required expense_category per line, not the " +
        "invoice-style shape.",
      inputSchema: {
        id: z.string().describe("The Elorus supplier credit ID to update"),
        custom_id: z
          .string()
          .optional()
          .describe("Custom/external ID for this supplier credit (PATCH-safe, any status)"),
        draft: z
          .boolean()
          .optional()
          .describe("Whether the supplier credit is a draft (PATCH-safe, any status)"),
        date: z
          .string()
          .optional()
          .describe("Supplier credit date in YYYY-MM-DD format. Draft-only — requires a full PUT."),
        supplier: z
          .string()
          .optional()
          .describe("Contact ID of the supplier. Draft-only — requires a full PUT."),
        documenttype: z
          .string()
          .optional()
          .describe("Document type ID (obtain from list_document_types). Draft-only — requires a full PUT."),
        items: z
          .array(billLineItemUpdateSchema)
          .min(1)
          .optional()
          .describe(
            "Full replacement line item list, using the same shape as bills (title, quantity, " +
              "unit_value/unit_total, expense_category, taxes, discount, product) — supplier credit " +
              "items require expense_category and are sent to the API as description, not title. " +
              "Include every existing line's id to keep it, since any existing line whose id is omitted " +
              "is deleted. Draft-only — requires a full PUT."
          ),
        calculator_mode: z
          .enum(["initial", "total"])
          .optional()
          .describe(
            "'initial' means each item must have unit_value; 'total' means each item must have unit_total. " +
              "Validates items against this mode when provided; when omitted, items are validated against " +
              "the supplier credit's current calculator_mode instead. Itself persisted on the supplier " +
              "credit — Draft-only, requires a full PUT even when items is omitted."
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
            "Notes displayed on the supplier credit's printable form (maps to public_notes). Draft-only — requires a full PUT."
          ),
        reference: z
          .string()
          .optional()
          .describe(
            "Reference number or identifier for this supplier credit. Draft-only — requires a full PUT."
          ),
      },
    },
    async ({
      id,
      custom_id,
      draft,
      date,
      supplier,
      documenttype,
      items,
      calculator_mode,
      currency_code,
      exchange_rate,
      notes,
      reference,
    }) => {
      const draftOnlyFieldProvided =
        date !== undefined ||
        supplier !== undefined ||
        documenttype !== undefined ||
        items !== undefined ||
        calculator_mode !== undefined ||
        currency_code !== undefined ||
        exchange_rate !== undefined ||
        notes !== undefined ||
        reference !== undefined;

      if (!draftOnlyFieldProvided) {
        const patchBody: Record<string, unknown> = {};
        if (custom_id !== undefined) patchBody.custom_id = custom_id;
        if (draft !== undefined) patchBody.draft = draft;
        const result = await client.patch(`/suppliercredits/${id}/`, patchBody);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      }

      const result = await client.mergePut(`/suppliercredits/${id}/`, (current) => {
        if (current.draft !== true) {
          throw new Error(
            `Cannot update date/supplier/documenttype/items/calculator_mode/currency_code/exchange_rate/` +
              `notes/reference on supplier credit ${id}: these fields are only editable while the supplier credit is a ` +
              "draft. Only custom_id and draft can be changed once a supplier credit is issued."
          );
        }
        if (items) {
          const mode =
            calculator_mode ?? (typeof current.calculator_mode === "string" ? current.calculator_mode : "initial");
          items.forEach((item, i) => {
            if (mode === "initial" && !item.unit_value) {
              throw new Error(`items[${i}]: calculator_mode 'initial' requires unit_value on each line item`);
            }
            if (mode === "total" && !item.unit_total) {
              throw new Error(`items[${i}]: calculator_mode 'total' requires unit_total on each line item`);
            }
          });
        }
        const overrides: Record<string, unknown> = {};
        if (custom_id !== undefined) overrides.custom_id = custom_id;
        if (draft !== undefined) overrides.draft = draft;
        if (date !== undefined) overrides.date = date;
        if (supplier !== undefined) overrides.supplier = supplier;
        if (documenttype !== undefined) overrides.documenttype = documenttype;
        if (items !== undefined) {
          overrides.items = items.map(({ title, ...item }) => ({ ...item, description: title }));
        }
        if (calculator_mode !== undefined) overrides.calculator_mode = calculator_mode;
        if (currency_code !== undefined) overrides.currency_code = currency_code;
        if (exchange_rate !== undefined) overrides.exchange_rate = exchange_rate;
        if (notes !== undefined) overrides.public_notes = notes;
        if (reference !== undefined) overrides.reference = reference;
        return overrides;
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
        "Record a credit note received from a supplier (e.g. a refund or price correction on a bill). Use list_taxes, list_expense_categories, and list_document_types to obtain valid IDs.",
      inputSchema: {
        supplier: z.string().describe("Contact ID of the supplier"),
        date: z.string().describe("Supplier credit date in YYYY-MM-DD format"),
        documenttype: z
          .string()
          .describe("Document type ID (obtain from list_document_types)"),
        items: z
          .array(billLineItemSchema)
          .min(1)
          .describe(
            "Line items on this supplier credit (at least one required), using the same shape as bills — " +
              "title (sent to the API as description), quantity, unit_value/unit_total, a required " +
              "expense_category, taxes, discount, product"
          ),
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
          .describe("Notes displayed on the supplier credit's printable form (maps to the API's public_notes field)"),
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
      const body = {
        ...rest,
        items: rest.items.map(({ title, ...item }) => ({ ...item, description: title })),
        public_notes: notes,
      };
      const result = await client.post("/suppliercredits/", body);
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
    async ({ id, bill, amount }) => {
      const result = await client.post(`/suppliercredits/${id}/applied-credit/`, [
        { purchase: bill, amount },
      ]);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "delete_supplier_credit",
    {
      description:
        "Permanently delete a supplier credit. Unlike void_supplier_credit, this removes the record " +
        "entirely — prefer void_supplier_credit for issued supplier credits with financial history; " +
        "this is intended for draft cleanup. This is a hard delete with no undo.",
      inputSchema: {
        id: z.string().describe("The Elorus supplier credit ID to delete"),
      },
    },
    async ({ id }) => {
      await client.delete(`/suppliercredits/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ id, deleted: true }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "void_supplier_credit",
    {
      description:
        "Void a supplier credit. A voided supplier credit cannot be edited or applied and is excluded from financial reports.",
      inputSchema: {
        id: z.string().describe("The Elorus supplier credit ID to void"),
      },
    },
    async ({ id }) => {
      const result = await client.put(`/suppliercredits/${id}/void/`, { void: true });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "send_supplier_credit_email",
    {
      description:
        "Email a supplier credit to the supplier. First fetches the organization's default " +
        "recipient/subject/message for this supplier credit, then overrides them with any fields you " +
        "provide before sending.",
      inputSchema: {
        id: z.string().describe("The Elorus supplier credit ID to send"),
        to: z
          .string()
          .email()
          .optional()
          .describe("Recipient email address (default: the supplier's stored email)"),
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
          .describe("Whether to attach the supplier credit PDF to the email (default: true)"),
      },
    },
    async ({ id, to, subject, message, cc, bcc, attach_pdf }) => {
      const defaults = await client.get<{
        to?: string;
        cc?: string;
        bcc?: string;
        subject?: string;
        message?: string;
      }>(`/suppliercredits/${id}/email/`);
      const body = {
        to: to ?? defaults.to,
        subject: subject ?? defaults.subject,
        message: message ?? defaults.message,
        cc: cc ?? splitEmailList(defaults.cc),
        bcc: bcc ?? splitEmailList(defaults.bcc),
        attach_pdf,
      };
      const result = await client.post(`/suppliercredits/${id}/email/`, body);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "export_supplier_credit_pdf",
    {
      description: "Export a supplier credit as a PDF. Returns the PDF file content directly (base64-encoded).",
      inputSchema: {
        id: z.string().describe("The Elorus supplier credit ID to export"),
      },
    },
    async ({ id }) => {
      const { data, contentType } = await client.getBinary(`/suppliercredits/${id}/pdf/`);
      return {
        content: [
          {
            type: "resource" as const,
            resource: {
              uri: `elorus://suppliercredits/${id}/pdf`,
              mimeType: contentType,
              blob: data.toString("base64"),
            },
          },
        ],
      };
    }
  );
}
