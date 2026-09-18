import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerCreditNoteTools } from "../../tools/credit-notes.js";

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerCreditNoteTools(server, elorusClient);

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

describe("credit note tools (list/apply)", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_credit_notes GETs /creditnotes/ with client and date filters", async () => {
    const mockFetch = mockFetchWith({ count: 0, results: [] });
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "list_credit_notes",
      arguments: { client: "client-1", date_after: "2026-01-01" },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/creditnotes/");
    expect(parsed.searchParams.get("client")).toBe("client-1");
    expect(parsed.searchParams.get("date_after")).toBe("2026-01-01");
  });

  it("create_credit_note POSTs a valid credit note", async () => {
    const mockFetch = mockFetchWith({ id: "cn-1" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_credit_note",
      arguments: {
        client: "client-1",
        date: "2026-07-01",
        documenttype: "doctype-1",
        items: [{ title: "Refund", quantity: "1", unit_value: "50.00" }],
      },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/creditnotes/");
    expect(JSON.parse(options.body as string)).toMatchObject({ client: "client-1" });
  });

  it("create_credit_note maps notes to public_notes", async () => {
    const mockFetch = mockFetchWith({ id: "cn-2" }, 201);
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "create_credit_note",
      arguments: {
        client: "client-1",
        date: "2026-07-01",
        documenttype: "doctype-1",
        notes: "Refund for damaged goods",
        items: [{ title: "Refund", quantity: "1", unit_value: "50.00" }],
      },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.public_notes).toBe("Refund for damaged goods");
    expect(body.notes).toBeUndefined();
  });

  it("create_credit_note rejects a line item missing unit_value under calculator_mode 'initial' without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_credit_note",
      arguments: {
        client: "client-1",
        date: "2026-07-01",
        documenttype: "doctype-1",
        items: [{ title: "Refund", quantity: "1" }],
      },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("apply_credit_note POSTs invoice/amount to the applied-credit sub-resource", async () => {
    const mockFetch = mockFetchWith({ applied: true });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "apply_credit_note",
      arguments: { id: "cn-1", invoice: "inv-1", amount: "150.00" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/creditnotes/cn-1/applied-credit/");
    expect(JSON.parse(options.body as string)).toEqual([{ invoice: "inv-1", amount: "150.00" }]);
  });

  it("get_credit_note fetches a single credit note by id", async () => {
    const mockFetch = mockFetchWith({ id: "cn-1" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "get_credit_note", arguments: { id: "cn-1" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/creditnotes/cn-1/");
  });

  it("update_credit_note PATCHes directly when only PATCH-safe fields are given", async () => {
    const mockFetch = mockFetchWith({ id: "cn-1", custom_id: "PO-9" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_credit_note",
      arguments: { id: "cn-1", custom_id: "PO-9" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/creditnotes/cn-1/");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({ custom_id: "PO-9" });
  });

  it("update_credit_note uses GET-then-PUT for date when the credit note is a draft", async () => {
    const current = { id: "cn-1", draft: true, date: "2026-07-01", client: "client-1" };
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
        json: () => Promise.resolve({ ...current, date: "2026-07-05" }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_credit_note",
      arguments: { id: "cn-1", date: "2026-07-05" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ date: "2026-07-05" });
  });

  it("update_credit_note rejects a draft-only field (e.g. date) when not a draft, without PUTting", async () => {
    const current = { id: "cn-1", draft: false, date: "2026-07-01" };
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
      name: "update_credit_note",
      arguments: { id: "cn-1", date: "2026-07-05" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("delete_credit_note DELETEs /creditnotes/{id}/", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "delete_credit_note", arguments: { id: "cn-1" } });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/creditnotes/cn-1/");
    expect(options.method).toBe("DELETE");
  });

  it("void_credit_note PUTs {void: true} to the void sub-resource", async () => {
    const mockFetch = mockFetchWith({ id: "cn-1", status: "void" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "void_credit_note", arguments: { id: "cn-1" } });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/creditnotes/cn-1/void/");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ void: true });
  });

  it("send_credit_note_email GETs defaults then POSTs merged fields", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: () =>
          Promise.resolve({
            to: "client@example.com",
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
      name: "send_credit_note_email",
      arguments: { id: "cn-1" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [getUrl] = mockFetch.mock.calls[0] as [string];
    expect(getUrl).toBe("https://api.elorus.com/v1.2/creditnotes/cn-1/email/");
    const [postUrl, options] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(postUrl).toBe("https://api.elorus.com/v1.2/creditnotes/cn-1/email/");
    expect(JSON.parse(options.body as string)).toEqual({
      to: "client@example.com",
      subject: "Default subject",
      message: "Default message",
      cc: [],
      bcc: [],
      attach_pdf: true,
    });
  });

  it("export_credit_note_pdf GETs the pdf sub-resource and returns a base64 resource blob", async () => {
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

    const result = await client.callTool({ name: "export_credit_note_pdf", arguments: { id: "cn-1" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/creditnotes/cn-1/pdf/");
    const content = result.content as Array<{ type: string; resource: { mimeType: string } }>;
    expect(content[0].resource.mimeType).toBe("application/pdf");
  });
});
