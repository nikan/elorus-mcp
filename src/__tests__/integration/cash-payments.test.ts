import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerCashPaymentTools } from "../../tools/cash-payments.js";

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerCashPaymentTools(server, elorusClient);

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

describe("cash payment tools", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_cash_payments maps supplier/bill to contact/purchase query params", async () => {
    const mockFetch = mockFetchWith({ count: 0, results: [] });
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "list_cash_payments",
      arguments: { supplier: "sup-1", bill: "bill-1" },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/cashpayments/");
    expect(parsed.searchParams.get("contact")).toBe("sup-1");
    expect(parsed.searchParams.get("purchase")).toBe("bill-1");
  });

  it("record_cash_payment links to a bill via purchase_payments when bill is given", async () => {
    const mockFetch = mockFetchWith({ id: "cp-1" }, 201);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "record_cash_payment",
      arguments: {
        supplier: "sup-1",
        date: "2026-07-01",
        amount: "250.00",
        payment_method: "2",
        bill: "bill-1",
      },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/cashpayments/");
    expect(JSON.parse(options.body as string)).toEqual({
      contact: "sup-1",
      date: "2026-07-01",
      amount: "250.00",
      payment_method: "2",
      transaction_type: "ip",
      purchase_payments: [{ purchase: "bill-1", amount: "250.00" }],
    });
  });

  it("record_cash_payment sends an empty purchase_payments array when no bill is given", async () => {
    const mockFetch = mockFetchWith({ id: "cp-2" }, 201);
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "record_cash_payment",
      arguments: { supplier: "sup-1", date: "2026-07-01", amount: "100.00", payment_method: "2" },
    });

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.purchase_payments).toEqual([]);
    expect(body.contact).toBe("sup-1");
  });

  it("update_cash_payment fetches the current record, merges fields, and PUTs", async () => {
    const current = { id: "cp-1", date: "2026-07-01", amount: "250.00", title: "" };
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
        json: () => Promise.resolve({ ...current, title: "Starling ref 123" }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_cash_payment",
      arguments: { id: "cp-1", title: "Starling ref 123" },
    });

    expect(result.isError).toBeFalsy();
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ title: "Starling ref 123" });
  });

  it("delete_cash_payment DELETEs /cashpayments/{id}/", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      json: () => Promise.resolve({}),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "delete_cash_payment", arguments: { id: "cp-1" } });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/cashpayments/cp-1/");
    expect(options.method).toBe("DELETE");
  });
});
