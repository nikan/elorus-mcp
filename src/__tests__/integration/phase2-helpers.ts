import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";

export function documentTests(singular: string, plural: string, path: string,
  register: (server: McpServer, client: ElorusClient) => void,
  required: Record<string, unknown>, item: Record<string, unknown>, voidable: boolean) {
  describe(`${plural} MCP tools`, () => {
    let client: Client;
    let server: McpServer;
    let fetchMock: ReturnType<typeof vi.fn>;
    const response = (body: unknown, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), {
      status, headers: { "Content-Type": "application/json" },
    });
    const bodyAt = (index = 0) => JSON.parse(fetchMock.mock.calls[index][1].body);
    beforeEach(async () => {
      fetchMock = vi.fn().mockImplementation(() => Promise.resolve(response({ id: "100" })));
      vi.stubGlobal("fetch", fetchMock);
      server = new McpServer({ name: "test", version: "1" });
      register(server, new ElorusClient("test-key", "test-org"));
      client = new Client({ name: "test", version: "1" });
      const [a, b] = InMemoryTransport.createLinkedPair();
      await Promise.all([client.connect(a), server.connect(b)]);
    });
    afterEach(async () => { await client.close(); await server.close(); vi.unstubAllGlobals(); });
    const call = (action: string, args: Record<string, unknown>) => client.callTool({ name: `${action}_${singular}`, arguments: args });

    it("publishes the complete tool set and item schemas", async () => {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(voidable ? 8 : 7);
      expect(tools.map(t => t.name)).toContain(`export_${singular}_pdf`);
      expect(tools.find(t => t.name === `create_${singular}`)?.inputSchema.required).toContain("items");
      expect(tools.some(t => t.name === `void_${singular}`)).toBe(voidable);
      if (singular !== "goods_receipt") {
        const schema = tools.find(t => t.name === `create_${singular}`)!.inputSchema;
        expect((schema.properties!.documenttype as { type: string }).type).toBe("string");
      }
    });
    it("sends documented list filters and rejects incomplete date periods", async () => {
      await client.callTool({ name: `list_${plural}`, arguments: { page: 2, page_size: 10, period_from: "2026-01-01", period_to: "2026-01-31", draft: "1" } });
      const url = new URL(fetchMock.mock.calls[0][0]);
      expect(url.pathname).toBe(`/v1.2${path}`);
      expect(url.searchParams.get("period_from")).toBe("2026-01-01");
      expect(url.searchParams.get("draft")).toBe("1");
      expect((await client.callTool({ name: `list_${plural}`, arguments: { period_from: "2026-01-01" } })).isError).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it("gets a document", async () => {
      expect((await call("get", { id: "100" })).isError).toBeFalsy();
      expect(fetchMock.mock.calls[0][0]).toBe(`https://api.elorus.com/v1.2${path}100/`);
      expect(fetchMock.mock.calls[0][1].method ?? "GET").toBe("GET");
    });
    it("creates with the exact nested payload", async () => {
      const body = { ...required, draft: true, date: "2026-09-20", items: [item] };
      expect((await call("create", body)).isError).toBeFalsy();
      expect(bodyAt()).toEqual(body);
      expect(fetchMock.mock.calls[0][1].method).toBe("POST");
    });
    it("rejects missing required fields without calling the API", async () => {
      expect((await call("create", { items: [item] })).isError).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it("PATCHes metadata without GET, preserving false", async () => {
      expect((await call("update", { id: "100", draft: false, custom_id: "external" })).isError).toBeFalsy();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][1].method).toBe("PATCH");
      expect(bodyAt()).toEqual({ draft: false, custom_id: "external" });
    });
    it("retains existing lines on full PUT and strips read-only response fields", async () => {
      fetchMock.mockResolvedValueOnce(response({ ...required, id: "100", draft: true, status: "draft", total: "5.00", organization: "1", items: [{ ...item, id: "200", item_net: "5.00" }] }));
      expect((await call("update", { id: "100", public_notes: "Revised" })).isError).toBeFalsy();
      expect(fetchMock.mock.calls[1][1].method).toBe("PUT");
      expect(bodyAt(1)).toEqual({ ...required, draft: true, items: [{ ...item, id: "200" }], public_notes: "Revised" });
    });
    it("omits null response addresses while retaining explicitly cleared nullable fields", async () => {
      fetchMock.mockResolvedValueOnce(response({ ...required, draft: true, billing_address: null, items: [{ ...item, id: "200", product: null }] }));
      expect((await call("update", { id: "100", public_notes: "Updated", branch: null })).isError).toBeFalsy();
      expect(bodyAt(1).billing_address).toBeUndefined();
      expect(bodyAt(1).branch).toBeNull();
      expect(bodyAt(1).items[0].id).toBe("200");
    });
    it("resolves returned unit IDs to symbols once per distinct unit before PUT", async () => {
      fetchMock.mockResolvedValueOnce(response({ ...required, draft: true, items: [
        { ...item, id: "200", unit_measure: "3617409708094129747" },
        { ...item, id: "201", unit_measure: "3617409708094129747" },
      ] })).mockResolvedValueOnce(response({ symbol: "item" }));
      expect((await call("update", { id: "100", public_notes: "Updated" })).isError).toBeFalsy();
      expect(fetchMock.mock.calls[1][0]).toContain("/unitofmeasurement/3617409708094129747/");
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(bodyAt(2).items.map((line: { unit_measure: string }) => line.unit_measure)).toEqual(["item", "item"]);
    });
    it("lets a changed contact supply fresh identity defaults while retaining explicit overrides", async () => {
      const contactField = singular === "estimate" ? "client" : singular === "delivery_note" ? "contact" : "supplier";
      fetchMock.mockResolvedValueOnce(response({ ...required, draft: true, items: [item],
        [`${contactField}_display_name`]: "Old name", [`${contactField}_vat_number`]: "OLD",
        billing_address: { address_line: "Old address", city: "Old city", zip: "000", country: "GB" },
      }));
      expect((await call("update", { id: "100", [contactField]: "999", [`${contactField}_display_name`]: "Explicit name" })).isError).toBeFalsy();
      expect(bodyAt(1)[contactField]).toBe("999");
      expect(bodyAt(1)[`${contactField}_display_name`]).toBe("Explicit name");
      expect(bodyAt(1)[`${contactField}_vat_number`]).toBeUndefined();
      expect(bodyAt(1).billing_address).toBeUndefined();
    });
    it("preserves caller line IDs and replaces the complete line list", async () => {
      fetchMock.mockResolvedValueOnce(response({ ...required, draft: true, items: [{ ...item, id: "200" }, { ...item, id: "201" }] }));
      const items = [{ ...item, id: "200", quantity: "3.25" }];
      expect((await call("update", { id: "100", items })).isError).toBeFalsy();
      expect(bodyAt(1).items).toEqual(items);
    });
    it("rejects full edits on issued documents even when draft:true is included", async () => {
      fetchMock.mockResolvedValueOnce(response({ draft: false }));
      expect((await call("update", { id: "100", draft: true, date: "2026-09-20" })).isError).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    it("rejects an empty update", async () => {
      expect((await call("update", { id: "100" })).isError).toBe(true);
      expect(fetchMock).not.toHaveBeenCalled();
    });
    it("deletes a draft using a bodyless DELETE", async () => {
      fetchMock.mockResolvedValueOnce(response(null, 204));
      expect((await call("delete", { id: "100" })).isError).toBeFalsy();
      expect(fetchMock.mock.calls[0][1].method).toBe("DELETE");
      expect(fetchMock.mock.calls[0][1].body).toBeUndefined();
    });
    if (voidable) it("voids with PUT to the action endpoint", async () => {
      await call("void", { id: "100" });
      expect(fetchMock.mock.calls[0][0]).toContain(`${path}100/void/`);
      expect(fetchMock.mock.calls[0][1].method).toBe("PUT");
      expect(bodyAt()).toEqual({ void: true });
    });
    it("merges email defaults and allows clearing CC without losing BCC", async () => {
      fetchMock.mockResolvedValueOnce(response({ to: "a@example.com", subject: "Default", message: "Hello", cc: "c@example.com", bcc: "b@example.com, d@example.com" }));
      expect((await client.callTool({ name: `send_${singular}_email`, arguments: { id: "100", subject: "Changed", cc: [], attach_pdf: false } })).isError).toBeFalsy();
      expect(fetchMock.mock.calls[0][0]).toContain(`${path}100/email/`);
      expect(fetchMock.mock.calls[1][1].method).toBe("POST");
      expect(bodyAt(1)).toEqual({ to: "a@example.com", subject: "Changed", message: "Hello", cc: [], bcc: ["b@example.com", "d@example.com"], attach_pdf: false });
    });
    it("returns an inline PDF resource", async () => {
      fetchMock.mockResolvedValueOnce(new Response("%PDF-test", { headers: { "Content-Type": "application/pdf" } }));
      const result = await client.callTool({ name: `export_${singular}_pdf`, arguments: { id: "100" } });
      expect(result.content).toEqual([{ type: "resource", resource: { uri: `elorus:/${path}100/pdf`, mimeType: "application/pdf", blob: Buffer.from("%PDF-test").toString("base64") } }]);
    });
    it("surfaces API failures without retrying writes", async () => {
      fetchMock.mockResolvedValueOnce(response({ detail: "Rejected" }, 400));
      const result = await call("create", { ...required, items: [item] });
      expect(result.isError).toBe(true);
      expect(JSON.stringify(result.content)).toContain("Rejected");
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    if (singular !== "goods_receipt") {
      it("validates replacement pricing against the stored calculator mode", async () => {
        fetchMock.mockResolvedValueOnce(response({ ...required, draft: true, calculator_mode: "total", items: [] }));
        expect((await call("update", { id: "100", items: [{ title: "Updated", quantity: "1", unit_measure: "item", unit_total: "12.00" }] })).isError).toBeFalsy();
        expect(bodyAt(1).calculator_mode).toBe("total");
      });
      it("rejects prices inconsistent with the effective mode", async () => {
        expect((await call("create", { ...required, calculator_mode: "total", items: [{ title: "Bad", unit_measure: "item", unit_value: "10" }] })).isError).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
      });
      it("rejects legacy bare tax IDs", async () => {
        expect((await call("create", { ...required, items: [{ ...item, taxes: ["123"] }] })).isError).toBe(true);
        expect(fetchMock).not.toHaveBeenCalled();
      });
    }
  });
}
