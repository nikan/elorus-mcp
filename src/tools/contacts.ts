import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

export function registerContactTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_contacts",
    {
      description:
        "List and search contacts (clients, suppliers, or both). Returns paginated results with count and pagination links.",
      inputSchema: {
        page: z.number().int().min(1).optional().describe("Page number (default: 1)"),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Results per page (default: 20, max: 100)"),
        search: z
          .string()
          .optional()
          .describe("Search term to filter by name, company, email, or VAT number"),
        is_client: z
          .boolean()
          .optional()
          .describe("Filter to contacts marked as clients"),
        is_supplier: z
          .boolean()
          .optional()
          .describe("Filter to contacts marked as suppliers"),
        ordering: z
          .string()
          .optional()
          .describe("Field to sort by, e.g. 'company' or '-company' for descending"),
      },
    },
    async ({ page, page_size, search, is_client, is_supplier, ordering }) => {
      const result = await client.get("/contacts/", {
        page,
        page_size,
        search,
        is_client,
        is_supplier,
        ordering,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_contact",
    {
      description: "Fetch a single contact by its Elorus ID.",
      inputSchema: {
        id: z.string().describe("The Elorus contact ID"),
      },
    },
    async ({ id }) => {
      const result = await client.get(`/contacts/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "create_contact",
    {
      description:
        "Create a new contact (client, supplier, or both). Requires either 'company' (for businesses) or at least one of 'first_name'/'last_name' (for individuals).",
      inputSchema: {
        company: z.string().optional().describe("Company name (for company-type contacts)"),
        first_name: z.string().optional().describe("First name (for individual contacts)"),
        last_name: z.string().optional().describe("Last name (for individual contacts)"),
        is_client: z
          .boolean()
          .optional()
          .describe("Mark as a client (can issue invoices to them)"),
        is_supplier: z
          .boolean()
          .optional()
          .describe("Mark as a supplier (can record bills and payments to them)"),
        vat_number: z.string().optional().describe("VAT / tax registration number"),
        email: z
          .string()
          .email()
          .optional()
          .describe("Primary email address (stored as this contact's sole primary email account)"),
        phone: z
          .string()
          .optional()
          .describe("Primary phone number (stored as this contact's sole primary phone number)"),
        addresses: z
          .array(
            z.object({
              address: z.string().describe("Street address"),
              city: z.string().describe("City"),
              zip: z.string().describe("Postal / ZIP code"),
              country: z
                .string()
                .length(2)
                .describe("ISO 3166-1 alpha-2 country code, e.g. 'GR', 'US'"),
              ad_type: z
                .enum(["bill", "ship", "other"])
                .optional()
                .describe("Address type: 'bill' for billing, 'ship' for shipping, 'other' otherwise"),
            })
          )
          .optional()
          .describe("One or more addresses for this contact"),
      },
    },
    async ({ email, phone, ...args }) => {
      if (!args.company && !args.first_name && !args.last_name) {
        throw new Error(
          "Provide 'company' for a business contact, or 'first_name'/'last_name' for an individual"
        );
      }
      const body: Record<string, unknown> = { ...args };
      if (email) body.email = [{ email, primary: true }];
      if (phone) body.phones = [{ number: phone, primary: true }];
      const result = await client.post("/contacts/", body);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_contact",
    {
      description:
        "Update fields on an existing contact. Only provided fields are changed (PATCH semantics); " +
        "the Elorus API only supports PUT on contacts, so this fetches the current record and merges your fields into it before saving.",
      inputSchema: {
        id: z.string().describe("The Elorus contact ID to update"),
        company: z.string().optional().describe("Company name"),
        first_name: z.string().optional().describe("First name"),
        last_name: z.string().optional().describe("Last name"),
        is_client: z.boolean().optional().describe("Mark as client"),
        is_supplier: z.boolean().optional().describe("Mark as supplier"),
        active: z
          .boolean()
          .optional()
          .describe("Whether the contact is active (set to false to deactivate/archive it)"),
        vat_number: z.string().optional().describe("VAT / tax registration number"),
        email: z
          .string()
          .email()
          .optional()
          .describe("Primary email address (replaces this contact's entire list of email addresses with this single primary one)"),
        phone: z
          .string()
          .optional()
          .describe("Primary phone number (replaces this contact's entire list of phone numbers with this single primary one)"),
      },
    },
    async ({ id, email, phone, ...fields }) => {
      const body: Record<string, unknown> = { ...fields };
      if (email) body.email = [{ email, primary: true }];
      if (phone) body.phones = [{ number: phone, primary: true }];
      const result = await client.mergePut(`/contacts/${id}/`, body);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
