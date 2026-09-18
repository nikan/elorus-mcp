import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerRecurringInvoiceTools } from "../../tools/recurring-invoices.js";
import recurringInvoicesFixture from "../fixtures/recurring-invoices.json" with { type: "json" };

/**
 * recurring-invoices.test.ts exercises the ElorusClient layer directly.
 * This file drives the tools through the real MCP tool-call path to cover
 * the handler bodies, including get/list/update/pause/resume which that
 * file doesn't touch.
 */

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerRecurringInvoiceTools(server, elorusClient);

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

describe("recurring invoice tools (handler-level)", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_recurring_invoices GETs /recurringinvoices/ with client and recurring_status filters", async () => {
    const mockFetch = mockFetchWith(recurringInvoicesFixture);
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "list_recurring_invoices",
      arguments: { client: "client-1", recurring_status: "paused" },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/recurringinvoices/");
    expect(parsed.searchParams.get("client")).toBe("client-1");
    expect(parsed.searchParams.get("recurring_status")).toBe("paused");
  });

  it("get_recurring_invoice fetches a single schedule by id", async () => {
    const single = recurringInvoicesFixture.results[0];
    const mockFetch = mockFetchWith(single);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "get_recurring_invoice", arguments: { id: single.id } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe(`https://api.elorus.com/v1.2/recurringinvoices/${single.id}/`);
  });

  it("update_recurring_invoice fetches the current record, merges fields, and PUTs", async () => {
    const current = recurringInvoicesFixture.results[0];
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
        json: () => Promise.resolve({ ...current, due_days: 15 }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_recurring_invoice",
      arguments: { id: current.id, due_days: 15 },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ due_days: 15 });
  });

  it("pause_recurring_invoice merges paused: true via mergePut", async () => {
    const current = recurringInvoicesFixture.results[0];
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
        json: () => Promise.resolve({ ...current, paused: true }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "pause_recurring_invoice", arguments: { id: current.id } });

    expect(result.isError).toBeFalsy();
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ paused: true });
  });

  it("resume_recurring_invoice merges paused: false via mergePut", async () => {
    const current = { ...recurringInvoicesFixture.results[0], paused: true };
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
        json: () => Promise.resolve({ ...current, paused: false }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "resume_recurring_invoice", arguments: { id: current.id } });

    expect(result.isError).toBeFalsy();
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ paused: false });
  });

  it("create_recurring_invoice POSTs a valid schedule", async () => {
    const created = { ...recurringInvoicesFixture.results[0], id: "4000000003" };
    const mockFetch = mockFetchWith(created, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_recurring_invoice",
      arguments: {
        client: "client-1",
        end_datetime: "2027-01-01T00:00:00Z",
        items: [{ title: "Hosting", quantity: "1", unit_value: "50.00" }],
      },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/recurringinvoices/");
    expect(JSON.parse(options.body as string)).toMatchObject({ client: "client-1" });
  });

  it("create_recurring_invoice rejects a line item missing unit_value under calculator_mode 'initial' without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "create_recurring_invoice",
      arguments: {
        client: "client-1",
        end_datetime: "2027-01-01T00:00:00Z",
        items: [{ title: "Hosting", quantity: "1" }],
      },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("delete_recurring_invoice DELETEs /recurringinvoices/{id}/", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "delete_recurring_invoice",
      arguments: { id: "4000000001" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/recurringinvoices/4000000001/");
    expect(options.method).toBe("DELETE");
  });
});
