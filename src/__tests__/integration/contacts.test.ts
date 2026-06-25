import { describe, it, expect, vi } from "vitest";
import { ElorusClient } from "../../client.js";
import contactsFixture from "../fixtures/contacts.json" with { type: "json" };

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

describe("contacts integration (fixture)", () => {
  it("list_contacts returns paginated contact list", async () => {
    mockFetchWith(contactsFixture);

    const result = await client.get<typeof contactsFixture>("/contacts/");

    expect(result.count).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].company).toBe("Acme Corp");
    expect(result.results[0].is_client).toBe(true);
  });

  it("get_contact fetches a single contact by id", async () => {
    const single = contactsFixture.results[1];
    mockFetchWith(single);

    const result = await client.get<(typeof contactsFixture.results)[0]>(
      `/contacts/${single.id}/`
    );

    expect(result.first_name).toBe("Maria");
    expect(result.is_supplier).toBe(true);
  });

  it("create_contact POSTs to /contacts/ and returns created object", async () => {
    const created = { ...contactsFixture.results[0], id: "1000000099" };
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: "Created",
      headers: new Headers(),
      json: () => Promise.resolve(created),
    });
    vi.stubGlobal("fetch", mockFetch);

    const result = await client.post<typeof created>("/contacts/", {
      company: "Acme Corp",
      is_client: true,
    });

    expect(result.id).toBe("1000000099");
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/contacts/");
    expect(options.method).toBe("POST");
  });

  it("passes search query param in URL", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers(),
      json: () => Promise.resolve(contactsFixture),
    });
    vi.stubGlobal("fetch", mockFetch);

    await client.get("/contacts/", { search: "Acme", page: 1 });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.searchParams.get("search")).toBe("Acme");
    expect(parsed.searchParams.get("page")).toBe("1");
  });
});
