# elorus-mcp

MCP server for the [Elorus](https://www.elorus.com/) invoicing and accounting platform. Enables AI assistants to create invoices, manage contacts, and query financial data through natural language.

## Setup

### Prerequisites

- Node.js 20+
- An Elorus account with an API key and organization ID

### Getting your credentials

1. **API key** — open the Elorus web app → User Profile → API key
2. **Organization ID** — open the Elorus web app → Settings → Organization → Organization ID

### Install

```bash
npx elorus-mcp
```

Or clone and build locally:

```bash
git clone https://github.com/nikan/elorus-mcp
cd elorus-mcp
npm install && npm run build
```

## Claude Desktop configuration

Add to `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "elorus": {
      "command": "npx",
      "args": ["elorus-mcp"],
      "env": {
        "ELORUS_API_KEY": "your-api-key",
        "ELORUS_ORG_ID": "your-org-id"
      }
    }
  }
}
```

## Claude Code configuration

```bash
claude mcp add elorus -e ELORUS_API_KEY=your-api-key -e ELORUS_ORG_ID=your-org-id -- npx elorus-mcp
```

### Local development

For local development, `npm start` loads environment variables from a `.env` file (via `node --env-file`) instead of requiring them to be passed inline. Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `ELORUS_API_KEY` | Yes | Your Elorus API key |
| `ELORUS_ORG_ID` | Yes | Your Elorus organization ID |
| `ELORUS_DEMO` | No | Set to `1` to send `X-Elorus-Demo: 1` on all requests (targets Elorus's demo/sandbox environment) |
| `ELORUS_ATTACHMENT_ROOT` | No | Directory this server is allowed to read local files from for `add_bill_attachment`/`add_expense_attachment`'s `file_path` option. Unset by default, which disables `file_path` entirely (use `content_base64` instead) |

Note: if the server is launched by an MCP client config (e.g. Claude Desktop/Code) with its own `env` block, that `env` block takes precedence and `.env` is not read — only `npm start` invokes `node --env-file=.env`. Keep credentials in one place to avoid the two silently diverging.

## Available tools

### Contacts
| Tool | Description |
|---|---|
| `list_contacts` | Search/filter contacts (clients, suppliers, or both) with pagination |
| `get_contact` | Fetch a contact by ID |
| `create_contact` | Create a client, supplier, or both |
| `update_contact` | Update fields on an existing contact |
| `delete_contact` | Permanently delete a contact |

### Invoices
| Tool | Description |
|---|---|
| `list_invoices` | Filter invoices by status, client, date range |
| `get_invoice` | Fetch an invoice by ID |
| `create_invoice` | Create a sales invoice with line items and taxes |
| `update_invoice` | Update fields on an existing invoice. `custom_id`/`draft`/`exchange_rate`/`payment_gateways`/`trackingcategories` are PATCH-safe at any status; every other field (date, client, items, currency_code, due_date, notes) requires the invoice to still be a draft and is applied via a full PUT — updating `items` this way replaces the entire line list |
| `delete_invoice` | Permanently delete an invoice (prefer `void_invoice` for issued invoices with financial history) |
| `void_invoice` | Void an invoice (excluded from financial reports, cannot be edited or paid) |
| `send_invoice_email` | Email an invoice to the client |
| `export_invoice_pdf` | Export an invoice as a PDF (returns the file content directly, base64-encoded) |

### Recurring invoices
| Tool | Description |
|---|---|
| `list_recurring_invoices` | Filter recurring invoice schedules by client, document type, or status |
| `get_recurring_invoice` | Fetch a recurring invoice schedule by ID |
| `create_recurring_invoice` | Create a schedule that automatically generates sales invoices at a fixed interval. `end_datetime` is required (no "never expires" option) and must fall within a bounded window relative to the start date and interval/period |
| `update_recurring_invoice` | Update fields (schedule, line items, etc.) on an existing recurring invoice schedule |
| `delete_recurring_invoice` | Permanently delete a recurring invoice schedule (invoices it already generated are unaffected) |
| `pause_recurring_invoice` | Pause a schedule so it stops generating new invoices |
| `resume_recurring_invoice` | Resume a paused schedule |

### Bills (supplier purchase invoices)
| Tool | Description |
|---|---|
| `list_bills` | Filter supplier bills by supplier, status, or date range |
| `get_bill` | Fetch a bill by ID |
| `create_bill` | Create a supplier bill with line items and taxes |
| `update_bill` | Update fields on an existing bill |
| `delete_bill` | Permanently delete a bill (prefer `void_bill` for issued bills with financial history) |
| `add_bill_attachment` | Deprecated — use `add_attachment` with `resource_type: "bill"`. Attach a file to an existing bill, via `file_path` (see `ELORUS_ATTACHMENT_ROOT` above) or `content_base64` |
| `void_bill` | Void a bill |
| `send_bill_email` | Email a self-billed bill (an invoice the organization issues to itself) |
| `export_bill_pdf` | Export a bill as a PDF — applies to self-billed invoices (returns the file content directly, base64-encoded) |

### Expenses
| Tool | Description |
|---|---|
| `list_expenses` | Filter expense records by supplier or date range |
| `get_expense` | Fetch an expense by ID |
| `create_expense` | Record a new business expense. Line items use `expense_category`/`amount`/`description` (not the invoice-style `title`/`quantity`/`unit_value`) |
| `update_expense` | Update fields on an existing expense |
| `delete_expense` | Permanently delete an expense record (expenses have no void state) |
| `add_expense_attachment` | Deprecated — use `add_attachment` with `resource_type: "expense"`. Attach a file to an existing expense, via `file_path` (see `ELORUS_ATTACHMENT_ROOT` above) or `content_base64` |
| `export_expense_pdf` | Export an expense document as a PDF (returns the file content directly, base64-encoded) |

### Credit notes (issued to clients)
| Tool | Description |
|---|---|
| `list_credit_notes` | Filter credit notes by client or date range |
| `get_credit_note` | Fetch a credit note by ID |
| `create_credit_note` | Create a credit note to reduce or cancel an amount owed by a client |
| `update_credit_note` | Update fields on an existing credit note. `custom_id`/`draft` are PATCH-safe at any status; every other field (date, client, items, currency_code, exchange_rate, notes) requires the credit note to still be a draft and is applied via a full PUT — updating `items` this way replaces the entire line list |
| `apply_credit_note` | Apply a credit note against an open invoice |
| `delete_credit_note` | Permanently delete a credit note (prefer `void_credit_note` for issued credit notes with financial history) |
| `void_credit_note` | Void a credit note |
| `send_credit_note_email` | Email a credit note to the client |
| `export_credit_note_pdf` | Export a credit note as a PDF (returns the file content directly, base64-encoded) |

### Supplier credits (received from suppliers)
| Tool | Description |
|---|---|
| `list_supplier_credits` | Filter supplier credits by supplier or date range |
| `get_supplier_credit` | Fetch a supplier credit by ID |
| `create_supplier_credit` | Record a credit note received from a supplier |
| `update_supplier_credit` | Update fields on an existing supplier credit. `custom_id`/`draft` are PATCH-safe at any status; every other field (date, supplier, items, currency_code, exchange_rate, notes, reference) requires the supplier credit to still be a draft and is applied via a full PUT — updating `items` this way replaces the entire line list |
| `apply_supplier_credit` | Apply a supplier credit against an open bill |
| `delete_supplier_credit` | Permanently delete a supplier credit (prefer `void_supplier_credit` for issued supplier credits with financial history) |
| `void_supplier_credit` | Void a supplier credit |
| `send_supplier_credit_email` | Email a supplier credit to the supplier |
| `export_supplier_credit_pdf` | Export a supplier credit as a PDF (returns the file content directly, base64-encoded) |

> **Known issue:** `create_supplier_credit`'s line items currently use the invoice-style `title`/`unit_value` shape, but live testing against a real organization shows the API actually requires `description` (not `title`) and a required `expense_category` per item — the same shape `create_bill` already handles correctly. As currently implemented, `create_supplier_credit` will be rejected by the real API with a 400 (`"expense_category": ["This field is required."]`). Not yet fixed — tracked as a follow-up.

### Cash receipts (payments received from clients)
| Tool | Description |
|---|---|
| `list_cash_receipts` | Filter by client, invoice, or date range |
| `get_cash_receipt` | Fetch a cash receipt by ID |
| `record_cash_receipt` | Record a payment received from a client, optionally linked to an invoice |
| `update_cash_receipt` | Update fields (e.g. title, date, amount) on an existing cash receipt |
| `delete_cash_receipt` | Permanently delete a payment received from a client |
| `export_cash_receipt_pdf` | Export a cash receipt as a PDF (returns the file content directly, base64-encoded) |

### Cash payments (payments made to suppliers)
| Tool | Description |
|---|---|
| `list_cash_payments` | Filter by supplier, bill, or date range |
| `get_cash_payment` | Fetch a cash payment by ID |
| `record_cash_payment` | Record a payment made to a supplier, optionally linked to a bill |
| `update_cash_payment` | Update fields (e.g. title/bank reference) on an existing payment |
| `delete_cash_payment` | Permanently delete a payment made to a supplier |
| `export_cash_payment_pdf` | Export a cash payment as a PDF (returns the file content directly, base64-encoded) |

### Products
| Tool | Description |
|---|---|
| `list_products` | Search the products/services catalog |
| `get_product` | Fetch a product by ID |
| `create_product` | Add a product or service to the catalog |
| `update_product` | Update fields on an existing product or service |
| `delete_product` | Permanently delete a product or service from the catalog |

### Notes and discussions
| Tool | Description |
|---|---|
| `list_private_notes` | List internal notes on a resource (visible only to organization members) — supports bills, cash payments/receipts, contacts, credit notes, delivery notes, estimates, expenses, goods receipts, invoices, products, projects, recurring invoices, and supplier credits |
| `create_private_note` | Add an internal note to a resource |
| `update_private_note` | Update the content of an existing internal note |
| `delete_private_note` | Permanently delete an internal note |
| `list_client_discussions` | List client-visible discussion messages on a resource — supports credit notes, estimates, invoices, and projects |
| `create_client_discussion` | Post a client-visible message on a resource |
| `update_client_discussion` | Update the content of an existing client-visible discussion message |
| `delete_client_discussion` | Permanently delete a client-visible discussion message |

### Attachments
Generic tools covering bills, cash payments/receipts, contacts, credit notes, delivery notes, estimates, expenses, invoices, projects, and supplier credits via a `resource_type` parameter.

| Tool | Description |
|---|---|
| `list_attachments` | List files attached to a resource |
| `get_attachment` | Fetch metadata for a single attachment |
| `add_attachment` | Attach a file to a resource, via `file_path` (see `ELORUS_ATTACHMENT_ROOT` above) or `content_base64` |
| `update_attachment` | Update an attachment's title or primary flag |
| `delete_attachment` | Permanently delete an attachment |
| `download_attachment` | Download an attachment's file content (any content type, unlike the PDF-only export tools) |

### Sent emails
| Tool | Description |
|---|---|
| `list_sent_emails` | List the log of emails Elorus has sent for a resource — supports bills, credit notes, delivery notes, estimates, goods receipts, invoices, and supplier credits |

### Applied credit
Generic tools for invoices, credit notes, and supplier credits.

| Tool | Description |
|---|---|
| `list_applied_credit` | List credit applications against a resource |
| `unapply_credit` | Remove a previously applied credit, restoring the balance on both sides |

### Configuration lookups
| Tool | Description |
|---|---|
| `list_taxes` | List tax rates configured in the organization |
| `get_tax` | Fetch a single tax rate by ID |
| `list_document_types` | List document types (required for creating invoices, bills, credit notes, etc.) |
| `get_document_type` | Fetch a single document type by ID |
| `list_units` | List units of measurement (e.g. hours, pieces, kg) |
| `list_expense_categories` | List expense categories |
| `get_expense_category` | Fetch a single expense category by ID |

## MCP Resources

Read-only resources that return up to 100 of the most recent records as JSON, without needing a tool call:

| Resource URI | Description |
|---|---|
| `elorus://contacts` | All contacts (clients and suppliers) |
| `elorus://invoices` | All sales invoices, most recent first |
| `elorus://cashreceipts` | All cash receipts (payments received from clients) |
| `elorus://cashpayments` | All cash payments (payments made to suppliers) |
| `elorus://expenses` | All expense records |
| `elorus://bills` | All supplier bills |
| `elorus://products` | All products and services in the catalog |

## Example prompts

- *"Create an invoice for Acme Corp for 5 hours of consulting at €150/hour with 24% VAT"*
- *"What invoices are overdue this month?"*
- *"Look up the contact for Elorus FC and show their details"*
- *"Add a new product called 'Website Design' at €800 with standard VAT"*
- *"Record a €45 office supplies expense from Staples"*
- *"What bills are overdue from our suppliers?"*
- *"Apply this credit note to invoice #1042"*

## Notes

- All monetary values are strings (e.g. `"1500.00"`) to avoid floating-point precision issues
- Use `list_taxes`, `list_document_types`, `list_units`, and `list_expense_categories` to look up valid IDs before creating invoices, bills, expenses, credit notes, or products (bills don't use a document type — only invoices, credit notes, and estimates do)
- Invoice/credit-note/supplier-credit line items use `title`/`quantity`/`unit_value` (or `unit_total`, depending on `calculator_mode`); bill line items also require `expense_category`; expense line items use a different shape: `expense_category`/`amount`/`description`
- Elorus does not provide idempotency keys — query before creating to avoid duplicates
- Pagination params: `page` (default 1) and `page_size` (default 20, max 100)

## Development

Architecture, conventions, and build/test commands for contributors (human or AI) are documented in [`AGENTS.md`](AGENTS.md) (also loaded by Claude Code via `CLAUDE.md`). Known gaps against the full Elorus API surface, and the plan to close them, are tracked in [`project/AUDIT.md`](project/AUDIT.md) and [`project/api-coverage-plan.md`](project/api-coverage-plan.md).
