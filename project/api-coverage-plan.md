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
  **Caveat for invoices/credit notes/supplier credits**: PATCH on these three
  document types does not update line items or amounts, and full PUT replacement
  of items is only permitted while the document is a draft, requiring the
  complete item list including existing line IDs (omitting an existing ID
  deletes that line). PATCH is also not a catch-all for "everything except
  items" — per the v1.2 reference, invoice PATCH only accepts `custom_id`,
  `draft`, `exchange_rate`, `payment_gateways`, and `trackingcategories`.
  Fields like `date` or `client` are **not** PATCH-able and, like item edits,
  require the draft-only full PUT path. `update_invoice`'s `inputSchema` must
  therefore only expose that five-field PATCH allowlist as PATCH-safe; every
  other field it accepts must route through the draft-only PUT path (or be
  rejected outside draft status). Verify the equivalent PATCH allowlist for
  credit notes and supplier credits against the spec before implementing
  `update_credit_note`/`update_supplier_credit` — do not assume it matches
  invoices' field set. See https://developer.elorus.com/.
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
   client method below). **Non-breaking**: keep `add_bill_attachment` and
   `add_expense_attachment` as thin, deprecated wrappers that call the same
   underlying logic as `add_attachment` with `resource_type` fixed to
   `"bill"`/`"expense"` — existing MCP clients and saved workflows keep working.
   Mark both descriptions as deprecated in favor of `add_attachment`, keep their
   existing tests passing unchanged, and leave actual removal to a future
   major-version migration rather than this plan.
3. **New `src/tools/sent-emails.ts`** — `list_sent_emails`, `resource_type` enum =
   the 7 email-capable types.
4. **Applied-credit list/unapply** — this is another shared sub-resource per the
   matrix above, so generalize it the same way as notes/attachments/sent-emails
   instead of registering it per resource module (registering
   `list_applied_credit`/`unapply_credit` separately in both `credit-notes.ts`
   and `supplier-credits.ts` would collide on tool name, since MCP tool names
   share one server namespace). Add a single generic tool pair —
   `list_applied_credit(resource_type, resource_id)` and
   `unapply_credit(resource_type, resource_id, applied_credit_id)` (DELETE
   `/{resource_type}s/{id}/applied-credit/{appliedId}/`) — with `resource_type`
   enum `"invoice" | "creditnote" | "suppliercredit"`, following the exact
   `notes.ts` path-building convention (regular pluralization). This covers the
   invoice-side read too, so no separate invoice-only tool is needed. Keep
   `apply_credit_note`/`apply_supplier_credit` unchanged and resource-specific,
   since their POST body key differs by type (`invoice` vs `purchase`) — only
   the structurally-identical list/unapply operations are generic.
5. **`src/client.ts`** — generalize `getBinary` (or add a sibling method) to accept
   an expected content-type prefix instead of hardcoding `"pdf"`, since attachments
   can be images/docs/etc. Confirm `fetch`'s default redirect-following handles the
   attachment-file endpoint's documented 307 redirect correctly.

## Phase 1 — Close gaps on existing resources + generalized sub-resource tools

**Status: Done.**

New tools on already-wrapped resources (files in parentheses):
`delete_contact` (`contacts.ts`, was already present), `delete_product` (`products.ts`),
`update_invoice`, `delete_invoice` (`invoices.ts`),
`get_credit_note`, `update_credit_note`, `delete_credit_note`, `void_credit_note`,
`send_credit_note_email`, `export_credit_note_pdf` (`credit-notes.ts`),
`get_supplier_credit`, `update_supplier_credit`, `delete_supplier_credit`,
`void_supplier_credit`, `send_supplier_credit_email`, `export_supplier_credit_pdf`
(`supplier-credits.ts`),
`delete_bill`, `send_bill_email`, `export_bill_pdf` (`bills.ts`),
`get_cash_receipt`, `update_cash_receipt`, `delete_cash_receipt` (`cash-receipts.ts`),
`get_cash_payment`, `export_cash_payment_pdf` (`cash-payments.ts`),
`delete_recurring_invoice` (`recurring-invoices.ts`),
`get_tax`, `get_document_type`, `get_expense_category` (`config.ts`).

**`update_credit_note`/`update_supplier_credit` — resolved via live sandbox
testing** (`.env.dev`, `ELORUS_DEMO=1`, not production). `developer.elorus.com`
is a JS SPA WebFetch can't render, and `OPTIONS` on this API returns only
`{name, renders, parses}` — no field-level schema — so metadata introspection
was a dead end. Instead, created disposable draft credit notes/supplier
credits in the sandbox and PATCHed individual fields one at a time, comparing
the record before/after each call via a separate GET (the PATCH response body
itself is misleading — it always echoes the same reduced field set regardless
of what was sent or whether it took effect). Findings, confirmed on both
resource types:
- `custom_id`: PATCH-safe, confirmed to actually persist.
- `draft`: PATCH-safe, confirmed to actually persist (issues the document,
  assigns a document number).
- `date`, `client`/`supplier`, `public_notes`, `reference` (supplier credits):
  PATCH returns `200` but **silently has no effect** — the API does not
  reject the field, it just ignores it. This is worse than a clean 400 and is
  exactly the kind of guessed-allowlist risk this item was flagged to avoid.
- `exchange_rate`: PATCH returns `200` but had no effect in this org's test
  (currency_code matched the organization's base currency, GBP) — inconclusive
  whether that's a PATCH restriction or just currency business logic; not
  claimed as PATCH-safe either way.
- `trackingcategories`: a shape guess (`[{category, value}]`) produced a
  server-side `500` (Django error page, not a clean validation error) rather
  than confirming or rejecting support — not pursued further, not exposed.
- The draft-only full-PUT path (mirroring `mergePut`: GET, strip read-only
  fields, merge overrides, PUT) was verified to work for `date` on both
  resource types while draft.
- `delete_credit_note`/`delete_supplier_credit` were confirmed to correctly
  reject deletion of issued (non-draft) documents
  (`"This document is marked as issued and therefore cannot be deleted."`),
  and `void_credit_note`/`void_supplier_credit` were confirmed to work, while
  cleaning up the test records.

Given this, `update_credit_note`/`update_supplier_credit` expose only
`custom_id`/`draft` as PATCH-safe; every other field (date,
client/supplier, documenttype, items, currency_code, exchange_rate, notes,
reference) routes through the draft-only full-PUT path, same as
`update_invoice`. `payment_gateways`/`trackingcategories` are deliberately
**not** exposed on either tool — unlike invoices, their support wasn't
confirmed and the one shape tried triggered a `500`.

**Separate bug found during this verification, not yet fixed:**
`create_supplier_credit`'s items use `lineItemSchema` (the invoice-style
`title`/`unit_value` shape), but a real supplier credit's items use
`description` (not `title`) and require `expense_category` — confirmed via a
live `400` (`{"items":[{"expense_category":["This field is required."]}]}`)
when using the current schema, and via a successful create once
`description`/`expense_category` were added. This is the same shape
`create_bill` already remaps to correctly (`billLineItemSchema`, with
`title`→`description` remapping) — `create_supplier_credit` needs the
equivalent fix. As shipped, `create_supplier_credit` will be rejected by the
real API.

**PR review follow-up, resolved:** a review of the Phase 1 PR flagged three bugs
in `update_invoice`/`update_credit_note`/`update_supplier_credit`, all fixed:
1. Their shared `items` schema didn't declare `id`, so Zod stripped any `id` a
   caller supplied before the PUT, silently deleting and recreating existing
   lines. Fixed via `lineItemUpdateSchema`/`billLineItemUpdateSchema`
   (`src/schemas/line-item.ts`, `src/schemas/bill-line-item.ts`) — update-only
   variants of the create schemas with an optional `id` field.
2. `update_supplier_credit`'s `items` used the invoice-style `lineItemSchema`
   shape instead of the bill-style shape supplier credits actually need
   (`description`, required `expense_category` — see the `create_supplier_credit`
   known issue below). Fixed by switching to `billLineItemUpdateSchema` plus the
   same `title`→`description` remap `create_bill` uses. `create_supplier_credit`
   itself is unchanged and still has the known issue below.
3. `calculator_mode` was validated against `items` locally but never written to
   the PUT body, so changing it silently had no effect, and a `calculator_mode`-
   only call (no other draft-only field) fell through to the PATCH path and sent
   an empty body while appearing to succeed. Fixed by adding it to each tool's
   draft-only-field check and PUT overrides. **Verified live** (`.env.dev`,
   `ELORUS_DEMO=1`): created a disposable draft invoice/credit note/supplier
   credit with `calculator_mode: "initial"`, PUT `calculator_mode: "total"`
   via the same GET-merge-PUT shape `mergePut` uses, and confirmed `"total"`
   via a separate GET on all three resource types before deleting the test
   records. `calculator_mode` genuinely persists via the draft-only full-PUT
   path on all three.

`update_invoice` follows the PATCH-vs-draft-only-PUT caveat under "Update
pattern" above rather than a plain `mergePut` — do not let item edits silently
drop or delete lines.
`export_bill_pdf` follows the same `getBinary` pattern as `export_invoice_pdf`;
per the Elorus reference, the endpoint applies to self-billed invoices (bills
the organization issues to itself), so the tool description should say so.

Plus the cross-cutting work above (extend `notes.ts`, add `attachments.ts`,
`sent-emails.ts`, and `applied-credit.ts` (list/unapply), `client.ts` `getBinary`
generalization). `add_bill_attachment`/`add_expense_attachment` are now thin
deprecated wrappers over the shared `addAttachment()` helper in `attachments.ts`.
The `splitEmailList` helper used by every `send_*_email` tool was extracted to
`src/email.ts` so `bills.ts`/`credit-notes.ts`/`supplier-credits.ts` don't each
carry their own copy.

`download_attachment`'s path (`/{type}s/{id}/attachments/{attachmentId}/file/`)
is confirmed against the Elorus sandbox (`.env.dev`, `ELORUS_DEMO=1`): uploaded
a test attachment to a contact, its create response's `file_url` field is
exactly this path, `GET` on it returns a `307` to an Azure Blob Storage SAS
URL, and Node's `fetch` (used by `client.getBinary`) follows it transparently
and returns the real file bytes with the correct `Content-Type`. Test
attachment was deleted afterward.

Register the 3 new modules in `src/index.ts`. Update README's tool tables for every
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
