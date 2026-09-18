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
    expect(JSON.parse(options.body as string)).toEqual({ invoice: "inv-1", amount: "150.00" });
  });
});
