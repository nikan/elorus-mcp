import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ElorusClient } from "../client.js";
import { createFields, updateFields, patchFields, listFields } from "../schemas/goods-receipts.js";
import { registerDocumentTools } from "./document-tools.js";

export function registerGoodsReceiptTools(server: McpServer, client: ElorusClient): void {
  registerDocumentTools(server, client, {
    singular: "goods_receipt", plural: "goods_receipts", path: "/goodsreceipts/",
    contactField: "supplier",
    createFields, updateFields, patchFields, listFields, voidable: true,
  });
}
