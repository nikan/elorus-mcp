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

function mockFetchSequence(responses: unknown[]) {
  const mockFetch = vi.fn();
  for (const body of responses) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: () => Promise.resolve(body),
    });
  }
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

  it("create_invoice converts due_date to due_days and notes to public_notes", async () => {
    const mockFetch = mockFetchWith({ id: "inv-3" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_invoice",
      arguments: {
        client: "client-1",
        date: "2026-07-01",
        documenttype: "doctype-1",
        due_date: "2026-07-15",
        notes: "Thanks for your business",
        items: [{ title: "Consulting", quantity: "5", unit_value: "100.00" }],
      },
    });

    expect(result.isError).toBeFalsy();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.due_days).toBe(14);
    expect(body.public_notes).toBe("Thanks for your business");
    expect(body.due_date).toBeUndefined();
    expect(body.notes).toBeUndefined();
  });

  it("create_invoice rejects a due_date before the invoice date without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_invoice",
      arguments: {
        client: "client-1",
        date: "2026-07-15",
        documenttype: "doctype-1",
        due_date: "2026-07-01",
        items: [{ title: "Consulting", quantity: "1", unit_value: "100.00" }],
      },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("void_invoice PUTs {void: true} to the void sub-resource", async () => {
    const mockFetch = mockFetchWith({ id: "inv-1", status: "void" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "void_invoice", arguments: { id: "inv-1" } });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/void/");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ void: true });
  });

  it("send_invoice_email GETs defaults then POSTs merged to/cc/bcc/subject/message/attach_pdf", async () => {
    const mockFetch = mockFetchSequence([
      {
        to: "default@example.com",
        cc: "accounting@example.com, sales@example.com",
        bcc: "",
        subject: "Default subject",
        message: "Default message",
      },
      { sent: true },
    ]);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "send_invoice_email",
      arguments: { id: "inv-1", subject: "Your invoice" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [getUrl] = mockFetch.mock.calls[0] as [string];
    expect(getUrl).toBe("https://api.elorus.com/v1.2/invoices/inv-1/email/");
    const [postUrl, options] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toBe("https://api.elorus.com/v1.2/invoices/inv-1/email/");
    expect(JSON.parse(options.body as string)).toEqual({
      to: "default@example.com",
      subject: "Your invoice",
      message: "Default message",
      cc: ["accounting@example.com", "sales@example.com"],
      bcc: [],
      attach_pdf: true,
    });
  });

  it("export_invoice_pdf GETs the pdf sub-resource and returns a base64 resource blob", async () => {
    const mockFetch = mockFetchPdf();
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "export_invoice_pdf", arguments: { id: "inv-1" } });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/pdf/");
    expect((options.headers as Record<string, string>).Accept).toBe("application/pdf");
    const content = result.content as Array<{ type: string; resource: { mimeType: string; blob: string } }>;
    expect(content[0].type).toBe("resource");
    expect(content[0].resource.mimeType).toBe("application/pdf");
    expect(Buffer.from(content[0].resource.blob, "base64").toString("utf-8")).toBe("%PDF");
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

  it("update_invoice PATCHes directly when only PATCH-safe fields are given", async () => {
    const mockFetch = mockFetchWith({ id: "inv-1", custom_id: "PO-9" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_invoice",
      arguments: { id: "inv-1", custom_id: "PO-9", draft: false },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({ custom_id: "PO-9", draft: false });
  });

  it("update_invoice uses GET-then-PUT for date when the invoice is a draft", async () => {
    const current = { id: "inv-1", draft: true, date: "2026-07-01", client: "client-1" };
    const mockFetch = mockFetchSequence([current, { ...current, date: "2026-07-05" }]);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_invoice",
      arguments: { id: "inv-1", date: "2026-07-05" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ date: "2026-07-05" });
  });

  it("update_invoice converts due_date to due_days and notes to public_notes on the draft-only path", async () => {
    const current = { id: "inv-1", draft: true, date: "2026-07-01" };
    const mockFetch = mockFetchSequence([current, { ...current }]);
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "update_invoice",
      arguments: { id: "inv-1", due_date: "2026-07-15", notes: "Updated notes" },
    });

    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(putOptions.body as string);
    expect(body.due_days).toBe(14);
    expect(body.public_notes).toBe("Updated notes");
    expect(body.due_date).toBeUndefined();
    expect(body.notes).toBeUndefined();
  });

  it("update_invoice rejects a draft-only field (e.g. date) when the invoice is not a draft, without PUTting", async () => {
    const current = { id: "inv-1", draft: false, date: "2026-07-01" };
    const mockFetch = mockFetchSequence([current]);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_invoice",
      arguments: { id: "inv-1", date: "2026-07-05" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1]?.method).toBeUndefined();
  });

  it("update_invoice rejects an items line missing unit_value under calculator_mode 'initial' without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_invoice",
      arguments: { id: "inv-1", items: [{ title: "Consulting", quantity: "1" }] },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("delete_invoice DELETEs /invoices/{id}/", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "delete_invoice", arguments: { id: "inv-1" } });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/");
    expect(options.method).toBe("DELETE");
  });
});
