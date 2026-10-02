import { afterEach, describe, expect, it, vi } from "vitest";
import { ElorusClient } from "../../client.js";

afterEach(() => vi.unstubAllGlobals());

describe.each(["estimates", "deliverynotes", "goodsreceipts"])("%s HTTP contract", (resource) => {
  it.each(["get", "post", "put", "patch", "delete"] as const)("%s uses the API route and demo headers", async (method) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const client = new ElorusClient("key", "org", true);
    const path = `/${resource}/${method === "post" ? "" : "123/"}`;
    const body = { custom_id: "external" };
    if (method === "get" || method === "delete") await client[method](path);
    else await client[method](path, body);
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.elorus.com/v1.2${path}`);
    const init = fetchMock.mock.calls[0][1];
    expect(init.method ?? "GET").toBe(method.toUpperCase());
    expect(new Headers(init.headers).get("X-Elorus-Demo")).not.toBeNull();
    if (method !== "get" && method !== "delete") expect(JSON.parse(init.body)).toEqual(body);
  });
});

describe("sequence DELETE bodies", () => {
  it.each(["/goodsreceiptsequences/delete/", "/documenttypes/123/sequences/delete/"])("%s sends JSON and accepts 204", async (path) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await new ElorusClient("key", "org").delete(path, { name: "SEQ" })).toEqual({});
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ name: "SEQ" });
    expect(new Headers(fetchMock.mock.calls[0][1].headers).get("Content-Type")).toBe("application/json");
  });
});
