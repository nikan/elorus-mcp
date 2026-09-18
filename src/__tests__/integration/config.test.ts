import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerConfigTools } from "../../tools/config.js";

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerConfigTools(server, elorusClient);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return client;
}

function mockFetchWith(body: unknown) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers(),
    json: () => Promise.resolve(body),
  });
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

describe("config lookup tools", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_taxes GETs /taxes/", async () => {
    const mockFetch = mockFetchWith({
      count: 1,
      results: [{ id: "tax-1", title: "VAT 24%", rate: "24.00" }],
    });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "list_taxes", arguments: { page: 1 } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/taxes/?page=1");
  });

  it("get_tax GETs /taxes/{id}/", async () => {
    const mockFetch = mockFetchWith({ id: "tax-1", title: "VAT 24%", rate: "24.00" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "get_tax", arguments: { id: "tax-1" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/taxes/tax-1/");
  });

  it("list_document_types GETs /documenttypes/", async () => {
    const mockFetch = mockFetchWith({ count: 1, results: [{ id: "doctype-1", title: "Invoice" }] });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "list_document_types", arguments: {} });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/documenttypes/");
  });

  it("get_document_type GETs /documenttypes/{id}/", async () => {
    const mockFetch = mockFetchWith({ id: "doctype-1", title: "Invoice" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "get_document_type", arguments: { id: "doctype-1" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/documenttypes/doctype-1/");
  });

  it("list_units GETs /units/", async () => {
    const mockFetch = mockFetchWith({ count: 1, results: [{ id: "unit-1", title: "Hours" }] });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "list_units", arguments: {} });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/units/");
  });

  it("list_expense_categories GETs /expensecategories/", async () => {
    const mockFetch = mockFetchWith({ count: 1, results: [{ id: "cat-1", title: "Software" }] });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "list_expense_categories", arguments: {} });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/expensecategories/");
  });

  it("get_expense_category GETs /expensecategories/{id}/", async () => {
    const mockFetch = mockFetchWith({ id: "cat-1", title: "Software" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "get_expense_category", arguments: { id: "cat-1" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/expensecategories/cat-1/");
  });
});
