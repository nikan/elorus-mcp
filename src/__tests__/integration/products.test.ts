import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerProductTools } from "../../tools/products.js";
import productsFixture from "../fixtures/products.json" with { type: "json" };

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerProductTools(server, elorusClient);

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

describe("product tools", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_products GETs /products/ with search and ordering", async () => {
    const mockFetch = mockFetchWith(productsFixture);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_products",
      arguments: { search: "Website", ordering: "-title" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/products/");
    expect(parsed.searchParams.get("search")).toBe("Website");
    expect(parsed.searchParams.get("ordering")).toBe("-title");
  });

  it("get_product fetches a single product by id", async () => {
    const single = productsFixture.results[0];
    const mockFetch = mockFetchWith(single);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "get_product", arguments: { id: single.id } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe(`https://api.elorus.com/v1.2/products/${single.id}/`);
  });

  it("create_product POSTs provided fields to /products/", async () => {
    const created = { ...productsFixture.results[0], id: "5000000002" };
    const mockFetch = mockFetchWith(created, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_product",
      arguments: { title: "Consulting", sale_price: "150.00" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/products/");
    expect(JSON.parse(options.body as string)).toEqual({ title: "Consulting", sale_price: "150.00" });
  });

  it("update_product fetches the current record, merges fields, and PUTs", async () => {
    const current = productsFixture.results[0];
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
        json: () => Promise.resolve({ ...current, sale_price: "900.00" }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_product",
      arguments: { id: current.id, sale_price: "900.00" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ sale_price: "900.00" });
  });
});
