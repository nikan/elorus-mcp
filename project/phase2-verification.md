# Phase 2 implementation and verification

Implemented September 20, 2026: 31 tools for estimates, delivery notes, goods
receipts, goods-receipt sequences, and document-type sequences; three read-only
MCP resources. The existing generic sub-resource enums already cover these types.

## API contract

Source: [Elorus v1.2 international OpenAPI specification](https://developer.elorus.com/json/elorus_api_US_v1.2.01712e72b33190e16b8baf9e16943e538830f5af97aa166900b3b5926c7352e4.json),
linked by the current developer documentation. The new schemas use the writable
fields of `V12EstimateCreate/Update`, `V12DeliveryNoteCreate/Update`, and
`V12GoodsReceiptCreate/Update`, plus their `PUV12*PartialUpdate` definitions.

- Estimates and delivery notes use nested tax objects (`{ tax: "<ID>" }`),
  unlike the existing invoice tool's bare tax-ID array. Separate schemas avoid
  changing existing invoice callers. IDs and decimal values remain strings.
- All three types allow PATCH for `custom_id`, `draft`, and `template`.
  Estimates additionally allow `accept_status`. Other edits require a document
  that is already a draft and a full PUT with retained writable fields.
- Full PUT preserves existing line IDs, strips read-only fields at every schema
  level, and replaces the full line list when `items` is supplied. Changing a
  contact omits the old contact's copied identity/address defaults; explicit
  caller overrides remain intact.
- Goods-receipt items have no prices or taxes. Delivery-note items require a
  unit symbol. Estimates may inherit item details and prices from products.
- Sequence create and delete bodies are `{ name }`; rename bodies are
  `{ old_name, new_name }`. Names contain 1–10 characters. Delete uses HTTP
  DELETE at `.../delete/` with JSON, and rename uses PUT at `.../rename/`.
  The client's optional DELETE body preserves existing bodyless callers.

## Demo findings and fixes

All live checks used `.env.dev` and a forced demo header via
`new ElorusClient(key, org, true)`. No emails were sent and no documents were
issued. Every temporary draft and sequence was deleted, including after failed
checks.

- Reads can return null addresses even though PUT rejects those nulls.
  Retained response nulls are omitted recursively before merging caller fields;
  explicit caller nulls remain subject to the writable schema.
- Reads return unit-of-measurement IDs while document PUT expects symbols.
  ID-shaped unit values are resolved through `/unitofmeasurement/{id}/` before
  PUT, once per distinct unit per update.
- Delivery-note responses can contain an empty TARIC code. The schema accepts
  either the empty value or a ten-character code.
- The demo delivery-note workflow requires billing, shipping, and loading
  addresses. Supplying complete fictional addresses on the disposable draft
  allowed the round trip; no stored contact or organization addresses changed.

Successful live checks:

| Resource | Checks |
|---|---|
| Estimates | List; draft create; full PUT; independent GET confirming notes; PATCH and independent GET confirming custom ID; delete |
| Delivery notes | Same document lifecycle checks |
| Goods receipts | Same document lifecycle checks |
| Goods-receipt sequences | List; create; rename; list confirming new name; delete |
| Document-type sequences | Same sequence lifecycle checks |

Email sending, PDF export, voiding, validation failures, and API-error handling
are covered by mocked MCP transport tests. Live checks intentionally stay within
disposable draft and sequence workflows.

## Local verification

Use Node 22.22.1 (the shell's default Node 18 does not satisfy this package's
Node 20+ requirement). The local dependency installation was missing
`@rolldown/binding-linux-x64-gnu@1.1.3`; installing that matching native binding
into ignored `node_modules` restored Vitest without changing the manifest or
lockfile.

- `npm run build` — passed.
- `npm test` — passed: 330 tests across 29 files.
- Resource-specific `*-tools.test.ts` files exercise MCP input schemas and
  transport behavior. `phase2-documents.test.ts` provides the shared direct
  HTTP-client contract tests for all three document types and sequence DELETEs.
- Regression coverage includes PATCH/PUT routing, draft restrictions, preserved
  line IDs, effective calculator mode, nested taxes, null response addresses,
  unit-ID resolution, contact changes, DELETE bodies, email defaults, PDFs,
  sequence name validation, read-only resources, and write failures without retries.
