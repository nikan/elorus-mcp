import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerSupplierCreditTools } from "../../tools/supplier-credits.js";

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerSupplierCreditTools(server, elorusClient);

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

describe("supplier credit tools (list/apply)", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_supplier_credits GETs /suppliercredits/ with supplier and date filters", async () => {
    const mockFetch = mockFetchWith({ count: 0, results: [] });
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "list_supplier_credits",
      arguments: { supplier: "sup-1", date_after: "2026-01-01" },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/suppliercredits/");
    expect(parsed.searchParams.get("supplier")).toBe("sup-1");
    expect(parsed.searchParams.get("date_after")).toBe("2026-01-01");
  });

  it("create_supplier_credit POSTs a valid supplier credit", async () => {
    const mockFetch = mockFetchWith({ id: "sc-1" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_supplier_credit",
      arguments: {
        supplier: "sup-1",
        date: "2026-07-01",
        documenttype: "doctype-1",
        items: [{ title: "Refund", quantity: "1", unit_value: "50.00" }],
      },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/suppliercredits/");
    expect(JSON.parse(options.body as string)).toMatchObject({ supplier: "sup-1" });
  });

  it("create_supplier_credit maps notes to public_notes", async () => {
    const mockFetch = mockFetchWith({ id: "sc-2" }, 201);
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "create_supplier_credit",
      arguments: {
        supplier: "sup-1",
        date: "2026-07-01",
        documenttype: "doctype-1",
        notes: "Price correction",
        items: [{ title: "Refund", quantity: "1", unit_value: "50.00" }],
      },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.public_notes).toBe("Price correction");
    expect(body.notes).toBeUndefined();
  });

  it("create_supplier_credit rejects a line item missing unit_value under calculator_mode 'initial' without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_supplier_credit",
      arguments: {
        supplier: "sup-1",
        date: "2026-07-01",
        documenttype: "doctype-1",
        items: [{ title: "Refund", quantity: "1" }],
      },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("apply_supplier_credit POSTs purchase/amount to the applied-credit sub-resource", async () => {
    const mockFetch = mockFetchWith({ applied: true });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "apply_supplier_credit",
      arguments: { id: "sc-1", bill: "bill-1", amount: "100.00" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/suppliercredits/sc-1/applied-credit/");
    expect(JSON.parse(options.body as string)).toEqual([{ purchase: "bill-1", amount: "100.00" }]);
  });

  it("get_supplier_credit fetches a single supplier credit by id", async () => {
    const mockFetch = mockFetchWith({ id: "sc-1" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "get_supplier_credit", arguments: { id: "sc-1" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/suppliercredits/sc-1/");
  });

  it("update_supplier_credit PATCHes directly when only PATCH-safe fields are given", async () => {
    const mockFetch = mockFetchWith({ id: "sc-1", draft: false });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_supplier_credit",
      arguments: { id: "sc-1", draft: false },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/suppliercredits/sc-1/");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({ draft: false });
  });

  it("update_supplier_credit uses GET-then-PUT for reference when the supplier credit is a draft", async () => {
    const current = { id: "sc-1", draft: true, date: "2026-07-01", reference: "" };
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
      name: "update_supplier_credit",
      arguments: { id: "sc-1", reference: "PO-123" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ reference: "PO-123" });
  });

  it("update_supplier_credit rejects a draft-only field (e.g. reference) when not a draft, without PUTting", async () => {
    const current = { id: "sc-1", draft: false, date: "2026-07-01" };
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: () => Promise.resolve(current),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_supplier_credit",
      arguments: { id: "sc-1", reference: "PO-123" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("update_supplier_credit rejects calculator_mode alone when not a draft, without an empty PATCH", async () => {
    const current = { id: "sc-1", draft: false, date: "2026-07-01" };
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: () => Promise.resolve(current),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_supplier_credit",
      arguments: { id: "sc-1", calculator_mode: "total" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1]?.method).toBeUndefined();
  });

  it("update_supplier_credit sends items with description (not title) and expense_category, preserving id", async () => {
    const current = { id: "sc-1", draft: true, date: "2026-07-01" };
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
        json: () => Promise.resolve(current),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_supplier_credit",
      arguments: {
        id: "sc-1",
        items: [
          {
            id: "line-1",
            title: "Refund",
            quantity: "1",
            unit_value: "50.00",
            expense_category: "cat-1",
          },
        ],
      },
    });

    expect(result.isError).toBeFalsy();
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(putOptions.body as string);
    expect(body.items).toEqual([
      {
        id: "line-1",
        description: "Refund",
        quantity: "1",
        unit_value: "50.00",
        expense_category: "cat-1",
      },
    ]);
    expect(body.items[0].title).toBeUndefined();
  });

  it("update_supplier_credit persists calculator_mode on the draft-only PUT path", async () => {
    const current = { id: "sc-1", draft: true, date: "2026-07-01", calculator_mode: "initial" };
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
        json: () => Promise.resolve({ ...current, calculator_mode: "total" }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_supplier_credit",
      arguments: { id: "sc-1", calculator_mode: "total" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    const body = JSON.parse(putOptions.body as string);
    expect(body.calculator_mode).toBe("total");
  });

  it("update_supplier_credit validates unit_total items against the document's current calculator_mode when the argument is omitted", async () => {
    const current = { id: "sc-1", draft: true, date: "2026-07-01", calculator_mode: "total" };
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
        json: () => Promise.resolve(current),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_supplier_credit",
      arguments: {
        id: "sc-1",
        items: [{ title: "Refund", quantity: "1", unit_total: "62.00", expense_category: "cat-1" }],
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    const body = JSON.parse(putOptions.body as string);
    expect(body.items).toEqual([
      { description: "Refund", quantity: "1", unit_total: "62.00", expense_category: "cat-1" },
    ]);
    expect(body.calculator_mode).toBe("total");
  });

  it("delete_supplier_credit DELETEs /suppliercredits/{id}/", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "delete_supplier_credit", arguments: { id: "sc-1" } });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/suppliercredits/sc-1/");
    expect(options.method).toBe("DELETE");
  });

  it("void_supplier_credit PUTs {void: true} to the void sub-resource", async () => {
    const mockFetch = mockFetchWith({ id: "sc-1", status: "void" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "void_supplier_credit", arguments: { id: "sc-1" } });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/suppliercredits/sc-1/void/");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ void: true });
  });

  it("send_supplier_credit_email GETs defaults then POSTs merged fields", async () => {
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
      name: "send_supplier_credit_email",
      arguments: { id: "sc-1" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [getUrl] = mockFetch.mock.calls[0] as [string];
    expect(getUrl).toBe("https://api.elorus.com/v1.2/suppliercredits/sc-1/email/");
    const [postUrl, options] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toBe("https://api.elorus.com/v1.2/suppliercredits/sc-1/email/");
    expect(JSON.parse(options.body as string)).toEqual({
      to: "supplier@example.com",
      subject: "Default subject",
      message: "Default message",
      cc: [],
      bcc: [],
      attach_pdf: true,
    });
  });

  it("export_supplier_credit_pdf GETs the pdf sub-resource and returns a base64 resource blob", async () => {
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

    const result = await client.callTool({
      name: "export_supplier_credit_pdf",
      arguments: { id: "sc-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/suppliercredits/sc-1/pdf/");
    const content = result.content as Array<{ type: string; resource: { mimeType: string } }>;
    expect(content[0].resource.mimeType).toBe("application/pdf");
  });
});
