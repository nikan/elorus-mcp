import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerNoteTools } from "../../tools/notes.js";

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerNoteTools(server, elorusClient);

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

describe("note & discussion tools", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_private_notes maps resource_type/resource_id to content_type/object_id query params", async () => {
    const mockFetch = mockFetchWith({ count: 0, results: [] });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_private_notes",
      arguments: { resource_type: "invoice", resource_id: "inv-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/privatenotes/");
    expect(parsed.searchParams.get("content_type")).toBe("invoice");
    expect(parsed.searchParams.get("object_id")).toBe("inv-1");
  });

  it("create_private_note POSTs content_type/object_id/title/body to /privatenotes/", async () => {
    const mockFetch = mockFetchWith({ id: "note-1" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_private_note",
      arguments: { resource_type: "contact", resource_id: "c-1", title: "Reminder", body: "Call back" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/privatenotes/");
    expect(JSON.parse(options.body as string)).toEqual({
      content_type: "contact",
      object_id: "c-1",
      title: "Reminder",
      body: "Call back",
    });
  });

  it("list_client_discussions maps resource_type/resource_id to content_type/object_id query params", async () => {
    const mockFetch = mockFetchWith({ count: 0, results: [] });
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "list_client_discussions",
      arguments: { resource_type: "cashreceipt", resource_id: "cr-1" },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/clientdiscussions/");
    expect(parsed.searchParams.get("content_type")).toBe("cashreceipt");
    expect(parsed.searchParams.get("object_id")).toBe("cr-1");
  });

  it("create_client_discussion POSTs content_type/object_id/body to /clientdiscussions/", async () => {
    const mockFetch = mockFetchWith({ id: "disc-1" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_client_discussion",
      arguments: { resource_type: "invoice", resource_id: "inv-1", body: "Thanks for your business" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/clientdiscussions/");
    expect(JSON.parse(options.body as string)).toEqual({
      content_type: "invoice",
      object_id: "inv-1",
      body: "Thanks for your business",
    });
  });

  it("rejects an unsupported resource_type for client discussions without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_client_discussions",
      arguments: { resource_type: "bill", resource_id: "b-1" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
