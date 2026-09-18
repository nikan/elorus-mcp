import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerContactTools } from "../../tools/contacts.js";
import contactsFixture from "../fixtures/contacts.json" with { type: "json" };

/**
 * contacts.test.ts exercises the ElorusClient layer directly. This file
 * drives the same tools through the real MCP tool-call path to cover the
 * handler bodies in tools/contacts.ts, including update_contact's
 * mergePut (GET+PUT) path and create_contact's required-field guard.
 */

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerContactTools(server, elorusClient);

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

describe("contact tools (handler-level)", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_contacts GETs /contacts/ with is_client/is_supplier filters", async () => {
    const mockFetch = mockFetchWith(contactsFixture);
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "list_contacts",
      arguments: { is_client: true, is_supplier: false },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/contacts/");
    expect(parsed.searchParams.get("is_client")).toBe("true");
    expect(parsed.searchParams.get("is_supplier")).toBe("false");
  });

  it("get_contact fetches a single contact by id", async () => {
    const single = contactsFixture.results[0];
    const mockFetch = mockFetchWith(single);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "get_contact", arguments: { id: single.id } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe(`https://api.elorus.com/v1.2/contacts/${single.id}/`);
  });

  it("create_contact rejects a contact with neither company nor a name, without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "create_contact", arguments: { is_client: true } });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("create_contact POSTs a company contact", async () => {
    const mockFetch = mockFetchWith({ id: "new-1", company: "Acme Corp" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_contact",
      arguments: { company: "Acme Corp", is_client: true },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/contacts/");
    expect(JSON.parse(options.body as string)).toMatchObject({ company: "Acme Corp", is_client: true });
  });

  it("create_contact wraps email/phone into the API's array-of-objects shape", async () => {
    const mockFetch = mockFetchWith({ id: "new-1", company: "Acme Corp" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_contact",
      arguments: { company: "Acme Corp", email: "billing@acme.com", phone: "555-0100" },
    });

    expect(result.isError).toBeFalsy();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(options.body as string)).toMatchObject({
      company: "Acme Corp",
      email: [{ email: "billing@acme.com", primary: true }],
      phones: [{ number: "555-0100", primary: true }],
    });
  });

  it("update_contact fetches the current record, merges fields, and PUTs", async () => {
    const current = contactsFixture.results[0];
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
        json: () => Promise.resolve({ ...current, active: false }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_contact",
      arguments: { id: current.id, active: false },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ active: false });
  });

  it("update_contact wraps email/phone into the API's array-of-objects shape", async () => {
    const current = contactsFixture.results[0];
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
        json: () => Promise.resolve(current),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_contact",
      arguments: { id: current.id, email: "new@acme.com", phone: "555-0199" },
    });

    expect(result.isError).toBeFalsy();
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(putOptions.body as string)).toMatchObject({
      email: [{ email: "new@acme.com", primary: true }],
      phones: [{ number: "555-0199", primary: true }],
    });
  });
});
