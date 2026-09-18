import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerInvoiceTools } from "../../tools/invoices.js";

/**
 * invoices.test.ts already exercises the ElorusClient layer directly for
 * list/get/void/create. This file drives the same tools through the real
 * MCP tool-call path (registerInvoiceTools + callTool) to cover the handler
 * bodies themselves, plus the tools that file doesn't touch at all:
 * send_invoice_email and export_invoice_pdf.
 */

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerInvoiceTools(server, elorusClient);

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

describe("invoice tools (handler-level)", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_invoices GETs /invoices/ with client and status filters", async () => {
    const mockFetch = mockFetchWith({ count: 0, results: [] });
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "list_invoices",
      arguments: { client: "client-1", status: "sent" },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/invoices/");
    expect(parsed.searchParams.get("client")).toBe("client-1");
    expect(parsed.searchParams.get("status")).toBe("sent");
  });

  it("get_invoice fetches a single invoice by id", async () => {
    const mockFetch = mockFetchWith({ id: "inv-1", status: "sent" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "get_invoice", arguments: { id: "inv-1" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/");
  });

  it("create_invoice POSTs a valid invoice", async () => {
    const mockFetch = mockFetchWith({ id: "inv-2" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_invoice",
      arguments: {
        client: "client-1",
        date: "2026-07-01",
        documenttype: "doctype-1",
        items: [{ title: "Consulting", quantity: "5", unit_value: "100.00" }],
      },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/");
    expect(JSON.parse(options.body as string)).toMatchObject({ client: "client-1" });
  });

  it("void_invoice POSTs to the void sub-resource", async () => {
    const mockFetch = mockFetchWith({ id: "inv-1", status: "void" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "void_invoice", arguments: { id: "inv-1" } });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/void/");
    expect(options.method).toBe("POST");
  });

  it("send_invoice_email POSTs recipients/subject/message/cc to the sendmail sub-resource", async () => {
    const mockFetch = mockFetchWith({ sent: true });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "send_invoice_email",
      arguments: {
        id: "inv-1",
        to: ["client@example.com"],
        subject: "Your invoice",
        cc: ["accounting@example.com"],
      },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/sendmail/");
    expect(JSON.parse(options.body as string)).toEqual({
      to: ["client@example.com"],
      subject: "Your invoice",
      cc: ["accounting@example.com"],
    });
  });

  it("export_invoice_pdf GETs the pdf sub-resource", async () => {
    const mockFetch = mockFetchWith({ url: "https://files.elorus.com/invoice.pdf" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "export_invoice_pdf", arguments: { id: "inv-1" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/pdf/");
  });

  it("create_invoice rejects a line item missing unit_value under calculator_mode 'initial' without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_invoice",
      arguments: {
        client: "client-1",
        date: "2026-07-01",
        documenttype: "doctype-1",
        items: [{ title: "Consulting", quantity: "1" }],
      },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
