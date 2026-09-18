import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerAppliedCreditTools } from "../../tools/applied-credit.js";

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerAppliedCreditTools(server, elorusClient);

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

describe("generic applied-credit tools", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_applied_credit GETs the resource's nested applied-credit sub-resource", async () => {
    const mockFetch = mockFetchWith([{ id: "ac-1", amount: "50.00" }]);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_applied_credit",
      arguments: { resource_type: "invoice", resource_id: "inv-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/applied-credit/");
  });

  it("accepts suppliercredit as a resource_type", async () => {
    const mockFetch = mockFetchWith([]);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_applied_credit",
      arguments: { resource_type: "suppliercredit", resource_id: "sc-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/suppliercredits/sc-1/applied-credit/");
  });

  it("rejects a resource_type outside invoice/creditnote/suppliercredit without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_applied_credit",
      arguments: { resource_type: "bill", resource_id: "bill-1" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("unapply_credit DELETEs the applied-credit record's own path", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      json: () => Promise.reject(new Error("no body")),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "unapply_credit",
      arguments: { resource_type: "creditnote", resource_id: "cn-1", applied_credit_id: "ac-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/creditnotes/cn-1/applied-credit/ac-1/");
    expect(options.method).toBe("DELETE");
  });
});
