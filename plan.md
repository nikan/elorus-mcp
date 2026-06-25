# Elorus MCP Server — Implementation Plan

## Overview

Build a Model Context Protocol (MCP) server that exposes the Elorus invoicing and accounting platform to AI assistants. This enables LLMs to create invoices, manage contacts, query payments, and handle financial workflows on behalf of users — all through natural language.

**Target API:** Elorus REST API v1.2  
**Auth model:** API key + Organization ID (per-user, per-org)  
**Base URL:** `https://api.elorus.com/v1.2/`

---

## Goals

1. Cover the core surface of the Elorus v1.2 API with MCP tools.
2. Make each tool safe, typed, and LLM-friendly (clear names, descriptions, and error messages).
3. Ship as an npm package (`elorus-mcp`) usable in Claude Desktop, Claude Code, and any MCP-compatible host.
4. Expose read-only resources (contacts list, invoice list) as MCP Resources, and write/action operations as MCP Tools.

---

# Immediate Plan

## API Surface → MCP Mapping

### Resources (read-only, subscribable)

| MCP Resource | Elorus Endpoint | Description |
|---|---|---|
| `elorus://contacts` | `GET /contacts/` | Paginated contact list |
| `elorus://invoices` | `GET /invoices/` | Paginated invoice list |
| `elorus://cashreceipts` | `GET /cashreceipts/` | Payments received from clients |
| `elorus://cashpayments` | `GET /cashpayments/` | Payments made to suppliers |
| `elorus://expenses` | `GET /expenses/` | Expense records |
| `elorus://bills` | `GET /bills/` | Supplier bills (purchase invoices) |
| `elorus://products` | `GET /products/` | Products and services catalog |

### Tools (write + actions)

#### Contacts
- `create_contact` — Create a client, supplier, or both
- `get_contact` — Fetch a single contact by ID
- `update_contact` — Update contact fields
- `list_contacts` — Search/filter contacts

#### Invoices
- `create_invoice` — Create a sales invoice with line items, taxes, currency
- `get_invoice` — Fetch invoice by ID
- `list_invoices` — Filter by status, client, date range
- `send_invoice_email` — Email invoice to client
- `export_invoice_pdf` — Export invoice as PDF (returns URL)
- `void_invoice` — Mark invoice as void

#### Credit Notes
- `create_credit_note` — Create a credit note
- `apply_credit_note` — Associate credit note with open invoices
- `list_credit_notes` — Filter credit notes

#### Products
- `create_product` — Create a product or service
- `get_product` — Fetch a product by ID
- `update_product` — Update product fields (price, tax, description)
- `list_products` — Search/filter products catalog

#### Cash Receipts (Income Payments)
- `record_cash_receipt` — Record a payment received against an invoice
- `list_cash_receipts` — List receipts by client, date, method
- `export_cash_receipt_pdf` — Export payment receipt as PDF

#### Cash Payments (Outgoing Payments)
- `record_cash_payment` — Record a payment made against a bill
- `list_cash_payments` — List outgoing payments by supplier, date, method

#### Supplier Credits
- `create_supplier_credit` — Create a supplier-side credit note
- `apply_supplier_credit` — Associate supplier credit with open bills
- `list_supplier_credits` — Filter supplier credits

#### Expenses
- `create_expense` — Record a new expense
- `get_expense` — Fetch an expense by ID
- `update_expense` — Update expense fields
- `list_expenses` — Filter expenses by date, category, supplier
- `export_expense_pdf` — Export expense document as PDF

#### Bills
- `create_bill` — Create a supplier bill (purchase invoice)
- `get_bill` — Fetch a bill by ID
- `update_bill` — Update bill fields
- `list_bills` — Filter bills by status, supplier, date range
- `void_bill` — Mark a bill as void

#### Notes & Discussions
- `create_private_note` — Add internal note to contact/invoice/payment
- `list_private_notes` — Fetch notes for a resource
- `create_client_discussion` — Post a client-visible comment
- `list_client_discussions` — Fetch discussion thread

#### Taxes & Config
- `list_taxes` — Retrieve configured tax rates
- `list_document_types` — Retrieve document type options
- `list_units` — List custom units of measurement
- `list_expense_categories` — Retrieve expense categories

---

## Architecture

```
elorus-mpc/
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── client.ts         # Elorus API HTTP client (fetch-based)
│   ├── auth.ts           # API key + org ID injection
│   ├── resources/        # MCP Resource handlers
│   │   ├── contacts.ts
│   │   ├── invoices.ts
│   │   ├── cash-receipts.ts
│   │   ├── cash-payments.ts
│   │   ├── expenses.ts
│   │   ├── bills.ts
│   │   └── products.ts
│   ├── tools/            # MCP Tool handlers
│   │   ├── contacts.ts
│   │   ├── invoices.ts
│   │   ├── products.ts
│   │   ├── cash-receipts.ts
│   │   ├── cash-payments.ts
│   │   ├── credit-notes.ts
│   │   ├── supplier-credits.ts
│   │   ├── expenses.ts
│   │   ├── bills.ts
│   │   ├── notes.ts
│   │   └── config.ts
│   └── schemas/          # Zod schemas for all request/response types
│       └── ...
├── package.json
├── tsconfig.json
└── README.md
```

**Runtime:** Node.js 20+, TypeScript  
**MCP SDK:** `@modelcontextprotocol/sdk`  
**Validation:** Zod (all tool inputs validated before API calls)  
**Transport:** stdio (default) + optional SSE for hosted deployments

---

## Configuration

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

---

## Implementation Phases

### Phase 1 — Foundation
- [x] Scaffold TypeScript project with MCP SDK
- [x] Implement `client.ts`: base fetch wrapper, auth headers, error normalization
- [x] Implement `list_contacts`, `create_contact`, `get_contact` tools
- [x] Implement `list_invoices`, `create_invoice`, `get_invoice` tools
- [x] Implement `list_products`, `create_product`, `get_product` tools
- [ ] Wire up stdio transport and test in Claude Desktop (needs live credentials)
- [x] README: setup, auth, basic usage

### Phase 2 — Core Workflows
- [ ] Add invoice email + PDF export tools
- [ ] Add cash receipts (income payments) + PDF export
- [ ] Add cash payments (outgoing payments)
- [ ] Add credit notes + application
- [ ] Add supplier credits + application
- [ ] Add expenses CRUD + PDF export
- [ ] Add bills CRUD
- [ ] Add MCP Resources for contacts, invoices, cash receipts, cash payments, expenses, bills, and products (read-only, paginated)
- [ ] Private notes and client discussions
- [ ] Taxes, document types, units, and expense categories config tools

### Phase 3 — Quality & Publish
- [ ] Zod schema validation for all tool inputs
- [ ] Structured error messages (Elorus error codes → human-readable)
- [ ] Unit tests for client + schema layer
- [ ] Integration test suite (against Elorus sandbox or recorded fixtures)
- [ ] Publish to npm as `elorus-mcp`
- [ ] Add to MCP marketplace listing

---

## Key Design Decisions

**Pagination:** Elorus returns paginated lists. MCP tools will expose `page` and `page_size` params and return `count`, `next`, `previous` in results so the LLM can page through large sets.

**Currency handling:** All monetary values passed as strings (e.g. `"1500.00"`) to avoid float precision issues. Documented in tool descriptions.

**Rate limiting:** Wrap the HTTP client with a simple token-bucket rate limiter to respect Elorus API limits. Surface rate-limit errors clearly.

**Idempotency:** For create operations, document that Elorus does not expose idempotency keys — callers should query before creating to avoid duplicates.

---

## Success Criteria

- An LLM can create a complete invoice from a natural language request in one turn.
- An LLM can answer "what's my outstanding receivables total?" by querying invoices and payments.
- An LLM can look up a product and use it as a line item when creating an invoice.
- An LLM can record an expense or supplier bill and reconcile it against an outgoing payment.
- The server installs with `npx elorus-mcp` and works in Claude Desktop out of the box.

---

---

# Future Plan

Features deferred after the initial release. These add meaningful complexity (Greek tax authority integration, document logistics workflows, project/time management) and are better tackled once the core is stable and in users' hands.

---

## Estimates

### Resources
| MCP Resource | Elorus Endpoint | Description |
|---|---|---|
| `elorus://estimates` | `GET /estimates/` | Paginated estimates |

### Tools
- `create_estimate` — Create a new estimate
- `get_estimate` — Fetch estimate by ID
- `list_estimates` — Filter estimates
- `send_estimate_email` — Email estimate to client
- `convert_estimate_to_invoice` — Convert approved estimate to invoice

---

## Inventory & Logistics

### Resources
| MCP Resource | Elorus Endpoint | Description |
|---|---|---|
| `elorus://deliverynotes` | `GET /deliverynotes/` | Delivery notes |
| `elorus://goodsreceipts` | `GET /goodsreceipts/` | Inbound goods receipts |

### Tools

#### Delivery Notes
- `create_delivery_note` — Create dispatch, return, or transfer note
- `get_delivery_note` — Fetch a delivery note by ID
- `list_delivery_notes` — Filter delivery notes

#### Goods Receipts
- `create_goods_receipt` — Record receipt of goods from a supplier
- `get_goods_receipt` — Fetch a goods receipt by ID
- `list_goods_receipts` — Filter goods receipts

#### Warehouse
- `list_warehouse` — Query current stock levels and warehouse state

---

## Time Tracking

### Resources
| MCP Resource | Elorus Endpoint | Description |
|---|---|---|
| `elorus://projects` | `GET /projects/` | Project list |

### Tools
- `create_project` — Create a new project
- `list_projects` — List projects
- `create_time_entry` — Log a time entry on a project
- `list_time_entries` — Filter time entries by project, date, user
- `create_task` — Create a task on a project
- `list_tasks` — List tasks for a project

### Success Criteria
- An LLM can log time entries and generate a project time report.

---

## Recurring Invoices

The Elorus API exposes `/recurringinvoices/` for scheduled invoice generation. (No equivalent recurring endpoint exists for expenses or bills.)

### Tools
- `create_recurring_invoice` — Create a recurring invoice template with schedule (daily/weekly/monthly/yearly)
- `get_recurring_invoice` — Fetch a recurring invoice template
- `update_recurring_invoice` — Update schedule or line items
- `list_recurring_invoices` — List active and paused recurring invoices
- `pause_recurring_invoice` / `resume_recurring_invoice` — Control schedule execution

### Design Notes
- Recurring templates are distinct from the documents they generate; tool descriptions must make this clear so the LLM doesn't conflate editing a template with editing a posted invoice.
- Include `next_occurrence` and `last_occurrence` in list responses so the LLM can answer scheduling questions without extra calls.

---

## Admin & Config

Read-only lookup tools for organization-level configuration. Useful for populating dropdowns and validating IDs without requiring full admin access.

### Tools
- `list_users` — List organization users
- `list_user_teams` — List user teams
- `get_organization_branch` — Fetch organization branch details
- `list_tracking_categories` — List accounting tracking dimensions
- `list_templates` — List available document templates
- `list_email_templates` — List available email templates
- `list_payment_gateways` — List configured payment gateways

---

## AADE / myDATA Integration (Greece)

Elorus supports Greek tax authority (AADE) e-invoicing via the myDATA platform. This requires additional fields on invoice creation and careful handling of Greek-specific document classification codes.

### Scope
- Expose `mydata_document_type` and `mydata_classification` fields on `create_invoice` and `create_expense`
- Document Greek-specific workflow (document types, classification codes, submission status)
- Surface myDATA submission status on existing invoice and expense tools
- Add Greek-specific sequence tools: `list_income_sequences_rental`, `list_income_sequences_contract`, `list_cash_receipt_sequences_accommodation_tax`

### Design Notes
- myDATA classification codes are Greek tax law constructs — tool descriptions must be explicit so the LLM can guide users correctly
- Submission errors from AADE should be surfaced as structured, actionable error messages rather than raw API responses

---

## Out of Scope (all versions)

- OAuth / multi-user token flows (API key only)
- Webhooks / real-time event streaming
- Bank reconciliation (not in current Elorus API)
- Mobile or desktop GUI
