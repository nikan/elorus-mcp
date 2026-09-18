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

  it("list_private_notes GETs the resource's nested notes sub-resource", async () => {
    const mockFetch = mockFetchWith([]);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_private_notes",
      arguments: { resource_type: "invoice", resource_id: "inv-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/notes/");
  });

  it("create_private_note POSTs {notes: body} to the resource's nested notes sub-resource", async () => {
    const mockFetch = mockFetchWith({ id: "note-1" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_private_note",
      arguments: { resource_type: "contact", resource_id: "c-1", body: "Call back" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/contacts/c-1/notes/");
    expect(JSON.parse(options.body as string)).toEqual({ notes: "Call back" });
  });

  it("list_client_discussions GETs the resource's nested discussions sub-resource", async () => {
    const mockFetch = mockFetchWith([]);
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "list_client_discussions",
      arguments: { resource_type: "invoice", resource_id: "inv-1" },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/discussions/");
  });

  it("create_client_discussion POSTs {message: body} to the resource's nested discussions sub-resource", async () => {
    const mockFetch = mockFetchWith({ id: "disc-1" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_client_discussion",
      arguments: { resource_type: "invoice", resource_id: "inv-1", body: "Thanks for your business" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/discussions/");
    expect(JSON.parse(options.body as string)).toEqual({ message: "Thanks for your business" });
  });

  it("rejects an unsupported resource_type for client discussions without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_client_discussions",
      arguments: { resource_type: "cashreceipt", resource_id: "cr-1" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("list_private_notes accepts every resource_type in the widened matrix, e.g. 'project'", async () => {
    const mockFetch = mockFetchWith([]);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_private_notes",
      arguments: { resource_type: "project", resource_id: "proj-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/projects/proj-1/notes/");
  });

  it("rejects a resource_type not in the notes matrix (e.g. 'task') without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_private_notes",
      arguments: { resource_type: "task", resource_id: "task-1" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("list_client_discussions accepts every resource_type in the widened matrix, e.g. 'estimate'", async () => {
    const mockFetch = mockFetchWith([]);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_client_discussions",
      arguments: { resource_type: "estimate", resource_id: "est-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/estimates/est-1/discussions/");
  });

  it("update_private_note PUTs {notes: body} to the note's own path", async () => {
    const mockFetch = mockFetchWith({ id: "note-1", notes: "Updated" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_private_note",
      arguments: { resource_type: "contact", resource_id: "c-1", note_id: "note-1", body: "Updated" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/contacts/c-1/notes/note-1/");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ notes: "Updated" });
  });

  it("delete_private_note DELETEs the note's own path", async () => {
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
      name: "delete_private_note",
      arguments: { resource_type: "contact", resource_id: "c-1", note_id: "note-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/contacts/c-1/notes/note-1/");
    expect(options.method).toBe("DELETE");
  });

  it("update_client_discussion PUTs {message: body} to the discussion's own path", async () => {
    const mockFetch = mockFetchWith({ id: "disc-1", message: "Updated" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_client_discussion",
      arguments: {
        resource_type: "invoice",
        resource_id: "inv-1",
        discussion_id: "disc-1",
        body: "Updated",
      },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/discussions/disc-1/");
    expect(options.method).toBe("PUT");
    expect(JSON.parse(options.body as string)).toEqual({ message: "Updated" });
  });

  it("delete_client_discussion DELETEs the discussion's own path", async () => {
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
      name: "delete_client_discussion",
      arguments: { resource_type: "invoice", resource_id: "inv-1", discussion_id: "disc-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/discussions/disc-1/");
    expect(options.method).toBe("DELETE");
  });
});
