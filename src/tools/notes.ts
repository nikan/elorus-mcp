import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";

const resourceTypeSchema = z
  .enum(["invoice", "contact", "cashreceipt", "cashpayment", "expense", "bill", "creditnote", "suppliercredit"])
  .describe("The type of Elorus resource the note is attached to");

export function registerNoteTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_private_notes",
    {
      description:
        "List internal (private) notes attached to an Elorus resource (invoice, contact, payment, etc.). Notes are visible only to organization members.",
      inputSchema: {
        resource_type: resourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource to fetch notes for"),
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
    async ({ resource_type, resource_id, page, page_size }) => {
      const result = await client.get("/privatenotes/", {
        content_type: resource_type,
        object_id: resource_id,
        page,
        page_size,
      });
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
        resource_type: resourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource to attach the note to"),
        title: z.string().optional().describe("Short title or subject for the note"),
        body: z.string().describe("The note content"),
      },
    },
    async ({ resource_type, resource_id, title, body }) => {
      const result = await client.post("/privatenotes/", {
        content_type: resource_type,
        object_id: resource_id,
        title,
        body,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "list_client_discussions",
    {
      description:
        "List client-visible discussion messages attached to an Elorus resource. These are visible to both the organization and the client.",
      inputSchema: {
        resource_type: z
          .enum(["invoice", "cashreceipt"])
          .describe("The type of Elorus resource the discussion is attached to"),
        resource_id: z.string().describe("The ID of the resource to fetch discussions for"),
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
    async ({ resource_type, resource_id, page, page_size }) => {
      const result = await client.get("/clientdiscussions/", {
        content_type: resource_type,
        object_id: resource_id,
        page,
        page_size,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "create_client_discussion",
    {
      description:
        "Post a client-visible message on an Elorus resource (invoice or cash receipt). The client can see this message in their client portal.",
      inputSchema: {
        resource_type: z
          .enum(["invoice", "cashreceipt"])
          .describe("The type of Elorus resource to post the discussion on"),
        resource_id: z.string().describe("The ID of the resource to attach the discussion to"),
        body: z.string().describe("The discussion message content"),
      },
    },
    async ({ resource_type, resource_id, body }) => {
      const result = await client.post("/clientdiscussions/", {
        content_type: resource_type,
        object_id: resource_id,
        body,
      });
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
