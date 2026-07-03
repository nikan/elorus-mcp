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
git clone https://github.com/your-org/elorus-mcp
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

Note: if the server is launched by an MCP client config (e.g. Claude Desktop/Code) with its own `env` block, that `env` block takes precedence and `.env` is not read — only `npm start` invokes `node --env-file=.env`. Keep credentials in one place to avoid the two silently diverging.

## Available tools

### Contacts
| Tool | Description |
|---|---|
| `list_contacts` | Search/filter contacts (clients, suppliers, or both) with pagination |
| `get_contact` | Fetch a contact by ID |
| `create_contact` | Create a client, supplier, or both |
| `update_contact` | Update fields on an existing contact |

### Invoices
| Tool | Description |
|---|---|
| `list_invoices` | Filter invoices by status, client, date range |
| `get_invoice` | Fetch an invoice by ID |
| `create_invoice` | Create a sales invoice with line items and taxes |
| `void_invoice` | Void an invoice (excluded from financial reports, cannot be edited or paid) |
| `send_invoice_email` | Email an invoice to the client |
| `export_invoice_pdf` | Export an invoice as a PDF (returns a download URL) |

### Bills (supplier purchase invoices)
| Tool | Description |
|---|---|
| `list_bills` | Filter supplier bills by supplier, status, or date range |
| `get_bill` | Fetch a bill by ID |
| `create_bill` | Create a supplier bill with line items and taxes |
| `update_bill` | Update fields on an existing bill |
| `void_bill` | Void a bill |

### Expenses
| Tool | Description |
|---|---|
| `list_expenses` | Filter expense records by supplier, category, or date range |
| `get_expense` | Fetch an expense by ID |
| `create_expense` | Record a new business expense. Line items use `expense_category`/`amount`/`description` (not the invoice-style `title`/`quantity`/`unit_value`) |
| `update_expense` | Update fields on an existing expense |
| `add_expense_attachment` | Attach a file (e.g. a receipt or supplier invoice PDF) to an existing expense, given base64-encoded content |
| `export_expense_pdf` | Export an expense document as a PDF (returns a download URL) |

### Credit notes (issued to clients)
| Tool | Description |
|---|---|
| `list_credit_notes` | Filter credit notes by client or date range |
| `create_credit_note` | Create a credit note to reduce or cancel an amount owed by a client |
| `apply_credit_note` | Apply a credit note against an open invoice |

### Supplier credits (received from suppliers)
| Tool | Description |
|---|---|
| `list_supplier_credits` | Filter supplier credits by supplier or date range |
| `create_supplier_credit` | Record a credit note received from a supplier |
| `apply_supplier_credit` | Apply a supplier credit against an open bill |

### Cash receipts (payments received from clients)
| Tool | Description |
|---|---|
| `list_cash_receipts` | Filter by client, invoice, or date range |
| `record_cash_receipt` | Record a payment received from a client, optionally linked to an invoice |
| `export_cash_receipt_pdf` | Export a cash receipt as a PDF (returns a download URL) |

### Cash payments (payments made to suppliers)
| Tool | Description |
|---|---|
| `list_cash_payments` | Filter by supplier, bill, or date range |
| `record_cash_payment` | Record a payment made to a supplier, optionally linked to a bill |
| `update_cash_payment` | Update fields (e.g. title/bank reference) on an existing payment |
| `delete_cash_payment` | Permanently delete a payment made to a supplier |

### Products
| Tool | Description |
|---|---|
| `list_products` | Search the products/services catalog |
| `get_product` | Fetch a product by ID |
| `create_product` | Add a product or service to the catalog |
| `update_product` | Update fields on an existing product or service |

### Notes and discussions
| Tool | Description |
|---|---|
| `list_private_notes` | List internal notes on a resource (visible only to organization members) |
| `create_private_note` | Add an internal note to a resource |
| `list_client_discussions` | List client-visible discussion messages on a resource |
| `create_client_discussion` | Post a client-visible message on an invoice or cash receipt |

### Configuration lookups
| Tool | Description |
|---|---|
| `list_taxes` | List tax rates configured in the organization |
| `list_document_types` | List document types (required for creating invoices, bills, credit notes, etc.) |
| `list_units` | List units of measurement (e.g. hours, pieces, kg) |
| `list_expense_categories` | List expense categories |

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
