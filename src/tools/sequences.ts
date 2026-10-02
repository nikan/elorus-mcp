import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ElorusClient } from "../client.js";
import { elorusId } from "../schemas/id.js";

const sequenceName = z.string().min(1).max(10);
const result = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] });

/** Sequence actions address names in JSON bodies, never IDs in detail URLs. */
export function registerSequenceTools(server: McpServer, client: ElorusClient): void {
  for (const documentType of [false, true]) {
    const name = documentType ? "document_type_sequence" : "goods_receipt_sequence";
    const parentFields: z.ZodRawShape = documentType
      ? { document_type_id: elorusId("Document type ID") } : {};
    const path = (id: unknown) => documentType ? `/documenttypes/${id}/sequences/` : "/goodsreceiptsequences/";

    server.registerTool(`list_${name}s`, {
      description: `List ${name.replaceAll("_", " ")}s.`,
      inputSchema: { ...parentFields, active: z.enum(["0", "1"]).optional().describe("1 for active, 0 for archived sequences") },
    }, async ({ document_type_id, active }: Record<string, string | undefined>) => result(await client.get(path(document_type_id), { active })));

    server.registerTool(`create_${name}`, {
      description: "Create a numbering sequence with a name of at most 10 characters.",
      inputSchema: { ...parentFields, name: sequenceName.describe("New sequence name") },
    }, async ({ document_type_id, name }: Record<string, string | undefined>) => result(await client.post(path(document_type_id), { name })));

    server.registerTool(`delete_${name}`, {
      description: "Delete a numbering sequence by name.",
      inputSchema: { ...parentFields, name: sequenceName.describe("Sequence name to delete") },
    }, async ({ document_type_id, name }: Record<string, string | undefined>) => {
      await client.delete(`${path(document_type_id)}delete/`, { name });
      return result({ name, deleted: true });
    });

    server.registerTool(`rename_${name}`, {
      description: "Rename a numbering sequence.",
      inputSchema: {
        ...parentFields,
        old_name: sequenceName.describe("Current sequence name"),
        new_name: sequenceName.describe("New sequence name"),
      },
    }, async ({ document_type_id, old_name, new_name }: Record<string, string | undefined>) => result(
      await client.put(`${path(document_type_id)}rename/`, { old_name, new_name })
    ));
  }
}
