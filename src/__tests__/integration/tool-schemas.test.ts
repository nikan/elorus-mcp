import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerExpenseTools } from "../../tools/expenses.js";
import { registerBillTools } from "../../tools/bills.js";
import { registerCreditNoteTools } from "../../tools/credit-notes.js";
import { registerInvoiceTools } from "../../tools/invoices.js";
import { registerSupplierCreditTools } from "../../tools/supplier-credits.js";
import { registerContactTools } from "../../tools/contacts.js";

/**
 * These tools previously built their inputSchema with
 * z.object({...}).superRefine(...). The MCP SDK's shape-introspection only
 * reads .shape off a plain ZodObject, so a ZodEffects has no extractable
 * shape and tools/list exposed an empty `properties: {}` — any array/object
 * argument then arrived at the handler as an unparsed string. This suite
 * drives a real Client/Server pair over InMemoryTransport so it exercises
 * that exact SDK code path instead of just the handler function directly.
 */

async function connectedClient(elorusClient: ElorusClient) {
  const server = new McpServer({ name: "elorus-mcp-test", version: "0.0.0" });
  registerExpenseTools(server, elorusClient);
  registerBillTools(server, elorusClient);
  registerCreditNoteTools(server, elorusClient);
  registerInvoiceTools(server, elorusClient);
  registerSupplierCreditTools(server, elorusClient);
  registerContactTools(server, elorusClient);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "0.0.0" });

  await Promise.all([
    client.connect(clientTransport),
    server.connect(serverTransport),
  ]);

  return client;
}

function mockPostCapture(responseBody: unknown = { id: "created" }) {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 201,
    statusText: "Created",
    headers: new Headers(),
    json: () => Promise.resolve(responseBody),
  });
  vi.stubGlobal("fetch", mockFetch);
  return mockFetch;
}

describe("tool-list schema generation for create_* tools", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  // Every tool below has at least one required field except create_contact, whose fields
  // are all individually optional — the "company OR first/last name" rule is a cross-field
  // check enforced in the handler, not a per-field requirement.
  const createToolNames = [
    { name: "create_expense", hasRequiredFields: true },
    { name: "create_bill", hasRequiredFields: true },
    { name: "create_credit_note", hasRequiredFields: true },
    { name: "create_invoice", hasRequiredFields: true },
    { name: "create_supplier_credit", hasRequiredFields: true },
    { name: "create_contact", hasRequiredFields: false },
  ];

  it.each(createToolNames)(
    "$name exposes a non-empty input schema",
    async ({ name, hasRequiredFields }) => {
      const client = await connectedClient(elorusClient);
      const { tools } = await client.listTools();

      const tool = tools.find((t) => t.name === name);
      expect(tool).toBeDefined();
      expect(Object.keys(tool!.inputSchema.properties ?? {}).length).toBeGreaterThan(0);
      if (hasRequiredFields) {
        expect(tool!.inputSchema.required?.length ?? 0).toBeGreaterThan(0);
      }
    }
  );

  it("create_expense schema requires date, documenttype, and items", async () => {
    const client = await connectedClient(elorusClient);
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "create_expense")!;

    expect(tool.inputSchema.required).toEqual(
      expect.arrayContaining(["date", "documenttype", "items"])
    );
    expect(tool.inputSchema.properties).toHaveProperty("items");
  });

  it("create_expense items schema matches the flat expense API shape (expense_category, amount, description) not the invoice line-item shape", async () => {
    const client = await connectedClient(elorusClient);
    const { tools } = await client.listTools();
    const tool = tools.find((t) => t.name === "create_expense")!;

    const itemsSchema = tool.inputSchema.properties?.items as {
      items?: { properties?: Record<string, unknown>; required?: string[] };
    };
    const itemProps = itemsSchema.items?.properties ?? {};

    expect(itemProps).toHaveProperty("expense_category");
    expect(itemProps).toHaveProperty("amount");
    expect(itemProps).not.toHaveProperty("title");
    expect(itemProps).not.toHaveProperty("quantity");
    expect(itemProps).not.toHaveProperty("unit_value");
    expect(itemsSchema.items?.required).toEqual(
      expect.arrayContaining(["expense_category", "amount"])
    );
  });
});

describe("create_expense request shape (through the real tool-call path)", () => {
  const elorusClient = new ElorusClient("fixture-key", "fixture-org");

  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("POSTs the expense-shaped item (expense_category/amount/description) to /expenses/", async () => {
    const client = await connectedClient(elorusClient);
    const mockFetch = mockPostCapture({
      id: "3573038505774810569",
      date: "2026-07-15",
      supplier: "3572475991324362252",
      items: [{ expense_category: "cat-1", amount: "1000.00", description: "Expense" }],
    });

    const result = await client.callTool({
      name: "create_expense",
      arguments: {
        date: "2026-07-15",
        documenttype: "doctype-1",
        supplier: "3572475991324362252",
        currency_code: "GBP",
        calculator_mode: "initial",
        items: [{ expense_category: "cat-1", amount: "1000.00", description: "Expense" }],
      },
    });

    expect(result.isError).toBeFalsy();

    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.elorus.com/v1.2/expenses/");
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string);
    expect(body.items).toEqual([
      { expense_category: "cat-1", amount: "1000.00", description: "Expense" },
    ]);
    // Confirms the array survived SDK argument parsing as a real array, not a stringified blob —
    // the exact failure mode of the superRefine shape-introspection bug.
    expect(Array.isArray(body.items)).toBe(true);
  });

  it("converts item.taxes from an array of tax IDs to the {tax, auto_calculate} shape the API expects", async () => {
    const client = await connectedClient(elorusClient);
    const mockFetch = mockPostCapture({
      id: "3573038505774810569",
      date: "2026-07-15",
      items: [{ expense_category: "cat-1", amount: "100.00" }],
    });

    const result = await client.callTool({
      name: "create_expense",
      arguments: {
        date: "2026-07-15",
        documenttype: "doctype-1",
        items: [{ expense_category: "cat-1", amount: "100.00", taxes: ["tax-1"] }],
      },
    });

    expect(result.isError).toBeFalsy();

    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.items).toEqual([
      {
        expense_category: "cat-1",
        amount: "100.00",
        taxes: [{ tax: "tax-1", auto_calculate: true }],
      },
    ]);
  });

  it("rejects an item missing amount when calculator_mode is 'initial' without ever reaching the API", async () => {
    const client = await connectedClient(elorusClient);
    const mockFetch = mockPostCapture();

    const result = await client.callTool({
      name: "create_expense",
      arguments: {
        date: "2026-07-15",
        documenttype: "doctype-1",
        items: [{ expense_category: "cat-1", description: "no amount" }],
      },
    });

    expect(result.isError).toBe(true);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
