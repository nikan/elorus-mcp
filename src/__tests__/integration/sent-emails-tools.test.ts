import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerSentEmailTools } from "../../tools/sent-emails.js";

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerSentEmailTools(server, elorusClient);

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

describe("list_sent_emails", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("GETs the resource's nested sent-email-messages sub-resource", async () => {
    const mockFetch = mockFetchWith([{ id: "msg-1", to: "client@example.com" }]);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_sent_emails",
      arguments: { resource_type: "invoice", resource_id: "inv-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/sent-email-messages/");
  });

  it("accepts every resource_type in the sent-email matrix, e.g. 'deliverynote'", async () => {
    const mockFetch = mockFetchWith([]);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_sent_emails",
      arguments: { resource_type: "deliverynote", resource_id: "dn-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/deliverynotes/dn-1/sent-email-messages/");
  });

  it("rejects a resource_type not in the sent-email matrix (e.g. 'contact') without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_sent_emails",
      arguments: { resource_type: "contact", resource_id: "c-1" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
