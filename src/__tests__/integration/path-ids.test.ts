import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElorusClient } from "../../client.js";
import { registerContactTools } from "../../tools/contacts.js";
import { registerInvoiceTools } from "../../tools/invoices.js";
import { registerRecurringInvoiceTools } from "../../tools/recurring-invoices.js";
import { registerProductTools } from "../../tools/products.js";
import { registerConfigTools } from "../../tools/config.js";
import { registerCashReceiptTools } from "../../tools/cash-receipts.js";
import { registerCashPaymentTools } from "../../tools/cash-payments.js";
import { registerCreditNoteTools } from "../../tools/credit-notes.js";
import { registerSupplierCreditTools } from "../../tools/supplier-credits.js";
import { registerExpenseTools } from "../../tools/expenses.js";
import { registerBillTools } from "../../tools/bills.js";
import { registerNoteTools } from "../../tools/notes.js";
import { registerAttachmentTools } from "../../tools/attachments.js";
import { registerSentEmailTools } from "../../tools/sent-emails.js";
import { registerAppliedCreditTools } from "../../tools/applied-credit.js";
import { registerEstimateTools } from "../../tools/estimates.js";
import { registerDeliveryNoteTools } from "../../tools/delivery-notes.js";
import { registerGoodsReceiptTools } from "../../tools/goods-receipts.js";
import { registerSequenceTools } from "../../tools/sequences.js";

/** Top-level tool parameters that are interpolated into API URL paths. */
const PATH_ID_PARAMS = ["id", "resource_id", "attachment_id", "note_id", "discussion_id", "applied_credit_id", "document_type_id"];

const TRAVERSAL_IDS = ["../contacts/5", "..", "5/../../contacts/5", "5/attachments", "5?x=1", "5#frag", "%2e%2e/contacts/5", "5 ", "٥"];

describe("path ID validation", () => {
  let client: Client;
  let server: McpServer;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response("{}", { headers: { "Content-Type": "application/json" } }))
    );
    vi.stubGlobal("fetch", fetchMock);
    server = new McpServer({ name: "test", version: "1" });
    const elorus = new ElorusClient("key", "org");
    for (const register of [
      registerContactTools, registerInvoiceTools, registerRecurringInvoiceTools, registerProductTools,
      registerConfigTools, registerCashReceiptTools, registerCashPaymentTools, registerCreditNoteTools,
      registerSupplierCreditTools, registerExpenseTools, registerBillTools, registerNoteTools,
      registerAttachmentTools, registerSentEmailTools, registerAppliedCreditTools, registerEstimateTools,
      registerDeliveryNoteTools, registerGoodsReceiptTools, registerSequenceTools,
    ]) {
      register(server, elorus);
    }
    client = new Client({ name: "test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([client.connect(a), server.connect(b)]);
  });
  afterEach(async () => {
    await client.close();
    await server.close();
    vi.unstubAllGlobals();
  });

  it("restricts every path-ID parameter of every tool to digits", async () => {
    const { tools } = await client.listTools();
    const checked: string[] = [];
    for (const tool of tools) {
      for (const [name, schema] of Object.entries(tool.inputSchema.properties ?? {})) {
        if (!PATH_ID_PARAMS.includes(name)) continue;
        expect((schema as { pattern?: string }).pattern, `${tool.name}.${name}`).toBe("^\\d+$");
        checked.push(`${tool.name}.${name}`);
      }
    }
    // Guards against the loop silently checking nothing if tools or param names are renamed.
    expect(checked.length).toBeGreaterThan(100);
  });

  it.each(TRAVERSAL_IDS)("delete_estimate rejects %j without any fetch call", async (id) => {
    const result = await client.callTool({ name: "delete_estimate", arguments: { id } });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("numeric Elorus ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["get_invoice", { id: "../contacts/5" }],
    ["update_invoice", { id: "../contacts/5", custom_id: "x" }],
    ["void_bill", { id: "../contacts/5" }],
    ["send_estimate_email", { id: "../contacts/5" }],
    ["export_expense_pdf", { id: "../contacts/5" }],
    ["update_contact", { id: "../invoices/5", company: "Acme" }],
    ["pause_recurring_invoice", { id: "../contacts/5" }],
    ["apply_credit_note", { id: "../contacts/5", invoice: "1", amount: "1.00" }],
    ["get_document_type", { id: "../contacts/5" }],
    ["list_private_notes", { resource_type: "invoice", resource_id: "../contacts/5" }],
    ["delete_private_note", { resource_type: "invoice", resource_id: "1", note_id: "../../contacts/5" }],
    ["delete_client_discussion", { resource_type: "invoice", resource_id: "1", discussion_id: "../5" }],
    ["download_attachment", { resource_type: "invoice", resource_id: "1", attachment_id: "../../../contacts/5" }],
    ["add_attachment", { resource_type: "bill", resource_id: "../contacts/5", filename: "a.pdf", content_base64: "AAAA" }],
    ["list_sent_emails", { resource_type: "invoice", resource_id: "../contacts/5" }],
    ["unapply_credit", { resource_type: "invoice", resource_id: "1", applied_credit_id: "../5" }],
    ["list_document_type_sequences", { document_type_id: "../contacts/5" }],
    ["rename_document_type_sequence", { document_type_id: "../contacts/5", old_name: "A", new_name: "B" }],
  ])("%s rejects a traversal-style ID without any fetch call", async (name, args) => {
    const result = await client.callTool({ name, arguments: args });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("numeric Elorus ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("still accepts numeric IDs, including ones beyond Number.MAX_SAFE_INTEGER", async () => {
    const result = await client.callTool({ name: "delete_estimate", arguments: { id: "3617409708094129747" } });
    expect(result.isError).toBeFalsy();
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.elorus.com/v1.2/estimates/3617409708094129747/");
  });
});

describe("ElorusClient path guard", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  const elorus = new ElorusClient("key", "org");

  beforeEach(() => {
    fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response("{}", { headers: { "Content-Type": "application/json" } }))
    );
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  const unsafe = ["/estimates/../contacts/5/", "/estimates/./5/", "/estimates/5?x=1", "/estimates/5#f", "/estimates/%2e%2e/5/", "/estimates\\..\\5/", "estimates/5/"];

  it.each(unsafe)("rejects %j on every method before fetching", async (path) => {
    await expect(elorus.get(path)).rejects.toThrow(/Invalid Elorus API path/);
    await expect(elorus.post(path, {})).rejects.toThrow(/Invalid Elorus API path/);
    await expect(elorus.put(path, {})).rejects.toThrow(/Invalid Elorus API path/);
    await expect(elorus.patch(path, {})).rejects.toThrow(/Invalid Elorus API path/);
    await expect(elorus.delete(path)).rejects.toThrow(/Invalid Elorus API path/);
    await expect(elorus.getBinary(path)).rejects.toThrow(/Invalid Elorus API path/);
    await expect(elorus.postMultipart(path, new FormData())).rejects.toThrow(/Invalid Elorus API path/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
