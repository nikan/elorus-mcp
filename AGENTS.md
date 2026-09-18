# AGENTS.md

Guidance for AI coding agents working in this repository.

## What this is

`elorus-mcp` is an MCP (Model Context Protocol) server that exposes the [Elorus](https://www.elorus.com/) invoicing/accounting REST API (v1.2, `https://api.elorus.com/v1.2/`) as MCP tools and resources, so an AI assistant can create invoices, manage contacts, record payments, etc. Node 20+, TypeScript, stdio transport, published as `elorus-mcp` on npm.

## Commands

```bash
npm run build          # tsc -p tsconfig.build.json (production build, excludes src/__tests__)
npm run dev             # tsc --watch
npm test                # vitest run (all tests)
npm run test:watch      # vitest (watch mode)
npm run test:coverage   # vitest run --coverage
npm start               # node --env-file=.env dist/index.js (local dev; requires npm run build first)
```

Run a single test file: `npx vitest run src/tools/__tests__/invoices.test.ts` (or any path). Run tests matching a name: `npx vitest run -t "void"`.

Local dev needs `ELORUS_API_KEY` and `ELORUS_ORG_ID` (copy `.env.example` to `.env`). Only `npm start` reads `.env` (via `node --env-file`); when launched through an MCP client config (Claude Desktop/Code), that config's own `env` block is what's used instead — the two are not merged. `ELORUS_DEMO=1` targets Elorus's demo/sandbox org. `ELORUS_ATTACHMENT_ROOT` must be set to allow `file_path`-based attachment uploads (`add_bill_attachment`/`add_expense_attachment`); unset, only `content_base64` works.

## Architecture

**Entry point** `src/index.ts`: builds `ElorusClient` from `getConfig()` (`src/auth.ts`), constructs one `McpServer`, then calls a `register<X>Tools(server, client)` function per resource module from `src/tools/`, and finally `registerResources(server, client)`. Adding a new resource module means writing the file and adding one import + one call here — nothing else is wired centrally.

**`src/client.ts` — `ElorusClient`**: the only place that talks to the Elorus API. Injects `Authorization: Token <key>`, `X-Elorus-Organization`, and `X-Elorus-Demo` headers. Methods: `get/post/put/patch/delete<T>()`, `postMultipart<T>()` (for attachment uploads — strips the default JSON `Content-Type` so fetch sets its own multipart boundary), `getBinary()` (for PDF export — requires `Accept: application/pdf`, rejects non-PDF responses, caps body at `MAX_BINARY_RESPONSE_BYTES`, bypasses the JSON parsing path entirely), and `mergePut<T>()`. Every request goes through `fetchWithTimeout` (30s `AbortSignal.timeout`); only `get()` retries (up to `MAX_GET_RETRIES`, on 429/5xx, honoring `Retry-After`) — writes are never auto-retried. Errors are normalized by `formatHttpError`/`formatDrfError` into a single readable `Error`.

`mergePut` emulates PATCH for Elorus endpoints that only accept PUT (contacts, products, expenses, cash payments, recurring invoices, bill reference updates): GET the current record, drop `null` fields and anything in `READ_ONLY_RESPONSE_FIELDS`, merge the caller's fields on top (caller-supplied `null`s survive), then PUT. `fields` can be a function of the fetched record instead of a plain object, to avoid a second GET when overrides depend on server state.

**Tool file pattern** (`src/tools/*.ts`, one file per resource): each exports `register<X>Tools(server, client)`, which calls `server.registerTool(name, { description, inputSchema }, handler)` per operation. `inputSchema` is a plain object of Zod schemas (not `z.object()`); handlers call exactly one `ElorusClient` method and return `{ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] }` (or a `type: "resource"` block with a base64 `blob` for PDF exports). Errors are plain `throw new Error(...)`. Recurring shapes across tool files: void is `client.put(".../void/", { void: true })`; email actions GET the `/email/` endpoint for defaults and POST the merged result back to the same path; the generic notes/discussions tool (`src/tools/notes.ts`) is parameterized by a `resource_type` enum and builds paths as `` `/${resource_type}s/${resource_id}/notes/` `` (relies on regular pluralization).

**`src/schemas/`**: shared Zod schemas (mainly line-item shapes for invoices/bills/expenses), each field `.describe()`d, cross-field rules via `.superRefine`. Imported into the relevant tool files.

**`src/resources/index.ts`**: read-only `elorus://<name>` MCP Resources (contacts, invoices, cash receipts/payments, expenses, bills, products), each built via a shared `makeReader(path, client)` helper that GETs up to 100 records and returns them as JSON.

**`src/attachments.ts`**: `readAttachmentFile()` for the `file_path` attachment-upload option — fails closed unless `ELORUS_ATTACHMENT_ROOT` is set, resolves realpaths and checks containment (defeats symlink escapes), enforces an extension allowlist and a size cap.

**Tests** (`src/__tests__/`): `client.test.ts`/`auth.test.ts`/`attachments.test.ts` unit-test the core modules directly. `src/__tests__/integration/<resource>.test.ts` stubs `global.fetch` (`vi.stubGlobal`) and drives `ElorusClient` directly, asserting the exact method/URL/body sent. `src/__tests__/integration/<resource>-tools.test.ts` instead spins up a real `McpServer` + SDK `Client` over `InMemoryTransport.createLinkedPair()` and calls `client.callTool({name, arguments})`, asserting at the MCP-tool-call level — this is the pattern to copy when adding tools for a new resource. Fixtures live in `src/__tests__/fixtures/*.json`.

## Known gaps

`project/AUDIT.md` and `project/api-coverage-plan.md` track a substantial API-coverage gap: many operations the Elorus v1.2 API exposes (several document types, time tracking, org admin, most attachment/notes/discussions sub-resource operations) aren't wrapped as tools yet. Check `project/api-coverage-plan.md` before assuming a resource or operation is unsupported — it documents exactly what's missing and the planned approach (generalized, resource-type-parameterized tools for shared sub-resources like notes/attachments, rather than one-off tools per resource).

## Repo hook

`scripts/hooks/check-origin.cjs` is a `UserPromptSubmit` hook (tested by `scripts/hooks/check-origin-checks.cjs`, run via Node's built-in test runner, not vitest) that checks the local branch against `origin` at the start of a session and fast-forwards or blocks on divergence/uncommitted changes.
