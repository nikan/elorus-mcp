import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

/**
 * Maps a public resource_type value to its plural path segment under /v1.2/. All of these
 * pluralize with a trailing 's'. Generalized rather than registered per-resource (as
 * apply_credit_note/apply_supplier_credit are) because list/unapply are structurally identical
 * across the three types and MCP tool names share one server-wide namespace — registering
 * e.g. list_applied_credit separately in both credit-notes.ts and supplier-credits.ts would
 * collide.
 */
const APPLIED_CREDIT_RESOURCE_TYPES = ["invoice", "creditnote", "suppliercredit"] as const;

const appliedCreditResourceTypeSchema = z
  .enum(APPLIED_CREDIT_RESOURCE_TYPES)
  .describe("The type of Elorus resource credit has been applied against");

export function registerAppliedCreditTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_applied_credit",
    {
      description:
        "List credit applications against an invoice, credit note, or supplier credit — the amounts " +
        "and source documents of any credit notes/supplier credits applied to reduce its balance.",
      inputSchema: {
        resource_type: appliedCreditResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource to list applied credit for"),
      },
    },
    async ({ resource_type, resource_id }) => {
      const result = await client.get(`/${resource_type}s/${resource_id}/applied-credit/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "unapply_credit",
    {
      description:
        "Remove a previously applied credit, restoring that amount to both the credit note/supplier " +
        "credit's remaining balance and the target document's amount owed.",
      inputSchema: {
        resource_type: appliedCreditResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource the credit was applied to"),
        applied_credit_id: z.string().describe("The ID of the applied-credit record to remove"),
      },
    },
    async ({ resource_type, resource_id, applied_credit_id }) => {
      await client.delete(`/${resource_type}s/${resource_id}/applied-credit/${applied_credit_id}/`);
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ id: applied_credit_id, unapplied: true }, null, 2),
          },
        ],
      };
    }
  );
}
