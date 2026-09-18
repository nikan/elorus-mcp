import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerAttachmentTools } from "../../tools/attachments.js";

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerAttachmentTools(server, elorusClient);

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

describe("generic attachment tools", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_attachments GETs the resource's nested attachments sub-resource", async () => {
    const mockFetch = mockFetchWith([]);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_attachments",
      arguments: { resource_type: "invoice", resource_id: "inv-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/attachments/");
  });

  it("get_attachment GETs the attachment's own path", async () => {
    const mockFetch = mockFetchWith({ id: "att-1", title: "Receipt" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "get_attachment",
      arguments: { resource_type: "bill", resource_id: "bill-1", attachment_id: "att-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/bills/bill-1/attachments/att-1/");
  });

  it("rejects a resource_type not in the attachments matrix (e.g. 'goodsreceipt') without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "list_attachments",
      arguments: { resource_type: "goodsreceipt", resource_id: "gr-1" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("add_attachment uploads to the resource's nested attachments sub-resource then PATCHes it primary by default", async () => {
    const client = await connectedClient(elorusClient);
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        statusText: "Created",
        headers: new Headers(),
        json: () => Promise.resolve({ id: "att-1", primary: false }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: "OK",
        headers: new Headers(),
        json: () => Promise.resolve({ id: "att-1", primary: true }),
      });
    vi.stubGlobal("fetch", mockFetch);

    const result = await client.callTool({
      name: "add_attachment",
      arguments: {
        resource_type: "contact",
        resource_id: "c-1",
        filename: "id-card.pdf",
        content_base64: "AAAA",
      },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [uploadUrl, uploadOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(uploadUrl).toBe("https://api.elorus.com/v1.2/contacts/c-1/attachments/");
    expect(uploadOptions.method).toBe("POST");
    const [patchUrl, patchOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(patchUrl).toBe("https://api.elorus.com/v1.2/contacts/c-1/attachments/att-1/");
    expect(JSON.parse(patchOptions.body as string)).toEqual({ primary: true });
  });

  it("add_attachment reads from file_path when given, inferring the filename from its basename", async () => {
    const client = await connectedClient(elorusClient);
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      statusText: "Created",
      headers: new Headers(),
      json: () => Promise.resolve({ id: "att-1", primary: false }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const tmpFile = path.join(os.tmpdir(), `elorus-mcp-test-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, "fake attachment bytes");
    const previousRoot = process.env.ELORUS_ATTACHMENT_ROOT;
    process.env.ELORUS_ATTACHMENT_ROOT = os.tmpdir();
    try {
      const result = await client.callTool({
        name: "add_attachment",
        arguments: { resource_type: "expense", resource_id: "exp-1", file_path: tmpFile, primary: false },
      });

      expect(result.isError).toBeFalsy();
      const [, uploadOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
      const form = uploadOptions.body as FormData;
      const file = form.get("file") as File;
      expect(file.name).toBe(path.basename(tmpFile));
    } finally {
      fs.unlinkSync(tmpFile);
      process.env.ELORUS_ATTACHMENT_ROOT = previousRoot;
    }
  });

  it("update_attachment PATCHes only the provided fields", async () => {
    const mockFetch = mockFetchWith({ id: "att-1", title: "Renamed", primary: true });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_attachment",
      arguments: { resource_type: "invoice", resource_id: "inv-1", attachment_id: "att-1", title: "Renamed" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/attachments/att-1/");
    expect(options.method).toBe("PATCH");
    expect(JSON.parse(options.body as string)).toEqual({ title: "Renamed" });
  });

  it("update_attachment rejects a call with neither title nor primary, without reaching the API", async () => {
    const mockFetch = mockFetchWith({});
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_attachment",
      arguments: { resource_type: "invoice", resource_id: "inv-1", attachment_id: "att-1" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("delete_attachment DELETEs the attachment's own path", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      statusText: "No Content",
      headers: new Headers(),
      json: () => Promise.reject(new Error("no body")),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "delete_attachment",
      arguments: { resource_type: "invoice", resource_id: "inv-1", attachment_id: "att-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/invoices/inv-1/attachments/att-1/");
    expect(options.method).toBe("DELETE");
  });

  // Path confirmed against the Elorus sandbox: an uploaded attachment's create response
  // returns file_url at exactly this path, which 307s to Azure Blob Storage — see
  // project/api-coverage-plan.md.
  it("download_attachment GETs the attachment's file sub-path with a wildcard Accept header and returns a base64 blob of whatever content type the server sends", async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff]);
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "image/jpeg", "content-length": String(bytes.length) }),
      arrayBuffer: () => Promise.resolve(bytes.buffer),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "download_attachment",
      arguments: { resource_type: "bill", resource_id: "bill-1", attachment_id: "att-1" },
    });

    expect(result.isError).toBeFalsy();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/bills/bill-1/attachments/att-1/file/");
    expect((options.headers as Record<string, string>).Accept).toBe("*/*");
    const content = result.content as Array<{ type: string; resource: { mimeType: string; blob: string } }>;
    expect(content[0].resource.mimeType).toBe("image/jpeg");
  });
});
