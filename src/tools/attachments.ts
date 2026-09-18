import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { readAttachmentFile } from "../attachments.js";

/** Maps a public resource_type value to its plural path segment under /v1.2/. All of these pluralize with a trailing 's'. */
const ATTACHMENT_RESOURCE_TYPES = [
  "bill",
  "cashpayment",
  "cashreceipt",
  "contact",
  "creditnote",
  "deliverynote",
  "estimate",
  "expense",
  "invoice",
  "project",
  "suppliercredit",
] as const;

const attachmentResourceTypeSchema = z
  .enum(ATTACHMENT_RESOURCE_TYPES)
  .describe("The type of Elorus resource the attachment is attached to");

export interface AddAttachmentArgs {
  file_path?: string;
  filename?: string;
  content_base64?: string;
  title?: string;
  primary?: boolean;
}

/**
 * Shared upload logic behind both the generic add_attachment tool and the deprecated
 * add_bill_attachment/add_expense_attachment wrappers, so all three stay byte-for-byte
 * consistent instead of drifting copies of the same file_path/content_base64/primary handling.
 */
export async function addAttachment(
  client: ElorusClient,
  resourceType: string,
  resourceId: string,
  { file_path, filename, content_base64, title, primary }: AddAttachmentArgs
): Promise<Record<string, unknown>> {
  let buffer: Buffer;
  let resolvedFilename: string;
  if (file_path) {
    buffer = await readAttachmentFile(file_path);
    resolvedFilename = filename ?? path.basename(file_path);
  } else if (content_base64) {
    if (!filename) {
      throw new Error("filename is required when providing content_base64");
    }
    buffer = Buffer.from(content_base64, "base64");
    resolvedFilename = filename;
  } else {
    throw new Error("Provide either file_path or content_base64");
  }
  const form = new FormData();
  if (title) form.append("title", title);
  form.append("file", new Blob([Uint8Array.from(buffer)]), resolvedFilename);
  const result = await client.postMultipart<{ id: string }>(
    `/${resourceType}s/${resourceId}/attachments/`,
    form
  );
  if (primary) {
    await client.patch(`/${resourceType}s/${resourceId}/attachments/${result.id}/`, { primary: true });
  }
  return { ...result, primary };
}

export function registerAttachmentTools(server: McpServer, client: ElorusClient): void {
  server.registerTool(
    "list_attachments",
    {
      description: "List files attached to an Elorus resource (bill, contact, invoice, etc.).",
      inputSchema: {
        resource_type: attachmentResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource to list attachments for"),
      },
    },
    async ({ resource_type, resource_id }) => {
      const result = await client.get(`/${resource_type}s/${resource_id}/attachments/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "get_attachment",
    {
      description: "Fetch metadata for a single attachment (title, filename, primary flag) by its ID.",
      inputSchema: {
        resource_type: attachmentResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource the attachment is attached to"),
        attachment_id: z.string().describe("The ID of the attachment to fetch"),
      },
    },
    async ({ resource_type, resource_id, attachment_id }) => {
      const result = await client.get(`/${resource_type}s/${resource_id}/attachments/${attachment_id}/`);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "add_attachment",
    {
      description:
        "Attach a file to an Elorus resource (bill, contact, invoice, etc.). Provide EITHER file_path " +
        "(read directly off this machine's local disk, restricted to the directory tree configured via " +
        "the ELORUS_ATTACHMENT_ROOT environment variable) OR content_base64 (raw bytes supplied by the " +
        "caller). Prefer file_path whenever the file already exists on disk under that root: it avoids " +
        "pushing a large base64 string through the calling client. By default the attachment is set as " +
        "the resource's primary receipt/document.",
      inputSchema: {
        resource_type: attachmentResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource to attach the file to"),
        file_path: z
          .string()
          .optional()
          .describe(
            "Absolute path to a file already on this machine's local disk, under the directory " +
              "configured via ELORUS_ATTACHMENT_ROOT. Use this instead of content_base64 whenever the " +
              "file already exists locally."
          ),
        filename: z
          .string()
          .optional()
          .describe(
            "File name including extension, e.g. 'receipt.pdf'. Required when using content_base64; " +
              "inferred from file_path's basename when omitted."
          ),
        content_base64: z
          .string()
          .optional()
          .describe("Base64-encoded file content. Omit this and use file_path when the file already exists on disk."),
        title: z
          .string()
          .optional()
          .describe("Internal title to help identify the attachment (not the file name)"),
        primary: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Whether this attachment should be shown as the resource's primary receipt/document. Default true."
          ),
      },
    },
    async ({ resource_type, resource_id, ...args }) => {
      const result = await addAttachment(client, resource_type, resource_id, args);
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "update_attachment",
    {
      description: "Update an attachment's title or which attachment is the resource's primary document.",
      inputSchema: {
        resource_type: attachmentResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource the attachment is attached to"),
        attachment_id: z.string().describe("The ID of the attachment to update"),
        title: z.string().optional().describe("New internal title for the attachment"),
        primary: z
          .boolean()
          .optional()
          .describe("Set true to mark this attachment as the resource's primary receipt/document"),
      },
    },
    async ({ resource_type, resource_id, attachment_id, ...fields }) => {
      if (fields.title === undefined && fields.primary === undefined) {
        throw new Error("Provide at least one of title or primary to update");
      }
      const result = await client.patch(
        `/${resource_type}s/${resource_id}/attachments/${attachment_id}/`,
        fields
      );
      return {
        content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      };
    }
  );

  server.registerTool(
    "delete_attachment",
    {
      description: "Permanently delete an attachment. This is a hard delete with no undo.",
      inputSchema: {
        resource_type: attachmentResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource the attachment is attached to"),
        attachment_id: z.string().describe("The ID of the attachment to delete"),
      },
    },
    async ({ resource_type, resource_id, attachment_id }) => {
      await client.delete(`/${resource_type}s/${resource_id}/attachments/${attachment_id}/`);
      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ id: attachment_id, deleted: true }, null, 2) },
        ],
      };
    }
  );

  server.registerTool(
    "download_attachment",
    {
      description:
        "Download an attachment's file content. Returns the raw file content directly (base64-encoded); " +
        "content type varies by file (PDF, image, document, etc.), unlike the PDF-only export tools.",
      inputSchema: {
        resource_type: attachmentResourceTypeSchema,
        resource_id: z.string().describe("The ID of the resource the attachment is attached to"),
        attachment_id: z.string().describe("The ID of the attachment to download"),
      },
    },
    async ({ resource_type, resource_id, attachment_id }) => {
      const { data, contentType } = await client.getBinary(
        `/${resource_type}s/${resource_id}/attachments/${attachment_id}/file/`,
        null
      );
      return {
        content: [
          {
            type: "resource" as const,
            resource: {
              uri: `elorus://${resource_type}s/${resource_id}/attachments/${attachment_id}/file`,
              mimeType: contentType,
              blob: data.toString("base64"),
            },
          },
        ],
      };
    }
  );
}
