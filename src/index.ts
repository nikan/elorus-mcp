#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getConfig } from "./auth.js";
import { ElorusClient } from "./client.js";
import { registerContactTools } from "./tools/contacts.js";
import { registerInvoiceTools } from "./tools/invoices.js";
import { registerProductTools } from "./tools/products.js";
import { registerConfigTools } from "./tools/config.js";
import { registerCashReceiptTools } from "./tools/cash-receipts.js";
import { registerCashPaymentTools } from "./tools/cash-payments.js";
import { registerCreditNoteTools } from "./tools/credit-notes.js";
import { registerSupplierCreditTools } from "./tools/supplier-credits.js";
import { registerExpenseTools } from "./tools/expenses.js";
import { registerBillTools } from "./tools/bills.js";
import { registerNoteTools } from "./tools/notes.js";
import { registerResources } from "./resources/index.js";

const config = getConfig();
const client = new ElorusClient(config.apiKey, config.orgId, config.demo);

const server = new McpServer({
  name: "elorus-mcp",
  version: "0.2.0",
});

// Tools
registerContactTools(server, client);
registerInvoiceTools(server, client);
registerProductTools(server, client);
registerConfigTools(server, client);
registerCashReceiptTools(server, client);
registerCashPaymentTools(server, client);
registerCreditNoteTools(server, client);
registerSupplierCreditTools(server, client);
registerExpenseTools(server, client);
registerBillTools(server, client);
registerNoteTools(server, client);

// Resources
registerResources(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
