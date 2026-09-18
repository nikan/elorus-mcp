# Full Elorus API coverage for elorus-mcp

## Context

A comparison of the Elorus v1.2 OpenAPI spec (326 operations, fetched live from
`developer.elorus.com`) against the 53 tools currently registered in `src/tools/`
found that the MCP server covers the core sales-document workflow well but is
missing: (a) several operations on resources it already wraps (delete/update/void/
email/pdf gaps on invoices, credit notes, supplier credits, bills, cash receipts,
cash payments, contacts, products, recurring invoices), and (b) 17 entire resource
categories with zero tools (estimates, delivery notes, goods receipts + sequences,
projects, tasks, time entries, tracking categories, templates, email templates,
payment gateways, user teams, organization users, organization branches, warehouse,
document-type sequences, product stock adjustments).

Goal: bring the MCP server to full parity with the documented API surface, shipped
in four ordered, independently mergeable phases. Per user decision, shared
sub-resources (notes, discussions, attachments, sent-email logs, applied-credit)
are generalized into resource-type-parameterized tools — extending the existing
`src/tools/notes.ts` pattern — rather than copy-pasted per new resource, to avoid
tool-count explosion (the naive approach would add 100+ near-duplicate tools).

Exact sub-resource support matrix, queried directly from the spec's `paths` (not
guessed), which the generalized tools' resource-type enums must match:

| sub-resource | supported on |
|---|---|
| `notes` | bills, cashpayments, cashreceipts, contacts, creditnotes, deliverynotes, estimates, expenses, goodsreceipts, invoices, products, projects, recurringinvoices, suppliercredits |
| `discussions` | creditnotes, estimates, invoices, projects |
| `attachments` | bills, cashpayments, cashreceipts, contacts, creditnotes, deliverynotes, estimates, expenses, invoices, projects, suppliercredits |
| `sent-email-messages` | bills, creditnotes, deliverynotes, estimates, goodsreceipts, invoices, suppliercredits |
| `applied-credit` | creditnotes, invoices, suppliercredits |
| `void` action | bills, creditnotes, deliverynotes, goodsreceipts, invoices, suppliercredits |
| `email` action | bills, creditnotes, deliverynotes, estimates, goodsreceipts, invoices, suppliercredits |
| `pdf` export | bills, cashpayments, cashreceipts, creditnotes, deliverynotes, estimates, goodsreceipts, invoices, suppliercredits |

Note the current `src/tools/notes.ts` already under-covers this: its
`DISCUSSION_RESOURCE_TYPES` only lists `invoice`/`creditnote`, missing `estimate`
and `project`. That gets corrected in Phase 1.

## Established conventions to follow (from codebase exploration)

- **Tool shape** (`src/tools/invoices.ts:16-92` is the canonical example):
  ```ts
  server.registerTool(
    "tool_name",
    { description: "...", inputSchema: { field: z.string().optional().describe("...") } },
    async ({ field }) => {
      const result = await client.get/post/put/patch/delete/mergePut(...);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    }
  );
  ```
  `inputSchema` is a plain object of Zod schemas, not `z.object()`. Errors are
  `throw new Error(...)`.
- **Update pattern**: `client.patch()` where the API supports PATCH; `client.mergePut()`
  (GET, drop nulls + `READ_ONLY_RESPONSE_FIELDS`, merge caller fields, PUT) where it's
  PUT-only. See `src/client.ts` `mergePut`, used in `bills.ts` `update_bill`.
- **Void**: `client.put(`/…/{id}/void/`, { void: true })` — `invoices.ts:198-212`.
- **Email**: GET `/…/{id}/email/` for defaults, merge caller overrides (cc/bcc via
  `splitEmailList`), POST merged body to same path — `invoices.ts:214-271`. This is
  the fix AUDIT.md finding #2 recommended, already implemented; replicate exactly.
- **PDF/binary export**: `client.getBinary()` → return
  `{ content: [{ type: "resource" as const, resource: { uri, mimeType, blob: base64 } }] }`
  — `invoices.ts:273-296`. `getBinary` currently hardcodes an `Accept: application/pdf`
  / content-type check; needs generalizing for attachment downloads (see Phase 1).
- **Attachment upload**: `src/attachments.ts` `readAttachmentFile()` (fails closed
  without `ELORUS_ATTACHMENT_ROOT`, realpath containment check, extension allowlist,
  25MB cap) or `content_base64`, then `client.postMultipart()`, then optionally
  `client.patch(.../attachments/{id}/, { primary: true })` — `bills.ts:177-248`.
- **Generic notes/discussions**: `src/tools/notes.ts` — resource type gated by a
  Zod enum (`as const` array), path built as `` `/${resource_type}s/${resource_id}/notes/` ``
  (relies on regular pluralization — already true for every type in the matrix above).
- **Apply-credit**: POST a **JSON array** of one object — `[{ invoice, amount }]` for
  credit notes, `[{ purchase, amount }]` (note: `purchase`, not `bill`) for supplier
  credits — `credit-notes.ts:109-128`, `supplier-credits.ts:109-130`.
- **Schemas**: `src/schemas/*.ts`, one Zod object per line-item shape, every field
  `.describe()`d, cross-field rules via `.superRefine`. Imported into tool files.
- **Tests**: `src/__tests__/integration/<resource>.test.ts` stubs `global.fetch` and
  asserts method/URL/body directly against `ElorusClient`; `<resource>-tools.test.ts`
  drives the real `McpServer` over `InMemoryTransport` and asserts the same, at the
  tool-call level. Both exist per resource today; match this for new resources.
- **Wiring**: new module exports `register<X>Tools(server, client)`, imported and
  called in `src/index.ts` alongside the existing calls.

## Cross-cutting work (built in Phase 1, consumed by every later phase)

1. **`src/tools/notes.ts`** — widen `NOTE_RESOURCE_TYPES` to all 14 matrix entries
   and `DISCUSSION_RESOURCE_TYPES` to all 4. Add `update_private_note` /
   `delete_private_note` (PUT/DELETE `/{type}s/{id}/notes/{noteId}/`) and
   `update_client_discussion` / `delete_client_discussion` (same shape under
   `/discussions/`).
2. **New `src/tools/attachments.ts`** — generic, `resource_type` enum = the 11
   attachment-capable types. Tools: `list_attachments`, `get_attachment`,
   `add_attachment` (generalizes the file_path/content_base64/primary logic
   currently duplicated in `bills.ts`/`expenses.ts`), `update_attachment` (title,
   PATCH), `delete_attachment`, `download_attachment` (binary, via the generalized
   client method below). **Breaking change**: this replaces `add_bill_attachment`
   and `add_expense_attachment` — remove them, update README and their existing
   tests to call `add_attachment` with `resource_type: "bill"|"expense"` instead.
3. **New `src/tools/sent-emails.ts`** — `list_sent_emails`, `resource_type` enum =
   the 7 email-capable types.
4. **Applied-credit list/unapply** — add `list_applied_credit` and `unapply_credit`
   (DELETE `/{type}s/{id}/applied-credit/{appliedId}/`) to `credit-notes.ts` and
   `supplier-credits.ts` (and add the equivalent read for `invoices.ts`, which also
   exposes `/applied-credit/` for the invoice-side view). Keep existing
   `apply_credit_note`/`apply_supplier_credit` unchanged (body key differs by type).
5. **`src/client.ts`** — generalize `getBinary` (or add a sibling method) to accept
   an expected content-type prefix instead of hardcoding `"pdf"`, since attachments
   can be images/docs/etc. Confirm `fetch`'s default redirect-following handles the
   attachment-file endpoint's documented 307 redirect correctly.

## Phase 1 — Close gaps on existing resources + generalized sub-resource tools

New tools on already-wrapped resources (files in parentheses):
`delete_contact` (`contacts.ts`), `delete_product` (`products.ts`),
`update_invoice`, `delete_invoice` (`invoices.ts`),
`get_credit_note`, `update_credit_note`, `delete_credit_note`, `void_credit_note`,
`send_credit_note_email`, `export_credit_note_pdf` (`credit-notes.ts`),
`get_supplier_credit`, `update_supplier_credit`, `delete_supplier_credit`,
`void_supplier_credit`, `send_supplier_credit_email`, `export_supplier_credit_pdf`
(`supplier-credits.ts`),
`delete_bill`, `send_bill_email` (`bills.ts`),
`get_cash_receipt`, `update_cash_receipt`, `delete_cash_receipt` (`cash-receipts.ts`),
`get_cash_payment`, `export_cash_payment_pdf` (`cash-payments.ts`),
`delete_recurring_invoice` (`recurring-invoices.ts`),
`get_tax`, `get_document_type`, `get_expense_category` (`config.ts`).

Plus the cross-cutting work above (extend `notes.ts`, add `attachments.ts` and
`sent-emails.ts`, applied-credit list/unapply, `client.ts` `getBinary` generalization).

Register the 2 new modules in `src/index.ts`. Update README's tool tables for every
touched resource (also fixes pre-existing README staleness, e.g. `delete_expense`
already exists in code but is undocumented).

## Phase 2 — New sales/purchase document types

- `src/tools/estimates.ts`: list/get/create/update/delete + `send_estimate_email` +
  `export_estimate_pdf` (no void — estimates aren't voided per the matrix). Reuses
  the Phase-1 generic notes/discussions/attachments/sent-emails tools automatically
  since `estimate` is already in all four enums. Confirm during implementation
  whether estimates' line-item/tax shape matches invoices' closely enough to reuse
  `schemas/line-item.ts` (the API's own "what's new" doc groups Estimates with
  Invoices for `sequence_flat`/nested `taxes`, suggesting yes).
- `src/tools/delivery-notes.ts`: list/get/create/update/delete/void + email + pdf.
  Uses generic notes/attachments/sent-emails (no discussions for this type).
- `src/tools/goods-receipts.ts`: list/get/create/update/delete/void + email + pdf.
  Uses generic notes/sent-emails only (goods receipts have no attachments or
  discussions per the matrix).
- `src/tools/goods-receipt-sequences.ts` and sequence tools nested under
  `documenttypes` (`list/create/delete/rename`, e.g. added to `config.ts` or a new
  `document-type-sequences.ts`): these use action-style endpoints
  (`/goodsreceiptsequences/delete/`, `/goodsreceiptsequences/rename/`,
  `/documenttypes/{id}/sequences/...`) rather than standard `/{id}/` REST — read
  each endpoint's exact request-body schema from the spec before implementing
  rather than assuming it mirrors other resources.

## Phase 3 — Time tracking

- `src/tools/projects.ts`: list/get/create/update/delete + generic
  notes/discussions/attachments (all three apply). Add nested
  `list/create/get/update/delete_project_extra_fee` for
  `/projects/{id}/projectextrafees/...` (full CRUD per the spec).
- `src/tools/tasks.ts`: list/get/create/update/delete (simple CRUD, no sub-resources).
- `src/tools/time-entries.ts`: list/get/create/update/delete +
  `mark_time_entry_billed` / `mark_time_entry_unbilled`
  (`PUT /timeentries/{id}/mark-billed/` / `mark-unbilled/`).

## Phase 4 — Admin & config lookups

Mostly the simple list-only pattern from `config.ts` (`list_taxes` etc.), extended
with get-single where the API has `/{id}/`, and full CRUD where it doesn't:
- `list_tracking_categories` + `get_tracking_category` (read-only)
- `list_templates` + `get_template` (read-only)
- `list_payment_gateways` (read-only, list-only — no `/{id}/`)
- `list_user_teams`, `list_users` (org users) (read-only, list-only)
- Full CRUD: `email_templates`, `organization_branches`, `warehouse` (new
  `org-admin.ts`, since these are mutable admin resources, kept separate from
  read-only lookups for clarity)
- `unitofmeasurement` is actually full CRUD in the API (current `list_units` is
  read-only) — extend `config.ts`'s unit tool with `get_unit`/`create_unit`/
  `update_unit`/`delete_unit`
- `list/create/get/delete_product_stock_adjustment` nested under products
  (`/products/{id}/stockadjustments/...`), added to `products.ts`

## Verification (per phase)

- `npm run build` (tsc via `tsconfig.build.json`) must pass.
- `npm test` (vitest) must pass — note AUDIT.md flagged the dev host runs Node 18
  while `package.json` requires Node 20+; confirm the test runner environment before
  relying on a green suite.
- Every new/changed tool gets an integration test (`src/__tests__/integration/<resource>.test.ts`)
  and a tools-level test (`<resource>-tools.test.ts`), matching the existing
  `invoices.test.ts` / `invoices-tools.test.ts` pair.
- Manual smoke test against a demo organization (`ELORUS_DEMO=1`, per `src/auth.ts`)
  for at least one representative tool per new resource type before merging each
  phase — AUDIT.md's findings #1–#3 were exactly the kind of method/route mismatch
  that mocked-only tests miss, so this is the check that catches the equivalent
  mistake in newly-added resources.
- Update README's "Available tools" tables and, where a phase adds a naturally
  list-first resource worth a read-only `elorus://` MCP Resource (e.g. projects,
  estimates), add it to `src/resources/index.ts` using the existing `makeReader()`
  helper.

## Open items to resolve during implementation (not blocking this plan)

- Exact request bodies for the goods-receipt-sequence and document-type-sequence
  `delete`/`rename` action endpoints (non-standard URL shape) — read directly from
  the spec's `requestBody` for those two paths before coding.
- Whether `download_attachment` needs explicit 307-redirect handling or `fetch`'s
  default `redirect: "follow"` already covers it — verify against a real attachment
  in a demo org.
- Confirm estimates' create/update schema is close enough to invoices' to reuse
  `lineItemSchema` verbatim vs. needing its own `estimate-line-item.ts`.
