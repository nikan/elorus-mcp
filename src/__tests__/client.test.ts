import { describe, it, expect, vi, beforeEach } from "vitest";
import { ElorusClient, formatDrfError, formatHttpError } from "../client.js";

const TEST_API_KEY = "test-api-key";
const TEST_ORG_ID = "test-org-id";

function makeFetch(status: number, body: unknown, headers: Record<string, string> = {}) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: "OK",
    headers: new Headers(headers),
    json: () => Promise.resolve(body),
  });
}

describe("ElorusClient", () => {
  let client: ElorusClient;

  beforeEach(() => {
    client = new ElorusClient(TEST_API_KEY, TEST_ORG_ID);
  });

  describe("request headers", () => {
    it("sends Authorization and X-Elorus-Organization headers", async () => {
      const mockFetch = makeFetch(200, {});
      vi.stubGlobal("fetch", mockFetch);

      await client.get("/contacts/");

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = options.headers as Record<string, string>;
      expect(headers["Authorization"]).toBe(`Token ${TEST_API_KEY}`);
      expect(headers["X-Elorus-Organization"]).toBe(TEST_ORG_ID);
      expect(headers["Content-Type"]).toBe("application/json");
    });
  });

  describe("get()", () => {
    it("builds correct URL without query params", async () => {
      const mockFetch = makeFetch(200, { results: [] });
      vi.stubGlobal("fetch", mockFetch);

      await client.get("/contacts/");

      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe("https://api.elorus.com/v1.2/contacts/");
    });

    it("appends defined query params and skips undefined", async () => {
      const mockFetch = makeFetch(200, { results: [] });
      vi.stubGlobal("fetch", mockFetch);

      await client.get("/invoices/", { page: 2, page_size: 50, status: undefined });

      const [url] = mockFetch.mock.calls[0] as [string];
      const parsed = new URL(url);
      expect(parsed.searchParams.get("page")).toBe("2");
      expect(parsed.searchParams.get("page_size")).toBe("50");
      expect(parsed.searchParams.has("status")).toBe(false);
    });

    it("returns parsed JSON body on success", async () => {
      const payload = { count: 1, results: [{ id: "abc" }] };
      vi.stubGlobal("fetch", makeFetch(200, payload));

      const result = await client.get("/contacts/");
      expect(result).toEqual(payload);
    });
  });

  describe("post()", () => {
    it("sends a POST with JSON-serialised body", async () => {
      const mockFetch = makeFetch(201, { id: "new-id" });
      vi.stubGlobal("fetch", mockFetch);

      const body = { company: "Acme" };
      await client.post("/contacts/", body);

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.method).toBe("POST");
      expect(options.body).toBe(JSON.stringify(body));
    });
  });

  describe("patch()", () => {
    it("sends a PATCH with JSON-serialised body", async () => {
      const mockFetch = makeFetch(200, { id: "abc", company: "Updated" });
      vi.stubGlobal("fetch", mockFetch);

      await client.patch("/contacts/abc/", { company: "Updated" });

      const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(options.method).toBe("PATCH");
    });
  });

  describe("204 No Content", () => {
    it("returns empty object for 204 responses", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        statusText: "No Content",
        headers: new Headers(),
        json: () => Promise.reject(new Error("no body")),
      }));

      const result = await client.post("/invoices/abc/void/", {});
      expect(result).toEqual({});
    });
  });

  describe("error handling", () => {
    it("throws with HTTP label for 401", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        headers: new Headers(),
        json: () => Promise.resolve({ detail: "Invalid token." }),
      }));

      await expect(client.get("/contacts/")).rejects.toThrow(
        "Elorus API error: Unauthorized — check ELORUS_API_KEY: Invalid token."
      );
    });

    it("throws with HTTP label for 404", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        headers: new Headers(),
        json: () => Promise.resolve({ detail: "Not found." }),
      }));

      await expect(client.get("/contacts/missing/")).rejects.toThrow(
        "Elorus API error: Not found: Not found."
      );
    });

    it("throws with field errors for 400", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        headers: new Headers(),
        json: () => Promise.resolve({ client: ["This field is required."], date: ["Enter a valid date."] }),
      }));

      await expect(client.post("/invoices/", {})).rejects.toThrow(
        "Elorus API error: Bad request: client: This field is required.; date: Enter a valid date."
      );
    });

    it("falls back to statusText when response body is not JSON", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        headers: new Headers(),
        json: () => Promise.reject(new Error("not json")),
      }));

      await expect(client.get("/contacts/")).rejects.toThrow(
        "Elorus API error: HTTP 500: Internal Server Error"
      );
    });
  });
});

describe("formatDrfError", () => {
  it("handles {detail: string}", () => {
    expect(formatDrfError({ detail: "Not found." })).toBe("Not found.");
  });

  it("handles string body", () => {
    expect(formatDrfError("some error")).toBe("some error");
  });

  it("handles array of strings", () => {
    expect(formatDrfError(["Error one.", "Error two."])).toBe("Error one.; Error two.");
  });

  it("handles per-field errors", () => {
    const result = formatDrfError({ client: ["Required."], date: ["Invalid date."] });
    expect(result).toContain("client: Required.");
    expect(result).toContain("date: Invalid date.");
  });

  it("handles nested field errors", () => {
    const result = formatDrfError({ items: { "0": ["unit_value: This field is required."] } });
    expect(result).toContain("items:");
  });

  it("falls back to JSON.stringify for unknown shapes", () => {
    expect(formatDrfError(42)).toBe("42");
  });
});

describe("formatHttpError", () => {
  it("uses known status label", () => {
    expect(formatHttpError(403, "detail")).toBe(
      "Elorus API error: Forbidden — check ELORUS_ORG_ID and user permissions: detail"
    );
  });

  it("uses HTTP N for unknown status", () => {
    expect(formatHttpError(502, "Bad gateway")).toBe(
      "Elorus API error: HTTP 502: Bad gateway"
    );
  });
});
