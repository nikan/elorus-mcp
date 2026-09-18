import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerCashReceiptTools } from "../../tools/cash-receipts.js";

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerCashReceiptTools(server, elorusClient);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return client;
}

function mockFetchWith(body: unknown, status = 200) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status,
    statusText: "OK",
    headers: new Headers(),
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

function mockFetchPdf(bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/pdf", "content-length": String(bytes.length) }),
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  });
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

describe("cash receipt tools", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_cash_receipts maps client to contact and GETs /cashreceipts/", async () => {
    const mockFetch = mockFetchWith({ count: 0, results: [] });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_cash_receipts",
      arguments: { client: "client-1", invoice: "inv-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/cashreceipts/");
    expect(parsed.searchParams.get("contact")).toBe("client-1");
    expect(parsed.searchParams.get("invoice")).toBe("inv-1");
  });

  it("record_cash_receipt maps client/invoice to contact/invoice_payments and POSTs to /cashreceipts/", async () => {
    const mockFetch = mockFetchWith({ id: "cr-1" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "record_cash_receipt",
      arguments: {
        client: "client-1",
        date: "2026-07-01",
        amount: "500.00",
        invoice: "inv-1",
      },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/cashreceipts/");
    expect(JSON.parse(options.body as string)).toEqual({
      contact: "client-1",
      date: "2026-07-01",
      amount: "500.00",
      transaction_type: "ip",
      invoice_payments: [{ invoice: "inv-1", amount: "500.00" }],
    });
  });

  it("record_cash_receipt sends an empty invoice_payments array when no invoice is given", async () => {
    const mockFetch = mockFetchWith({ id: "cr-2" }, 201);
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "record_cash_receipt",
      arguments: { client: "client-1", date: "2026-07-01", amount: "500.00" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.invoice_payments).toEqual([]);
    expect(body.contact).toBe("client-1");
  });

  it("export_cash_receipt_pdf GETs the pdf sub-resource and returns a base64 resource blob", async () => {
    const mockFetch = mockFetchPdf();
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "export_cash_receipt_pdf", arguments: { id: "cr-1" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/cashreceipts/cr-1/pdf/");
    const content = result.content as Array<{ type: string; resource: { mimeType: string } }>;
    expect(content[0].type).toBe("resource");
    expect(content[0].resource.mimeType).toBe("application/pdf");
  });
});
