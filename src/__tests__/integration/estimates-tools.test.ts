import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { documentTests } from "./phase2-helpers.js";
import { registerEstimateTools } from "../../tools/estimates.js";

documentTests("estimate", "estimates", "/estimates/", registerEstimateTools,
  { client: "123" }, { title: "Service", quantity: "2", unit_value: "10.00", taxes: [{ tax: "456", auto_calculate: true }] }, false);

describe("estimate calculator_mode total_pre_discount", () => {
  let client: Client;
  let server: McpServer;
  let fetchMock: ReturnType<typeof vi.fn>;
  const response = (body: unknown) =>
    new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

  beforeEach(async () => {
    fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response({ id: "100" })));
    vi.stubGlobal("fetch", fetchMock);
    server = new McpServer({ name: "test", version: "1" });
    registerEstimateTools(server, new ElorusClient("test-key", "test-org"));
    client = new Client({ name: "test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
  });
  afterEach(async () => {
    await client.close();
    await server.close();
    vi.unstubAllGlobals();
  });

  it("accepts the mode on create", async () => {
    const item = { title: "Service", quantity: "1", unit_value: "10.00" };
    const result = await client.callTool({
      name: "create_estimate",
      arguments: { client: "123", calculator_mode: "total_pre_discount", items: [item] },
    });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).calculator_mode).toBe("total_pre_discount");
  });

  it("retains the mode when updating an unrelated field on an existing draft", async () => {
    fetchMock.mockResolvedValueOnce(
      response({
        id: "100",
        client: "123",
        draft: true,
        calculator_mode: "total_pre_discount",
        items: [{ id: "200", title: "Service", quantity: "1", unit_total: "12.40" }],
      })
    );
    const result = await client.callTool({
      name: "update_estimate",
      arguments: { id: "100", public_notes: "Revised" },
    });
    expect(result.isError).toBeFalsy();
    expect(fetchMock.mock.calls[1][1].method).toBe("PUT");
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(body.calculator_mode).toBe("total_pre_discount");
    expect(body.public_notes).toBe("Revised");
  });
});
