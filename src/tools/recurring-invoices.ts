import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { lineItemSchema } from "../schemas/line-item.js";

export function registerRecurringInvoiceTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_recurring_invoices",
    {
      description:
        "List and filter recurring invoice schedules — templates that automatically generate sales invoices on a recurring basis. Returns paginated results.",
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
        documenttype: z.string().optional().describe("Filter by document type ID"),
        draft: z
          .enum(["0", "1"])
          .optional()
          .describe("Filter by whether generated invoices are drafts ('1') or finalized ('0')"),
        currency_code: z.string().optional().describe("Filter by currency code"),
        recurring_status: z
          .enum(["active", "paused", "expired"])
          .optional()
          .describe("Filter by schedule status"),
        custom_id: z.string().optional().describe("Filter by custom ID"),
        ordering: z
          .string()
          .optional()
          .describe("Sort field, e.g. '-start_datetime' for newest first"),
        search: z
          .string()
          .optional()
          .describe("Search term for client name, document type, or sequence"),
      },
    },
    async ({
      page,
      page_size,
      client: clientId,
      documenttype,
      draft,
      currency_code,
      recurring_status,
      custom_id,
      ordering,
      search,
    }) => {
      const result = await client.get("/recurringinvoices/", {
        page,
        page_size,
        client: clientId,
        documenttype,
        draft,
        currency_code,
        recurring_status,
        custom_id,
        ordering,
        search,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_recurring_invoice",
    {
      description: "Fetch a single recurring invoice schedule by its Elorus ID.",
      inputSchema: {
        id: z.string().describe("The Elorus recurring invoice ID"),
      },
    },
    async ({ id }) => {
      const result = await client.get(`/recurringinvoices/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "create_recurring_invoice",
    {
      description:
        "Create a recurring invoice schedule that automatically generates sales invoices at a fixed interval (e.g. every month). " +
        "This creates the schedule/template only — invoices are generated automatically by Elorus at each occurrence, not by this call. " +
        "Monetary values must be strings (e.g. '1500.00'). Use list_taxes and list_document_types to obtain valid IDs. " +
        "Note: end_datetime is required by the API (it cannot be left blank for a never-expiring schedule) and must fall within " +
        "a bounded window relative to the start date and interval/period — expect an 'integrity_errors' response naming the valid range if it doesn't.",
      inputSchema: {
        client: z.string().describe("Contact ID of the client being invoiced"),
        items: z
          .array(lineItemSchema)
          .min(1)
          .describe("Line items included on each generated invoice (at least one required)"),
        calculator_mode: z
          .enum(["initial", "total"])
          .optional()
          .default("initial")
          .describe(
            "'initial' means each item must have unit_value (price before tax); 'total' means each item must have unit_total (price after tax)"
          ),
        start_datetime: z
          .string()
          .optional()
          .describe(
            "When the first invoice should be generated, as an ISO 8601 date-time (e.g. '2026-01-01T06:00:00Z'). Defaults to now if omitted."
          ),
        interval: z
          .number()
          .int()
          .min(1)
          .optional()
          .default(1)
          .describe(
            "Number of periods between occurrences, e.g. interval=1 + period='months' means every month, interval=3 + period='months' means quarterly. There is no dedicated 'yearly' period — use period='months' with interval=12."
          ),
        period: z
          .enum(["days", "weeks", "months"])
          .optional()
          .default("months")
          .describe("The recurrence period unit"),
        end_datetime: z
          .string()
          .describe(
            "When the schedule should stop generating invoices, as an ISO 8601 date-time. Required — the API rejects " +
              "null/blank despite what its docs imply, and enforces a bounded window relative to start_datetime and the " +
              "interval/period (roughly one period past the start date at minimum, and up to 5 years past it at maximum)."
          ),
        documenttype: z
          .string()
          .optional()
          .describe(
            "Document type ID (obtain from list_document_types). May be required depending on your organization's configuration."
          ),
        sequence: z.string().optional().describe("Numbering sequence ID for generated invoices"),
        draft: z
          .boolean()
          .optional()
          .describe("Whether generated invoices are saved as drafts instead of being finalized"),
        auto_email: z
          .boolean()
          .optional()
          .describe("Automatically email each generated invoice to the client. Requires draft: false."),
        due_days: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Days after the issue date before a generated invoice is considered overdue"),
        template: z.string().optional().describe("Document template ID used to render generated invoices"),
        currency_code: z
          .string()
          .length(3)
          .optional()
          .describe("ISO 4217 currency code, e.g. 'EUR', 'USD' (default: client or organization currency)"),
        exchange_rate: z
          .string()
          .optional()
          .describe("Exchange rate to organization base currency as a string, e.g. '1.000000'"),
        paused: z
          .boolean()
          .optional()
          .describe("Create the schedule already paused so it won't generate invoices until resumed"),
      },
    },
    async (args) => {
      const mode = args.calculator_mode ?? "initial";
      args.items.forEach((item, i) => {
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
      const result = await client.post("/recurringinvoices/", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_recurring_invoice",
    {
      description:
        "Update fields on an existing recurring invoice schedule. Only provided fields are changed (PATCH semantics); " +
        "the Elorus API only supports PUT on recurring invoices, so this fetches the current record and merges your fields into it before saving.",
      inputSchema: {
        id: z.string().describe("The Elorus recurring invoice ID to update"),
        client: z.string().optional().describe("Contact ID of the client being invoiced"),
        items: z
          .array(lineItemSchema)
          .min(1)
          .optional()
          .describe("Line items included on each generated invoice"),
        calculator_mode: z
          .enum(["initial", "total"])
          .optional()
          .describe(
            "'initial' means each item must have unit_value (price before tax); 'total' means each item must have unit_total (price after tax)"
          ),
        start_datetime: z
          .string()
          .optional()
          .describe("When the first invoice should be generated, as an ISO 8601 date-time"),
        interval: z
          .number()
          .int()
          .min(1)
          .optional()
          .describe("Number of periods between occurrences"),
        period: z.enum(["days", "weeks", "months"]).optional().describe("The recurrence period unit"),
        end_datetime: z
          .string()
          .optional()
          .describe(
            "When the schedule should stop generating invoices, as an ISO 8601 date-time. Omit/leave unset for no expiry."
          ),
        documenttype: z.string().optional().describe("Document type ID (obtain from list_document_types)"),
        sequence: z.string().optional().describe("Numbering sequence ID for generated invoices"),
        draft: z
          .boolean()
          .optional()
          .describe("Whether generated invoices are saved as drafts instead of being finalized"),
        auto_email: z
          .boolean()
          .optional()
          .describe("Automatically email each generated invoice to the client. Requires draft: false."),
        due_days: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("Days after the issue date before a generated invoice is considered overdue"),
        template: z.string().optional().describe("Document template ID used to render generated invoices"),
        currency_code: z
          .string()
          .length(3)
          .optional()
          .describe("ISO 4217 currency code, e.g. 'EUR', 'USD'"),
        exchange_rate: z
          .string()
          .optional()
          .describe("Exchange rate to organization base currency as a string, e.g. '1.000000'"),
        paused: z
          .boolean()
          .optional()
          .describe("Set true to pause the schedule (no new invoices generated) or false to resume it"),
      },
    },
    async ({ id, ...fields }) => {
      const result = await client.mergePut(`/recurringinvoices/${id}/`, fields);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "pause_recurring_invoice",
    {
      description: "Pause a recurring invoice schedule. While paused, no new invoices are generated until resumed.",
      inputSchema: {
        id: z.string().describe("The Elorus recurring invoice ID to pause"),
      },
    },
    async ({ id }) => {
      const result = await client.mergePut(`/recurringinvoices/${id}/`, { paused: true });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "resume_recurring_invoice",
    {
      description: "Resume a paused recurring invoice schedule so it starts generating invoices again.",
      inputSchema: {
        id: z.string().describe("The Elorus recurring invoice ID to resume"),
      },
    },
    async ({ id }) => {
      const result = await client.mergePut(`/recurringinvoices/${id}/`, { paused: false });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
