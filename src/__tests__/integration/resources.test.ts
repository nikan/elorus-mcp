import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerResources } from "../../resources/index.js";

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerResources(server, elorusClient);

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

describe("MCP resources", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("lists all seven registered resources", async () => {
    const client = await connectedClient(elorusClient);
    const { resources } = await client.listResources();

    const uris = resources.map((r) => r.uri).sort();
    expect(uris).toEqual(
      [
        "elorus://bills",
        "elorus://cashpayments",
        "elorus://cashreceipts",
        "elorus://contacts",
        "elorus://expenses",
        "elorus://invoices",
        "elorus://products",
      ].sort()
    );
  });

  it.each([
    ["elorus://contacts", "/contacts/"],
    ["elorus://invoices", "/invoices/"],
    ["elorus://cashreceipts", "/cashreceipts/"],
    ["elorus://cashpayments", "/cashpayments/"],
    ["elorus://expenses", "/expenses/"],
    ["elorus://bills", "/bills/"],
    ["elorus://products", "/products/"],
  ])("reading %s GETs %s with page_size=100", async (uri, path) => {
    const mockFetch = mockFetchWith({ count: 1, results: [{ id: "1" }] });
    const client = await connectedClient(elorusClient);

    const result = await client.readResource({ uri });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe(`/v1.2${path}`);
    expect(parsed.searchParams.get("page_size")).toBe("100");

    expect(result.contents).toHaveLength(1);
    const content = result.contents[0];
    expect(content).toMatchObject({ uri, mimeType: "application/json" });
    expect("text" in content).toBe(true);
    expect(JSON.parse((content as { text: string }).text)).toEqual({
      count: 1,
      results: [{ id: "1" }],
    });
  });
});
