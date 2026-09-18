import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

/** Maps a public resource_type value to its plural path segment under /v1.2/. All of these pluralize with a trailing 's'. */
const NOTE_RESOURCE_TYPES = [
  "bill",
  "cashpayment",
  "cashreceipt",
  "contact",
  "creditnote",
  "deliverynote",
  "estimate",
  "expense",
  "goodsreceipt",
  "invoice",
  "product",
  "project",
  "recurringinvoice",
  "suppliercredit",
] as const;

const DISCUSSION_RESOURCE_TYPES = ["creditnote", "estimate", "invoice", "project"] as const;

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
    "update_private_note",
    {
      description: "Update the content of an existing internal (private) note.",
      inputSchema: {
        resource_type: noteResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource the note is attached to"),
        note_id: z.string().describe("The ID of the note to update"),
        body: z.string().describe("The new note content"),
      },
    },
    async ({ resource_type, resource_id, note_id, body }) => {
      const result = await client.put(`/${resource_type}s/${resource_id}/notes/${note_id}/`, {
        notes: body,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "delete_private_note",
    {
      description: "Permanently delete an internal (private) note. This is a hard delete with no undo.",
      inputSchema: {
        resource_type: noteResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource the note is attached to"),
        note_id: z.string().describe("The ID of the note to delete"),
      },
    },
    async ({ resource_type, resource_id, note_id }) => {
      await client.delete(`/${resource_type}s/${resource_id}/notes/${note_id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ id: note_id, deleted: true }, null, 2) }],
      };
    }
  );

  server.registerTool(
    "list_client_discussions",
    {
      description:
        "List client-visible discussion messages attached to an Elorus resource. These are visible to both the organization and the client. " +
        "Only credit notes, estimates, invoices, and projects support discussions.",
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
        "Post a client-visible message on an Elorus resource (credit note, estimate, invoice, or project). " +
        "The client can see this message in their client portal.",
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

  server.registerTool(
    "update_client_discussion",
    {
      description: "Update the content of an existing client-visible discussion message.",
      inputSchema: {
        resource_type: discussionResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource the discussion is attached to"),
        discussion_id: z.string().describe("The ID of the discussion message to update"),
        body: z.string().describe("The new discussion message content"),
      },
    },
    async ({ resource_type, resource_id, discussion_id, body }) => {
      const result = await client.put(`/${resource_type}s/${resource_id}/discussions/${discussion_id}/`, {
        message: body,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "delete_client_discussion",
    {
      description:
        "Permanently delete a client-visible discussion message. This is a hard delete with no undo.",
      inputSchema: {
        resource_type: discussionResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource the discussion is attached to"),
        discussion_id: z.string().describe("The ID of the discussion message to delete"),
      },
    },
    async ({ resource_type, resource_id, discussion_id }) => {
      await client.delete(`/${resource_type}s/${resource_id}/discussions/${discussion_id}/`);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ id: discussion_id, deleted: true }, null, 2) },
        ],
      };
    }
  );
}
