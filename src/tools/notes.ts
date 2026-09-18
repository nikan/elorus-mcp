import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

/** Maps a public resource_type value to its plural path segment under /v1.2/. All of these pluralize with a trailing 's'. */
const NOTE_RESOURCE_TYPES = [
  "invoice",
  "contact",
  "cashreceipt",
  "cashpayment",
  "expense",
  "bill",
  "creditnote",
  "suppliercredit",
] as const;

const DISCUSSION_RESOURCE_TYPES = ["invoice", "creditnote"] as const;

const noteResourceTypeSchema = z
  .enum(NOTE_RESOURCE_TYPES)
  .describe("The type of Elorus resource the note is attached to");

const discussionResourceTypeSchema = z
  .enum(DISCUSSION_RESOURCE_TYPES)
  .describe("The type of Elorus resource the discussion is attached to");

export function registerNoteTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_private_notes",
    {
      description:
        "List internal (private) notes attached to an Elorus resource (invoice, contact, payment, etc.). " +
        "Notes are visible only to organization members.",
      inputSchema: {
        resource_type: noteResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource to fetch notes for"),
      },
    },
    async ({ resource_type, resource_id }) => {
      const result = await client.get(`/${resource_type}s/${resource_id}/notes/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "create_private_note",
    {
      description:
        "Add an internal (private) note to an Elorus resource. Notes are visible only to organization members, not to clients.",
      inputSchema: {
        resource_type: noteResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource to attach the note to"),
        body: z.string().describe("The note content"),
      },
    },
    async ({ resource_type, resource_id, body }) => {
      const result = await client.post(`/${resource_type}s/${resource_id}/notes/`, { notes: body });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "list_client_discussions",
    {
      description:
        "List client-visible discussion messages attached to an Elorus resource. These are visible to both the organization and the client. " +
        "Only invoices and credit notes support discussions.",
      inputSchema: {
        resource_type: discussionResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource to fetch discussions for"),
      },
    },
    async ({ resource_type, resource_id }) => {
      const result = await client.get(`/${resource_type}s/${resource_id}/discussions/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "create_client_discussion",
    {
      description:
        "Post a client-visible message on an Elorus resource (invoice or credit note). The client can see this message in their client portal.",
      inputSchema: {
        resource_type: discussionResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource to attach the discussion to"),
        body: z.string().describe("The discussion message content"),
      },
    },
    async ({ resource_type, resource_id, body }) => {
      const result = await client.post(`/${resource_type}s/${resource_id}/discussions/`, { message: body });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
