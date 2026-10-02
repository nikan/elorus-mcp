import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerBillTools } from "../../tools/bills.js";

/**
 * create_bill and add_bill_attachment already have dedicated coverage
 * elsewhere (tool-schemas.test.ts). This file covers the rest of the
 * bill tools' handler paths: list, get, void, and both branches of
 * update_bill (plain PATCH vs the reference/mergePut path).
 */

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerBillTools(server, elorusClient);

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

describe("bill tools (list/get/void/update)", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_bills GETs /bills/ with supplier and status filters", async () => {
    const mockFetch = mockFetchWith({ count: 0, results: [] });
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "list_bills",
      arguments: { supplier: "sup-1", status: "overdue" },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/bills/");
    expect(parsed.searchParams.get("supplier")).toBe("sup-1");
    expect(parsed.searchParams.get("status")).toBe("overdue");
  });

  it("get_bill fetches a single bill by id", async () => {
    const mockFetch = mockFetchWith({ id: "2001" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "get_bill", arguments: { id: "2001" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/bills/2001/");
  });

  it("void_bill PUTs {void: true} to the void sub-resource", async () => {
    const mockFetch = mockFetchWith({ id: "2001", status: "void" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "void_bill", arguments: { id: "2001" } });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/bills/2001/void/");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ void: true });
  });

  it("create_bill POSTs items with title remapped to description", async () => {
    const mockFetch = mockFetchWith({ id: "2001" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_bill",
      arguments: {
        supplier: "sup-1",
        date: "2026-07-01",
        items: [
          { title: "Hosting", quantity: "1", unit_value: "50.00", expense_category: "7001" },
        ],
      },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/bills/");
    const body = JSON.parse(options.body as string);
    expect(body.items).toEqual([
      { description: "Hosting", quantity: "1", unit_value: "50.00", expense_category: "7001" },
    ]);
  });

  it("create_bill rejects a line item missing unit_value under calculator_mode 'initial' without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_bill",
      arguments: {
        supplier: "sup-1",
        date: "2026-07-01",
        items: [{ title: "Hosting", quantity: "1", expense_category: "7001" }],
      },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("create_bill rejects a line item with both unit_value and unit_total, without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_bill",
      arguments: {
        supplier: "sup-1",
        date: "2026-07-01",
        items: [
          {
            title: "Hosting",
            quantity: "1",
            unit_value: "50.00",
            unit_total: "62.00",
            expense_category: "7001",
          },
        ],
      },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("update_bill PATCHes directly when reference is not provided", async () => {
    const mockFetch = mockFetchWith({ id: "2001", draft: false });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_bill",
      arguments: { id: "2001", draft: false },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/bills/2001/");
    expect(options.method).toBe("PATCH");
  });

  it("update_bill uses mergePut (GET then PUT) when reference is provided", async () => {
    const current = { id: "2001", date: "2026-07-01", reference: "" };
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: () => Promise.resolve(current),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: () => Promise.resolve({ ...current, reference: "PO-123" }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_bill",
      arguments: { id: "2001", reference: "PO-123" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ reference: "PO-123" });
  });

  function mockGetThenPut(current: unknown) {
    const res = (body: unknown) => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: () => Promise.resolve(body),
    });
    const mockFetch = vi.fn().mockResolvedValueOnce(res(current)).mockResolvedValueOnce(res(current));
    vi.stubGlobal("fetch", mockFetch);
    return mockFetch;
  }

  it("update_bill with items PUTs the merged record, keeping line ids and remapping title to description", async () => {
    const mockFetch = mockGetThenPut({ id: "2001", date: "2026-07-01", calculator_mode: "initial", items: [] });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_bill",
      arguments: {
        id: "2001",
        items: [
          { id: "55", title: "Hosting", quantity: "1", unit_value: "60.00", expense_category: "7001" },
          { title: "Domain", quantity: "1", unit_value: "12.00", expense_category: "7001" },
        ],
      },
    });

    expect(result.isError).toBeFalsy();
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    const body = JSON.parse(putOptions.body as string);
    expect(body.calculator_mode).toBe("initial");
    expect(body.items).toEqual([
      { id: "55", description: "Hosting", quantity: "1", unit_value: "60.00", expense_category: "7001" },
      { description: "Domain", quantity: "1", unit_value: "12.00", expense_category: "7001" },
    ]);
  });

  it("update_bill with expense_category rewrites the category on every existing line", async () => {
    const mockFetch = mockGetThenPut({
      id: "2001",
      items: [
        { id: "55", description: "A", quantity: "1", unit_value: "10.00", expense_category: "1" },
        { id: "56", description: "B", quantity: "2", unit_value: "5.00", expense_category: "2" },
      ],
    });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_bill",
      arguments: { id: "2001", expense_category: "9" },
    });

    expect(result.isError).toBeFalsy();
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(putOptions.body as string);
    expect(body.items.map((i: { id: string; expense_category: string }) => [i.id, i.expense_category])).toEqual([
      ["55", "9"],
      ["56", "9"],
    ]);
  });

  it("update_bill rejects items together with expense_category without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_bill",
      arguments: {
        id: "2001",
        expense_category: "9",
        items: [{ title: "A", quantity: "1", unit_value: "1.00", expense_category: "9" }],
      },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("delete_bill DELETEs /bills/{id}/", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "delete_bill", arguments: { id: "2001" } });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/bills/2001/");
    expect(options.method).toBe("DELETE");
  });

  it("send_bill_email GETs defaults then POSTs merged to/cc/bcc/subject/message/attach_pdf", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            to: "supplier@example.com",
            cc: "",
            bcc: "",
            subject: "Default subject",
            message: "Default message",
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: () => Promise.resolve({ sent: true }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "send_bill_email",
      arguments: { id: "2001", subject: "Your bill" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [getUrl] = mockFetch.mock.calls[0] as [string];
    expect(getUrl).toBe("https://api.elorus.com/v1.2/bills/2001/email/");
    const [postUrl, options] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toBe("https://api.elorus.com/v1.2/bills/2001/email/");
    expect(JSON.parse(options.body as string)).toEqual({
      to: "supplier@example.com",
      subject: "Your bill",
      message: "Default message",
      cc: [],
      bcc: [],
      attach_pdf: true,
    });
  });

  it("export_bill_pdf GETs the pdf sub-resource and returns a base64 resource blob", async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "application/pdf", "content-length": String(bytes.length) }),
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "export_bill_pdf", arguments: { id: "2001" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/bills/2001/pdf/");
    const content = result.content as Array<{ type: string; resource: { mimeType: string } }>;
    expect(content[0].resource.mimeType).toBe("application/pdf");
  });
});
