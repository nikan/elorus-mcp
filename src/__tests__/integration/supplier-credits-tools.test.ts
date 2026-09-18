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

  it("apply_supplier_credit POSTs bill/amount to the apply sub-resource", async () => {
    const mockFetch = mockFetchWith({ applied: true });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "apply_supplier_credit",
      arguments: { id: "sc-1", bill: "bill-1", amount: "100.00" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/suppliercredits/sc-1/apply/");
    expect(JSON.parse(options.body as string)).toEqual({ bill: "bill-1", amount: "100.00" });
  });
});
