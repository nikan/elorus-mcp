import { describe, it, expect, vi } from "vitest";
import { ElorusClient } from "../../client.js";
import invoicesFixture from "../fixtures/invoices.json" with { type: "json" };

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

describe("invoices integration (fixture)", () => {
  it("list_invoices returns paginated invoice list", async () => {
    mockFetchWith(invoicesFixture);

    const result = await client.get<typeof invoicesFixture>("/invoices/");

    expect(result.count).toBe(1);
    expect(result.results[0].status).toBe("sent");
    expect(result.results[0].total).toBe("1240.00");
  });

  it("get_invoice fetches a single invoice", async () => {
    const single = invoicesFixture.results[0];
    mockFetchWith(single);

    const result = await client.get<(typeof invoicesFixture.results)[0]>(
      `/invoices/${single.id}/`
    );

    expect(result.id).toBe("2000000001");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].title).toBe("Consulting services");
  });

  it("void_invoice POSTs to void endpoint and handles 200", async () => {
    const voided = { ...invoicesFixture.results[0], status: "void" };
    mockFetchWith(voided);

    const result = await client.post<typeof voided>("/invoices/2000000001/void/", {});
    expect(result.status).toBe("void");
  });

  it("void_invoice handles 204 No Content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      json: () => Promise.reject(new Error("no body")),
    }));

    const result = await client.post("/invoices/2000000001/void/", {});
    expect(result).toEqual({});
  });

  it("create_invoice POSTs with correct body", async () => {
    const created = { ...invoicesFixture.results[0], id: "2000000002" };
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
      date: "2026-06-25",
      documenttype: "3000000001",
      items: [{ title: "Consulting", quantity: "5", unit_value: "100.00" }],
    };

    await client.post("/invoices/", payload);

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(options.method).toBe("POST");
    expect(JSON.parse(options.body as string)).toMatchObject({ client: "1000000001" });
  });

  it("filters invoices by date range query params", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: () => Promise.resolve(invoicesFixture),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.get("/invoices/", { date_after: "2026-01-01", date_before: "2026-06-30" });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("date_after")).toBe("2026-01-01");
    expect(parsed.searchParams.get("date_before")).toBe("2026-06-30");
  });
});
