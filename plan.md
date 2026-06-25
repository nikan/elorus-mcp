# Elorus MCP Server — Implementation Plan

## Overview

Build a Model Context Protocol (MCP) server that exposes the Elorus invoicing and accounting platform to AI assistants. This enables LLMs to create invoices, manage contacts, track time, query payments, and handle financial workflows on behalf of users — all through natural language.

**Target API:** Elorus REST API v1.2  
**Auth model:** API key + Organization ID (per-user, per-org)  
**Base URL:** `https://api.elorus.com/v1.2/`

---

## Goals

1. Cover the full surface of the Elorus v1.2 API with MCP tools.
2. Make each tool safe, typed, and LLM-friendly (clear names, descriptions, and error messages).
3. Ship as an npm package (`elorus-mcp`) usable in Claude Desktop, Claude Code, and any MCP-compatible host.
4. Expose read-only resources (contacts list, invoice list) as MCP Resources, and write/action operations as MCP Tools.

---

## API Surface → MCP Mapping

### Resources (read-only, subscribable)

| MCP Resource | Elorus Endpoint | Description |
|---|---|---|
| `elorus://contacts` | `GET /contacts/` | Paginated contact list |
| `elorus://invoices` | `GET /invoices/` | Paginated invoice list |
| `elorus://estimates` | `GET /estimates/` | Paginated estimates |
| `elorus://payments` | `GET /payments/` | Received payments |
| `elorus://projects` | `GET /projects/` | Project list |
| `elorus://expenses` | `GET /expenses/` | Expense records |

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

#### Estimates
- `create_estimate` — Create a new estimate
- `get_estimate` — Fetch estimate by ID
- `list_estimates` — Filter estimates
- `send_estimate_email` — Email estimate to client
- `convert_estimate_to_invoice` — Convert approved estimate to invoice

#### Credit Notes
- `create_credit_note` — Create a credit note
- `apply_credit_note` — Associate credit note with open invoices
- `list_credit_notes` — Filter credit notes

#### Payments
- `record_payment` — Record a payment received against an invoice
- `list_payments` — List payments by client, date, method
- `export_payment_pdf` — Export payment receipt as PDF

#### Delivery Notes
- `create_delivery_note` — Create dispatch, return, or transfer note
- `list_delivery_notes` — Filter delivery notes

#### Time Tracking
- `create_project` — Create a new project
- `list_projects` — List projects
- `create_time_entry` — Log a time entry on a project
- `list_time_entries` — Filter time entries by project, date, user
- `create_task` — Create a task on a project
- `list_tasks` — List tasks for a project

#### Notes & Discussions
- `create_private_note` — Add internal note to contact/invoice/payment
- `list_private_notes` — Fetch notes for a resource
- `create_client_discussion` — Post a client-visible comment
- `list_client_discussions` — Fetch discussion thread

#### Taxes & Config
- `list_taxes` — Retrieve configured tax rates
- `list_document_types` — Retrieve document type options
- `list_units` — List custom units of measurement

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
│   │   └── ...
│   ├── tools/            # MCP Tool handlers
│   │   ├── contacts.ts
│   │   ├── invoices.ts
│   │   ├── estimates.ts
│   │   ├── payments.ts
│   │   ├── credit-notes.ts
│   │   ├── time-tracking.ts
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

The server accepts configuration via environment variables or a JSON config block in `mcp.json`:

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

### Phase 1 — Foundation (Week 1)
- [ ] Scaffold TypeScript project with MCP SDK
- [ ] Implement `client.ts`: base fetch wrapper, auth headers, error normalization
- [ ] Implement `list_contacts`, `create_contact`, `get_contact` tools
- [ ] Implement `list_invoices`, `create_invoice`, `get_invoice` tools
- [ ] Wire up stdio transport and test in Claude Desktop
- [ ] README: setup, auth, basic usage

### Phase 2 — Core Workflows (Week 2)
- [ ] Add invoice email + PDF export tools
- [ ] Add estimates CRUD + convert-to-invoice
- [ ] Add payments recording + PDF export
- [ ] Add credit notes + application
- [ ] Add MCP Resources for contacts and invoices (read-only, paginated)

### Phase 3 — Extended Coverage (Week 3)
- [ ] Time tracking: projects, tasks, time entries
- [ ] Private notes and client discussions
- [ ] Delivery notes
- [ ] Taxes, document types, and units config tools

### Phase 4 — Quality & Publish (Week 4)
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

**myDATA compliance (Greece):** Elorus supports Greek tax authority (AADE) e-invoicing. The `create_invoice` tool will expose `mydata_document_type` and `mydata_classification` fields for Greek users.

**Rate limiting:** Wrap the HTTP client with a simple token-bucket rate limiter to respect Elorus API limits. Surface rate-limit errors clearly.

**Idempotency:** For create operations, document that Elorus does not expose idempotency keys — callers should query before creating to avoid duplicates.

---

## Out of Scope (v1)

- OAuth / multi-user token flows (API key only for v1)
- Webhooks / real-time event streaming
- Bank reconciliation (not in current Elorus API)
- Mobile or desktop GUI

---

## Success Criteria

- An LLM can create a complete invoice from a natural language request in one turn.
- An LLM can answer "what's my outstanding receivables total?" by querying invoices and payments.
- An LLM can log time entries and generate a project time report.
- The server installs with `npx elorus-mcp` and works in Claude Desktop out of the box.
