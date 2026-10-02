import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ElorusClient } from "../client.js";
import { createFields, updateFields, patchFields, listFields } from "../schemas/estimates.js";
import { registerDocumentTools } from "./document-tools.js";

export function registerEstimateTools(server: McpServer, client: ElorusClient): void {
  registerDocumentTools(server, client, {
    singular: "estimate", plural: "estimates", path: "/estimates/",
    contactField: "client",
    createFields, updateFields, patchFields, listFields, voidable: false,
  });
}
