import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerSequenceTools } from "../../tools/sequences.js";

describe.each([
  ["goods_receipt_sequence", "/goodsreceiptsequences/", {}],
  ["document_type_sequence", "/documenttypes/123/sequences/", { document_type_id: "123" }],
] as const)("%s", (name, path, parent) => {
  let client: Client;
  let server: McpServer;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(async () => {
    fetchMock = vi.fn().mockImplementation(() => Promise.resolve(new Response("{}", { headers: { "Content-Type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    server = new McpServer({ name: "test", version: "1" });
    registerSequenceTools(server, new ElorusClient("key", "org"));
    client = new Client({ name: "test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
  });
  afterEach(async () => { await client.close(); await server.close(); vi.unstubAllGlobals(); });
  it.each([
    ["create", "POST", "", { name: "SEQ" }],
    ["delete", "DELETE", "delete/", { name: "SEQ" }],
    ["rename", "PUT", "rename/", { old_name: "SEQ", new_name: "NEW" }],
  ] as const)("%s sends the exact action body", async (action, method, suffix, body) => {
    const result = await client.callTool({ name: `${action}_${name}`, arguments: { ...parent, ...body } });
    expect(result.isError).toBeFalsy();
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.elorus.com/v1.2${path}${suffix}`);
    expect(fetchMock.mock.calls[0][1].method).toBe(method);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual(body);
  });
  it("lists with the API's active filter", async () => {
    await client.callTool({ name: `list_${name}s`, arguments: { ...parent, active: "0" } });
    expect(fetchMock.mock.calls[0][0]).toBe(`https://api.elorus.com/v1.2${path}?active=0`);
  });
  it("rejects invalid sequence names before sending", async () => {
    for (const sequence of ["", "12345678901"]) {
      expect((await client.callTool({ name: `create_${name}`, arguments: { ...parent, name: sequence } })).isError).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("requires the parent ID for document-type tools", async () => {
    expect((await client.callTool({ name: "create_document_type_sequence", arguments: { name: "SEQ" } })).isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("does not retry failed DELETE actions", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{"detail":"In use"}', { status: 500 })));
    expect((await client.callTool({ name: `delete_${name}`, arguments: { ...parent, name: "SEQ" } })).isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
