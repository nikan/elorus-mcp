import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

export function registerConfigTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_taxes",
    {
      description:
        "List all tax rates configured in this organization. Returns tax IDs and rates needed when creating invoices, products, and expenses.",
      inputSchema: {
        page: z.number().int().min(1).optional().describe("Page number (default: 1)"),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Results per page (default: 20, max: 100)"),
      },
    },
    async ({ page, page_size }) => {
      const result = await client.get("/taxes/", { page, page_size });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "list_document_types",
    {
      description:
        "List all document types available in this organization. Returns document type IDs and names required when creating invoices, bills, and other documents.",
      inputSchema: {
        page: z.number().int().min(1).optional().describe("Page number (default: 1)"),
        page_size: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe("Results per page (default: 20, max: 100)"),
      },
    },
    async ({ page, page_size }) => {
      const result = await client.get("/documenttypes/", { page, page_size });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
