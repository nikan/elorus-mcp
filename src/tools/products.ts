import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

export function registerProductTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_products",
    {
      description:
        "List and search products and services from the catalog. Returns paginated results.",
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
          .describe("Search term to filter by product title, code, or description"),
        ordering: z
          .string()
          .optional()
          .describe("Sort field, e.g. 'title' or '-title' for descending"),
      },
    },
    async ({ page, page_size, search, ordering }) => {
      const result = await client.get("/products/", {
        page,
        page_size,
        search,
        ordering,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_product",
    {
      description: "Fetch a single product or service by its Elorus ID.",
      inputSchema: {
        id: z.string().describe("The Elorus product ID"),
      },
    },
    async ({ id }) => {
      const result = await client.get(`/products/${id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "create_product",
    {
      description:
        "Create a new product or service in the catalog. Monetary values must be strings (e.g. '99.99') to avoid floating-point issues.",
      inputSchema: {
        title: z.string().describe("Product or service name"),
        description: z
          .string()
          .optional()
          .describe("Detailed description of the product or service"),
        code: z
          .string()
          .optional()
          .describe("Product code or SKU for internal reference"),
        sale_price: z
          .string()
          .optional()
          .describe("Default selling price before tax as a string, e.g. '99.99'"),
        purchase_price: z
          .string()
          .optional()
          .describe("Default purchase/cost price before tax as a string, e.g. '60.00'"),
        taxes: z
          .array(z.string())
          .optional()
          .describe(
            "Array of tax IDs to apply by default on this product (obtain IDs via list_taxes)"
          ),
        unit: z
          .string()
          .optional()
          .describe(
            "Unit of measurement ID (obtain from list_units), e.g. hours, pieces, kg"
          ),
        notes: z.string().optional().describe("Internal notes about this product"),
      },
    },
    async (args) => {
      const result = await client.post("/products/", args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_product",
    {
      description:
        "Update fields on an existing product or service. Only provided fields are changed (PATCH semantics); " +
        "the Elorus API only supports PUT on products, so this fetches the current record and merges your fields into it before saving.",
      inputSchema: {
        id: z.string().describe("The Elorus product ID to update"),
        title: z.string().optional().describe("Product or service name"),
        description: z.string().optional().describe("Detailed description"),
        code: z.string().optional().describe("Product code or SKU"),
        sale_price: z.string().optional().describe("Default selling price before tax, e.g. '99.99'"),
        purchase_price: z.string().optional().describe("Default purchase/cost price before tax, e.g. '60.00'"),
        taxes: z.array(z.string()).optional().describe("Array of tax IDs (obtain via list_taxes)"),
        unit: z.string().optional().describe("Unit of measurement ID (obtain from list_units)"),
        notes: z.string().optional().describe("Internal notes"),
      },
    },
    async ({ id, ...fields }) => {
      const result = await client.mergePut(`/products/${id}/`, fields);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
