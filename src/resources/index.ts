import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ElorusClient } from "../client.js";

function makeReader(path: string, client: ElorusClient) {
  return async (uri: URL) => {
    const result = await client.get(path, { page_size: 100 });
    return {
      contents: [
        {
          uri: uri.toString(),
          mimeType: "application/json",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  };
}

export function registerResources(server: McpServer, client: ElorusClient): void {
  server.registerResource(
    "contacts",
    "elorus://contacts",
    {
      description: "All contacts (clients and suppliers) in the organization. Returns up to 100 contacts.",
      mimeType: "application/json",
    },
    makeReader("/contacts/", client)
  );

  server.registerResource(
    "invoices",
    "elorus://invoices",
    {
      description: "All sales invoices in the organization. Returns up to 100 invoices ordered by most recent.",
      mimeType: "application/json",
    },
    makeReader("/invoices/", client)
  );

  server.registerResource(
    "cashreceipts",
    "elorus://cashreceipts",
    {
      description: "All cash receipts (payments received from clients). Returns up to 100 records.",
      mimeType: "application/json",
    },
    makeReader("/cashreceipts/", client)
  );

  server.registerResource(
    "cashpayments",
    "elorus://cashpayments",
    {
      description: "All cash payments (payments made to suppliers). Returns up to 100 records.",
      mimeType: "application/json",
    },
    makeReader("/cashpayments/", client)
  );

  server.registerResource(
    "expenses",
    "elorus://expenses",
    {
      description: "All expense records in the organization. Returns up to 100 expenses.",
      mimeType: "application/json",
    },
    makeReader("/expenses/", client)
  );

  server.registerResource(
    "bills",
    "elorus://bills",
    {
      description: "All supplier bills (purchase invoices) in the organization. Returns up to 100 bills.",
      mimeType: "application/json",
    },
    makeReader("/bills/", client)
  );

  server.registerResource(
    "products",
    "elorus://products",
    {
      description: "All products and services in the organization catalog. Returns up to 100 items.",
      mimeType: "application/json",
    },
    makeReader("/products/", client)
  );
}
