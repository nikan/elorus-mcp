import { describe, it, expect, vi } from "vitest";
import { ElorusClient } from "../../client.js";
import recurringInvoicesFixture from "../fixtures/recurring-invoices.json" with { type: "json" };

const client = new ElorusClient("fixture-key", "fixture-org");

function mockFetchWith(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      status,
      statusText: "OK",
      headers: new Headers(),
      json: () => Promise.resolve(body),
    })
  );
}

describe("recurring invoices integration (fixture)", () => {
  it("list_recurring_invoices returns paginated schedule list", async () => {
    mockFetchWith(recurringInvoicesFixture);

    const result = await client.get<typeof recurringInvoicesFixture>("/recurringinvoices/");

    expect(result.count).toBe(1);
    expect(result.results[0].period).toBe("months");
    expect(result.results[0].paused).toBe(false);
  });

  it("get_recurring_invoice fetches a single schedule", async () => {
    const single = recurringInvoicesFixture.results[0];
    mockFetchWith(single);

    const result = await client.get<(typeof recurringInvoicesFixture.results)[0]>(
      `/recurringinvoices/${single.id}/`
    );

    expect(result.id).toBe("4000000001");
    expect(result.items).toHaveLength(1);
    expect(result.next_execution).toBe("2026-01-01T06:00:00Z");
  });

  it("create_recurring_invoice POSTs with correct body", async () => {
    const created = { ...recurringInvoicesFixture.results[0], id: "4000000002" };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: "Created",
      headers: new Headers(),
      json: () => Promise.resolve(created),
    });
    vi.stubGlobal("fetch", mockFetch);

    const payload = {
      client: "1000000001",
      interval: 1,
      period: "months",
      end_datetime: "2027-01-01T00:00:00Z",
      items: [{ title: "Hosting", quantity: "1", unit_value: "50.00" }],
    };

    await client.post("/recurringinvoices/", payload);

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/recurringinvoices/");
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toMatchObject({ client: "1000000001", period: "months" });
  });

  it("pause_recurring_invoice merges paused: true via PUT", async () => {
    const current = recurringInvoicesFixture.results[0];
    const mockFetch = vi.fn().mockImplementation((url: string, options?: RequestInit) => {
      if (!options || options.method === undefined) {
        return Promise.resolve({
          ok: true,
          status: 200,
          statusText: "OK",
          headers: new Headers(),
          json: () => Promise.resolve(current),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: () => Promise.resolve({ ...current, paused: true }),
      });
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await client.mergePut(`/recurringinvoices/${current.id}/`, { paused: true });

    expect(result).toMatchObject({ paused: true });
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ paused: true });
  });

  it("filters recurring invoices by recurring_status query param", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: () => Promise.resolve(recurringInvoicesFixture),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.get("/recurringinvoices/", { recurring_status: "active" });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("recurring_status")).toBe("active");
  });
});
