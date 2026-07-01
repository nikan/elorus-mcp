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
        client_type: z
          .enum(["1", "2"])
          .optional()
          .describe("Contact type: '1' for company, '2' for individual (default: '1')"),
        is_client: z
          .boolean()
          .optional()
          .describe("Mark as a client (can issue invoices to them)"),
        is_supplier: z
          .boolean()
          .optional()
          .describe("Mark as a supplier (can record bills and payments to them)"),
        vat_number: z.string().optional().describe("VAT / tax registration number"),
        email: z.string().email().optional().describe("Primary email address"),
        phone: z.string().optional().describe("Primary phone number"),
        addresses: z
          .array(
            z.object({
              address: z.string().optional().describe("Street address"),
              city: z.string().optional().describe("City"),
              zip: z.string().optional().describe("Postal / ZIP code"),
              country: z
                .string()
                .length(2)
                .optional()
                .describe("ISO 3166-1 alpha-2 country code, e.g. 'GR', 'US'"),
              ad_type: z
                .enum(["bill", "ship"])
                .optional()
                .describe("Address type: 'bill' for billing, 'ship' for shipping"),
            })
          )
          .optional()
          .describe("One or more addresses for this contact"),
        notes: z.string().optional().describe("Internal notes about this contact"),
      },
    },
    async (args) => {
      if (!args.company && !args.first_name && !args.last_name) {
        throw new Error(
          "Provide 'company' for a business contact, or 'first_name'/'last_name' for an individual"
        );
      }
      const result = await client.post("/contacts/", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_contact",
    {
      description: "Update fields on an existing contact. Only provided fields are changed (PATCH semantics).",
      inputSchema: {
        id: z.string().describe("The Elorus contact ID to update"),
        company: z.string().optional().describe("Company name"),
        first_name: z.string().optional().describe("First name"),
        last_name: z.string().optional().describe("Last name"),
        is_client: z.boolean().optional().describe("Mark as client"),
        is_supplier: z.boolean().optional().describe("Mark as supplier"),
        vat_number: z.string().optional().describe("VAT / tax registration number"),
        email: z.string().email().optional().describe("Primary email address"),
        phone: z.string().optional().describe("Primary phone number"),
        notes: z.string().optional().describe("Internal notes"),
      },
    },
    async ({ id, ...fields }) => {
      const result = await client.patch(`/contacts/${id}/`, fields);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
