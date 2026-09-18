import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

/** Maps a public resource_type value to its plural path segment under /v1.2/. All of these pluralize with a trailing 's'. */
const SENT_EMAIL_RESOURCE_TYPES = [
  "bill",
  "creditnote",
  "deliverynote",
  "estimate",
  "goodsreceipt",
  "invoice",
  "suppliercredit",
] as const;

const sentEmailResourceTypeSchema = z
  .enum(SENT_EMAIL_RESOURCE_TYPES)
  .describe("The type of Elorus resource to check the sent-email log for");

export function registerSentEmailTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_sent_emails",
    {
      description:
        "List the log of emails Elorus has sent for a resource (e.g. invoice, bill, credit note), " +
        "including recipient, subject, and send timestamp.",
      inputSchema: {
        resource_type: sentEmailResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource to fetch the sent-email log for"),
      },
    },
    async ({ resource_type, resource_id }) => {
      const result = await client.get(`/${resource_type}s/${resource_id}/sent-email-messages/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
