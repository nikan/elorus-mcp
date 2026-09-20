import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ElorusClient } from "../client.js";
import { createFields, updateFields, patchFields, listFields } from "../schemas/delivery-notes.js";
import { registerDocumentTools } from "./document-tools.js";

export function registerDeliveryNoteTools(server: McpServer, client: ElorusClient): void {
  registerDocumentTools(server, client, {
    singular: "delivery_note", plural: "delivery_notes", path: "/deliverynotes/",
    contactField: "contact",
    createFields, updateFields, patchFields, listFields, voidable: true,
  });
}
