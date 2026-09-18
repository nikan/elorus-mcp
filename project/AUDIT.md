# Project audit — 2026-09-18

Branch: `codex/project-audit-2026-09-18`

> **Historical snapshot.** This audit reflects the repository as of PR #6
> (2026-09-18) and is kept for context, not as a live status report. Findings
> 1–6 (void HTTP method, invoice email route, notes/discussions routes, PDF
> binary handling, cash-receipt payload, attachment path allowlist) were fully
> addressed in PR #7, "Fix API contract mismatches and other issues from
> AUDIT.md" (commit `039f679`). Finding 8 (request timeout/retry) and finding
> 9 (test/fixture exclusion from the published package) are also fully
> addressed, in `src/client.ts` and `tsconfig.build.json` respectively.
> Finding 11 (version/metadata drift) is fixed — `src/index.ts` now sources
> `version` from `package.json`. Findings 7 and 10 are only **partially**
> addressed: `src/client.ts`'s `mergePut` now strips a generic
> `READ_ONLY_RESPONSE_FIELDS` denylist before PUTting, which is narrower than
> the per-resource writable-field allowlist finding 7 recommended — it can
> still forward other server-managed fields and lose concurrent edits between
> GET and PUT. And while `.github/workflows/ci.yml` now runs build/test/package
> checks as a CI gate, finding 10's other recommendation — contract tests
> derived from the v1.2 reference and a demo-org smoke suite — is still
> missing; all tests remain mocked-`fetch` unit tests. For current status,
> check the code and CI rather than this file.

## Scope and method

Reviewed the current working tree, including pre-existing uncommitted changes, the MCP tool registrations, HTTP client, schemas, tests, package configuration, and README. Compared endpoint contracts with the [Elorus API v1.2 reference](https://developer.elorus.com/). No authenticated Elorus requests were made. Findings about API behavior are based on the published contract; a demo-organization smoke test is still needed after fixes.

`npm run build` passed. `npm test` could not start on this host: it has Node 18.19.1 while `package.json` requires Node 20+, and Vitest's dependency imports `node:util.styleText`. `npm pack --dry-run --json` passed with a writable npm cache and exposed the package contents described below.

## Findings, ordered by priority

### 1. Invoice and bill void tools use the wrong HTTP method — high, confirmed

`void_invoice` and `void_bill` POST `{}` to `/invoices/{id}/void/` and `/bills/{id}/void/` ([invoices.ts](../src/tools/invoices.ts#L190), [bills.ts](../src/tools/bills.ts#L249)). The [Elorus v1.2 reference](https://developer.elorus.com/) specifies **PUT** for both operations, with an optional `void` boolean. These tools are likely to receive 405 responses from the documented API.

**Fix:** call `client.put(..., { void: true })`; add a transport-level test that asserts method, path, and body for both tools. Consider exposing an explicit unvoid operation only if needed.

### 2. Invoice email tool uses a nonexistent route and mismatched request schema — high, confirmed

`send_invoice_email` calls `/invoices/{id}/sendmail/`, accepts `to` as an array, and makes `subject` and `message` optional ([invoices.ts](../src/tools/invoices.ts#L206)). The [v1.2 email endpoint](https://developer.elorus.com/) is `POST /invoices/{id}/email/`; its request has a single email string in `to` and requires `subject`, `message`, `cc`, `bcc`, and `attach_pdf`. The reference recommends GETting the endpoint's defaults before POSTing. As written, this tool cannot send against the documented route.

**Fix:** GET `/email/` defaults, merge caller overrides, validate the resulting request, and POST to `/email/`. Update the MCP schema to match the API and test the complete flow.

### 3. Notes and discussions use unsupported top-level routes — high, confirmed

All four note/discussion tools call `/privatenotes/` or `/clientdiscussions/` with `content_type` and `object_id` ([notes.ts](../src/tools/notes.ts#L9)). The [v1.2 reference](https://developer.elorus.com/) documents resource-scoped routes such as `/contacts/{id}/notes/`, `/invoices/{id}/notes/`, and `/invoices/{id}/discussions/`. A private note payload uses `notes`, not `title`/`body`. The current tools cannot match these documented routes or bodies.

**Fix:** map supported resource types to documented nested routes, use the endpoint's request schema, and reject unsupported type/operation combinations. Add tests that assert each URL and payload against an independent contract fixture.

### 4. PDF exports try to parse a binary PDF as JSON — high, confirmed

`export_invoice_pdf`, `export_expense_pdf`, and `export_cash_receipt_pdf` call the generic JSON `get` method ([invoices.ts](../src/tools/invoices.ts#L238), [expenses.ts](../src/tools/expenses.ts#L248), [cash-receipts.ts](../src/tools/cash-receipts.ts#L90)). `ElorusClient.handleResponse` always calls `response.json()` after success ([client.ts](../src/client.ts#L110)). The [v1.2 PDF endpoints](https://developer.elorus.com/) return PDF bytes, so these calls will fail parsing; their descriptions also incorrectly promise a download URL.

**Fix:** add a binary response path with an appropriate `Accept` header, validate `Content-Type`, and return an MCP resource or a deliberately bounded encoded result. Decide how to handle large PDFs and redirects before exposing it through stdio.

### 5. Received-payment tool sends UI field names directly to the API — high, strongly supported

`record_cash_receipt` forwards `{ client, invoice, ... }` unchanged to `/cashreceipts/` ([cash-receipts.ts](../src/tools/cash-receipts.ts#L52)). The [Elorus payment examples](https://developer.elorus.com/el/examples/contract/) use `contact` and `transaction_type` for that endpoint; the v1.2 API's payment association model should be checked before implementing the `invoice` mapping. This differs from `record_cash_payment`, which explicitly maps `supplier` to `contact`, supplies `transaction_type`, and builds `purchase_payments` ([cash-payments.ts](../src/tools/cash-payments.ts#L89)). At minimum, the current received-payment body does not follow the documented contact and transaction fields.

**Fix:** map the public MCP arguments to the exact v1.2 cash-receipt body, including its invoice allocation structure, and verify with a demo organization. Test unallocated and allocated receipts separately.

### 6. Attachment tools can read and upload any local file visible to the server — high, confirmed security exposure

`add_bill_attachment` and `add_expense_attachment` accept arbitrary `file_path`, synchronously read it, and upload its bytes using the Elorus credential ([bills.ts](../src/tools/bills.ts#L177), [expenses.ts](../src/tools/expenses.ts#L176)). An MCP caller that can invoke the tool can therefore cause the server to read files outside an accounting folder and transmit them to Elorus. The example paths also include a developer-specific home directory.

**Fix:** prefer caller-supplied file bytes. If local paths are essential, make an explicit configured allowlist root, resolve symlinks and canonical paths before checking containment, cap file size and accepted formats, and avoid revealing machine-specific paths in tool descriptions. Use asynchronous streaming rather than `readFileSync` for large files.

### 7. Generic GET-merge-PUT can overwrite or reject server-managed fields — medium, design risk

`mergePut` copies every non-null field from a GET response into a PUT ([client.ts](../src/client.ts#L90)). It is used for contacts, products, expenses, cash payments, recurring invoices, and bill reference updates. Elorus GET objects include fields such as `id`, `organization`, `created`, `modified`, computed totals, and nested collections. The current client sends these back without a per-resource writable-field allowlist. Even where the API ignores read-only fields, concurrent edits can be lost between GET and PUT.

**Fix:** build each PUT from the documented writable schema and required fields, preserving nested item IDs when relevant. Add round-trip contract tests with representative full GET payloads and consider conflict detection where the API supports it.

### 8. HTTP calls have no deadline or rate-limit strategy — medium, confirmed operational gap

Every `fetch` in [client.ts](../src/client.ts#L26) has no `AbortSignal`; one stalled request can leave a tool call pending indefinitely. The [Elorus API reference](https://developer.elorus.com/) states limits of 60 calls per minute and 1,000 calls per day, but the client neither uses `Retry-After` nor distinguishes retryable reads from non-idempotent writes. `mergePut` uses two calls per update.

**Fix:** set an explicit request deadline, surface timeout details, and add bounded backoff for safe reads on 429/5xx. Never automatically retry creation or payment POSTs without an idempotency strategy.

### 9. Package includes compiled tests and fixtures — medium, confirmed

`tsconfig.json` compiles all of `src/**/*`, including `src/__tests__`, into `dist`; `package.json` publishes all of `dist`. `npm pack --dry-run --json` listed 163 entries, including compiled test files and fixture JSON, for a 412 KB unpacked package. This increases install size and publishes test data unnecessarily.

**Fix:** compile production sources only, or emit production code to a separate directory. Add a package-content check in CI. Keep test compilation or type checking in a separate configuration.

### 10. Tests are contract-blind and no CI gate is present — medium, confirmed

Files named `integration` use `vi.stubGlobal("fetch", ...)` and synthetic fixtures rather than an Elorus demo organization (for example [invoices.test.ts](../src/__tests__/integration/invoices.test.ts#L1)). One test explicitly asserts POSTing to the void endpoint, which contradicts the published API. There is no `.github/workflows` directory. Thus a green local suite would not catch the method and route failures above.

**Fix:** retain fast mocked unit tests, add contract tests derived from the v1.2 reference, and run build/test/package checks on supported Node versions in CI. Add a small optional smoke suite against a demo organization for create, read, update, void, and PDF flows, with careful cleanup and no production credentials.

### 11. Version and documentation metadata disagree — low, confirmed

`package.json` is `1.0.0`, while the MCP server advertises `0.2.0` ([index.ts](../src/index.ts#L23)). The README clone command uses a placeholder `your-org` URL, and the PDF tool descriptions claim URLs despite the binary API response. These create avoidable setup and troubleshooting confusion.

**Fix:** source the MCP version from package metadata at build time, replace the placeholder clone URL with the actual repository URL, and correct the affected tool descriptions after the PDF implementation is settled.

## Recommended sequence

1. Repair endpoint method, path, and payload mismatches (findings 1–5), with contract tests that check the actual HTTP request.
2. Restrict attachment file access and define a safe binary/PDF response design (findings 4 and 6).
3. Replace generic update serialization, then add timeouts and cautious read retries (findings 7–8).
4. Separate production builds from tests, add CI and demo smoke checks, and align package/docs metadata (findings 9–11).

## Validation limits

The audit did not use live Elorus credentials. The working tree had substantial pre-existing uncommitted changes before branch creation; this report is the only audit-authored source file. The Node 18 test startup failure is a host prerequisite mismatch, not evidence that tests fail on a supported runtime. API-contract findings should be verified in a demo organization after implementation.
