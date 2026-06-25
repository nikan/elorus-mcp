#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig } from "./auth.js";
import { ElorusClient } from "./client.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerProductTools } from "./tools/products.js";
import { registerConfigTools } from "./tools/config.js";

const config = getConfig();
const client = new ElorusClient(config.apiKey, config.orgId);

const server = new McpServer({
  name: "elorus-mcp",
  version: "0.1.0",
});

registerContactTools(server, client);
registerInvoiceTools(server, client);
registerProductTools(server, client);
registerConfigTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
