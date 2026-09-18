import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerExpenseTools } from "../../tools/expenses.js";

/**
 * create_expense and delete_expense already have dedicated coverage in
 * tool-schemas.test.ts (they were the tools that surfaced the superRefine
 * shape-introspection bug this suite guards against). This file covers the
 * remaining expense tools: list, get, update, attachments, and PDF export.
 */

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerExpenseTools(server, elorusClient);

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

function mockFetchPdf(bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46])) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/pdf", "content-length": String(bytes.length) }),
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  });
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

describe("expense tools (list/get/update/attachments/pdf)", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("list_expenses GETs /expenses/ with a supplier filter", async () => {
    const mockFetch = mockFetchWith({ count: 0, results: [] });
    const client = await connectedClient(elorusClient);

    await client.callTool({
      name: "list_expenses",
      arguments: { supplier: "sup-1" },
    });

    const [url] = mockFetch.mock.calls[0] as [string];
    const parsed = new URL(url);
    expect(parsed.pathname).toBe("/v1.2/expenses/");
    expect(parsed.searchParams.get("supplier")).toBe("sup-1");
  });

  it("get_expense fetches a single expense by id", async () => {
    const mockFetch = mockFetchWith({ id: "exp-1", date: "2026-07-01" });
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "get_expense", arguments: { id: "exp-1" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/expenses/exp-1/");
  });

  it("update_expense fetches the current record, merges fields, and PUTs", async () => {
    const current = { id: "exp-1", date: "2026-07-01", reference: "" };
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
        json: () => Promise.resolve({ ...current, reference: "REIMB-1" }),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_expense",
      arguments: { id: "exp-1", reference: "REIMB-1" },
    });

    expect(result.isError).toBeFalsy();
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    expect(JSON.parse(putOptions.body as string)).toMatchObject({ reference: "REIMB-1" });
  });

  it("update_expense with expense_category applies the category to every item from a single fetched snapshot", async () => {
    const current = {
      id: "exp-1",
      date: "2026-07-01",
      items: [
        { id: "item-1", expense_category: "old-cat", amount: "10.00" },
        { id: "item-2", expense_category: "old-cat", amount: "20.00" },
      ],
    };
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
        json: () => Promise.resolve(current),
      });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "update_expense",
      arguments: { id: "exp-1", expense_category: "new-cat" },
    });

    expect(result.isError).toBeFalsy();
    // Exactly one GET (inside mergePut) + one PUT — no separate pre-fetch that could race
    // with a concurrent edit landing between two reads of the same expense.
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [, putOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(putOptions.method).toBe("PUT");
    const body = JSON.parse(putOptions.body as string);
    expect(body.items).toEqual([
      { id: "item-1", expense_category: "new-cat", amount: "10.00" },
      { id: "item-2", expense_category: "new-cat", amount: "20.00" },
    ]);
  });

  it("add_expense_attachment uploads the file then PATCHes it primary by default", async () => {
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
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "add_expense_attachment",
      arguments: { id: "exp-1", filename: "receipt.pdf", content_base64: "AAAA" },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const [uploadUrl, uploadOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(uploadUrl).toBe("https://api.elorus.com/v1.2/expenses/exp-1/attachments/");
    expect(uploadOptions.method).toBe("POST");
    const [patchUrl, patchOptions] = mockFetch.mock.calls[1] as [string, RequestInit];
    expect(patchUrl).toBe("https://api.elorus.com/v1.2/expenses/exp-1/attachments/att-1/");
    expect(JSON.parse(patchOptions.body as string)).toEqual({ primary: true });
  });

  it("add_expense_attachment skips the primary PATCH when primary is false", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 201,
      statusText: "Created",
      headers: new Headers(),
      json: () => Promise.resolve({ id: "att-1", primary: false }),
    });
    vi.stubGlobal("fetch", mockFetch);
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({
      name: "add_expense_attachment",
      arguments: { id: "exp-1", filename: "receipt.pdf", content_base64: "AAAA", primary: false },
    });

    expect(result.isError).toBeFalsy();
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("add_expense_attachment reads from file_path when given, inferring the filename from its basename", async () => {
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
    const client = await connectedClient(elorusClient);

    const tmpFile = path.join(os.tmpdir(), `elorus-mcp-test-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, "fake pdf bytes");
    const previousRoot = process.env.ELORUS_ATTACHMENT_ROOT;
    process.env.ELORUS_ATTACHMENT_ROOT = os.tmpdir();
    try {
      const result = await client.callTool({
        name: "add_expense_attachment",
        arguments: { id: "exp-1", file_path: tmpFile },
      });

      expect(result.isError).toBeFalsy();
      const [, uploadOptions] = mockFetch.mock.calls[0] as [string, RequestInit];
      const form = uploadOptions.body as FormData;
      const file = form.get("file") as File;
      expect(file.name).toBe(path.basename(tmpFile));
      expect(await file.text()).toBe("fake pdf bytes");
    } finally {
      fs.unlinkSync(tmpFile);
      process.env.ELORUS_ATTACHMENT_ROOT = previousRoot;
    }
  });

  it("add_expense_attachment rejects a file_path outside ELORUS_ATTACHMENT_ROOT", async () => {
    const client = await connectedClient(elorusClient);
    const tmpFile = path.join(os.tmpdir(), `elorus-mcp-test-outside-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, "fake pdf bytes");
    const previousRoot = process.env.ELORUS_ATTACHMENT_ROOT;
    process.env.ELORUS_ATTACHMENT_ROOT = path.join(os.tmpdir(), `elorus-mcp-allowlist-${Date.now()}`);
    fs.mkdirSync(process.env.ELORUS_ATTACHMENT_ROOT, { recursive: true });
    try {
      const result = await client.callTool({
        name: "add_expense_attachment",
        arguments: { id: "exp-1", file_path: tmpFile },
      });

      expect(result.isError).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
      fs.rmSync(process.env.ELORUS_ATTACHMENT_ROOT, { recursive: true, force: true });
      process.env.ELORUS_ATTACHMENT_ROOT = previousRoot;
    }
  });

  it("add_expense_attachment rejects file_path when ELORUS_ATTACHMENT_ROOT is not configured", async () => {
    const client = await connectedClient(elorusClient);
    const tmpFile = path.join(os.tmpdir(), `elorus-mcp-test-noroot-${Date.now()}.pdf`);
    fs.writeFileSync(tmpFile, "fake pdf bytes");
    const previousRoot = process.env.ELORUS_ATTACHMENT_ROOT;
    delete process.env.ELORUS_ATTACHMENT_ROOT;
    try {
      const result = await client.callTool({
        name: "add_expense_attachment",
        arguments: { id: "exp-1", file_path: tmpFile },
      });

      expect(result.isError).toBe(true);
    } finally {
      fs.unlinkSync(tmpFile);
      process.env.ELORUS_ATTACHMENT_ROOT = previousRoot;
    }
  });

  it("add_expense_attachment throws when neither file_path nor content_base64 is given", async () => {
    const client = await connectedClient(elorusClient);
    const mockFetch = mockFetchWith({});

    const result = await client.callTool({
      name: "add_expense_attachment",
      arguments: { id: "exp-1", filename: "receipt.pdf" },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("export_expense_pdf GETs the pdf sub-resource and returns a base64 resource blob", async () => {
    const mockFetch = mockFetchPdf();
    const client = await connectedClient(elorusClient);

    const result = await client.callTool({ name: "export_expense_pdf", arguments: { id: "exp-1" } });

    expect(result.isError).toBeFalsy();
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toBe("https://api.elorus.com/v1.2/expenses/exp-1/pdf/");
    const content = result.content as Array<{ type: string; resource: { mimeType: string } }>;
    expect(content[0].type).toBe("resource");
    expect(content[0].resource.mimeType).toBe("application/pdf");
  });
});
