# VS Code Extension and Hosted MCP Plan

## Decision summary

Build a separate VS Code extension in this repository and keep the existing
`elorus-mcp` npm package, CLI entry point, and stdio configuration fully
supported.

The extension should be a thin integration layer. It should:

- register the existing MCP server with VS Code through an MCP server
  definition provider;
- collect and store Elorus credentials with VS Code SecretStorage;
- launch a bundled build of the existing stdio server;
- add setup, reset, status, and troubleshooting commands;
- avoid reimplementing any Elorus tools in the extension.

Do not require Docker for the desktop extension. Add Docker only for an
optional self-hosted/hosted Streamable HTTP server after the server construction
has been separated from its stdio transport.

## Why this shape

VS Code supports MCP servers over local stdio and remote Streamable HTTP, and
extensions can register either transport with
`vscode.lm.registerMcpServerDefinitionProvider`. That makes an MCP provider
extension a better fit than duplicating every tool through VS Code's Language
Model Tool API.

The current server already has the right reusable layers:

- `ElorusClient` owns Elorus HTTP behavior;
- each resource module registers its own MCP tools;
- resources are registered independently;
- only `src/index.ts` couples configuration, server construction, and stdio.

The first server change should therefore be a behavior-preserving extraction,
not a rewrite.

## Target repository layout

Keep the root package as the published `elorus-mcp` package so existing npm,
Claude Desktop, Claude Code, and hand-written MCP configurations do not change.
Turn the repository into an npm workspace with additional projects below it.

```text
elorus-mcp/
├── package.json                    # existing elorus-mcp package + workspaces
├── src/
│   ├── index.ts                    # unchanged public CLI behavior; stdio only
│   ├── server.ts                   # new reusable createElorusServer factory
│   ├── client.ts
│   ├── tools/
│   └── resources/
├── packages/
│   ├── vscode-extension/
│   │   ├── package.json            # independent VS Code Marketplace package
│   │   ├── src/
│   │   │   ├── extension.ts
│   │   │   ├── provider.ts
│   │   │   ├── credentials.ts
│   │   │   └── commands.ts
│   │   ├── test/
│   │   └── dist/
│   │       ├── extension.js        # bundled extension host code
│   │       └── elorus-mcp.mjs      # bundled stdio server from this commit
│   └── hosted-server/              # later; Streamable HTTP adapter only
│       ├── package.json
│       └── src/index.ts
└── deploy/
    ├── Dockerfile                  # later; builds hosted-server
    └── compose.example.yaml        # optional single-tenant self-host example
```

The root can remain a publishable package while also declaring
`packages/*` as workspaces. Avoid moving the current source into a new package
in the first release; that would create unnecessary npm/package-path migration
risk.

## Runtime architecture

### Existing route (must remain)

```text
Any MCP client -> npx elorus-mcp -> stdio -> Elorus API
```

No command, environment variable, or package name changes.

### VS Code local route (first release)

```text
VS Code Agent
  -> extension MCP definition provider
  -> bundled elorus-mcp process over stdio
  -> Elorus API
```

The VSIX should contain a bundled server artifact built from the same commit as
the extension. This avoids downloading an unpinned npm package at activation
time and prevents the extension and server schemas from drifting apart.

Use a supported system Node.js runtime for the initial release and validate it
before returning the server definition. Do not depend on undocumented Electron
runtime behavior. Give the user a specific installation/update message if Node
is missing or too old. A later packaging spike may remove this prerequisite if
a supported, cross-platform runtime strategy is found.

### Hosted route (later)

```text
VS Code or another MCP client
  -> HTTPS + MCP authorization
  -> Streamable HTTP adapter
  -> per-user ElorusClient/server instance
  -> Elorus API
```

The hosted adapter must reuse the same server factory and tool registrations.
It must not fork into a second implementation of the Elorus surface.

## Phase 0: decisions and compatibility baseline

1. Record an architecture decision that the extension is a transport and
   configuration wrapper, not a second implementation.
2. Choose the Marketplace publisher, extension ID, display name, icon, support
   URL, and license metadata.
3. Set the minimum VS Code version to the first stable release containing the
   MCP provider API used by the extension; verify this against Stable, not only
   Insiders.
4. Decide initial platform scope:
   - Desktop VS Code on Windows, macOS, and Linux: supported.
   - Remote SSH, WSL, and Dev Containers: supported after runtime-path tests.
   - `vscode.dev`/`github.dev`: deferred until the remote HTTP service exists,
     because a web extension cannot start a local process.
5. Capture the current MCP tool/resource list and run the existing test suite as
   a compatibility baseline.
6. Upgrade the production/container runtime plan away from Node 20 before
   deployment. Node 20 is end-of-life; target Node 24 LTS for images and CI,
   while treating any root `engines` change as a separately reviewed
   compatibility decision.

Exit criterion: a short ADR defines supported environments, package identities,
and the no-regression contract for the existing CLI.

## Phase 1: extract a reusable server factory

1. Add `src/server.ts` with a function such as:

   ```ts
   createElorusServer(config: ElorusConfig): McpServer
   ```

   It constructs `ElorusClient`, constructs `McpServer`, and registers every
   current tool and resource.
2. Reduce `src/index.ts` to reading the existing environment variables,
   constructing the server through the factory, and connecting
   `StdioServerTransport`.
3. Preserve the shebang, npm `bin`, package exports/files, environment variable
   meanings, error messages, and stdio behavior.
4. Add a factory-level integration test that initializes the server over an
   in-memory transport and verifies representative tools/resources.
5. Add or verify MCP annotations:
   - list/get/export/config lookups: `readOnlyHint`;
   - create/update/send/apply: mutating but not destructive;
   - delete/void/unapply: destructive annotations;
   - mark idempotence only where it is actually guaranteed.

Exit criterion: `npm run build` and `npm test` pass, and existing `npx
elorus-mcp`/local stdio setup remains byte-for-byte compatible at its public
boundary.

## Phase 2: create the VS Code extension project

1. Add `packages/vscode-extension` with its own manifest, TypeScript config,
   test config, README, CHANGELOG, icon, and `.vscodeignore`.
2. Contribute an `mcpServerDefinitionProviders` entry and register the matching
   provider with `vscode.lm.registerMcpServerDefinitionProvider`.
3. Bundle extension code with esbuild, externalizing `vscode`.
4. Produce a second Node bundle for the stdio MCP server from the root source.
   Include it in the VSIX and pin its displayed version to the build commit or
   package version.
5. Return a `McpStdioServerDefinition` whose command launches that bundled
   artifact. Resolve and validate credentials only when VS Code starts the
   server.
6. Add commands:
   - `Elorus: Configure Connection`
   - `Elorus: Test Connection`
   - `Elorus: Clear Credentials`
   - `Elorus: Restart MCP Server`
   - `Elorus: Show MCP Status/Logs`
7. Add non-secret settings for local/remote mode (remote remains hidden or
   experimental initially), demo mode, and optional attachment root.

Exit criterion: installing a locally built VSIX makes the Elorus tools and
resources appear in VS Code Agent mode without editing `mcp.json`.

## Phase 3: credentials and onboarding

1. Store the API key and organization ID in `ExtensionContext.secrets`; never
   write them to user/workspace settings, `.env`, `mcp.json`, logs, telemetry,
   or error messages.
2. In `resolveMcpServerDefinition`:
   - retrieve stored values;
   - prompt for missing values with password-style input;
   - validate format without logging the value;
   - pass values only to the child process environment;
   - return `undefined` on cancellation.
3. Treat demo mode as ordinary non-secret configuration.
4. Support one connection profile in the first release. Design secret keys with
   a profile ID so multiple organizations can be added without migrating stored
   secrets later.
5. Make `Test Connection` call a low-risk read endpoint and distinguish invalid
   key, invalid organization, network, timeout, and Elorus service errors.
6. Clearly explain that SecretStorage is local to the extension host and is not
   Settings Synced; Remote SSH/WSL/Codespaces may therefore require setup in
   that environment.
7. Keep `ELORUS_ATTACHMENT_ROOT` opt-in. Show the resolved path and explain that
   only files beneath it can be uploaded.

Exit criterion: setup is command-driven, cancellation is safe, and a source/log
scan confirms no credential persistence outside SecretStorage.

## Phase 4: testing and release engineering

### Automated tests

- Keep all existing server unit and MCP integration tests.
- Unit-test credential-state transitions with an in-memory SecretStorage fake.
- Unit-test provider output for local and future remote modes.
- Test missing/old Node, missing credentials, cancellation, invalid
  credentials, demo mode, and attachment-root handling.
- Launch the bundled server with dummy credentials and perform MCP
  initialization plus `tools/list` and `resources/list`; these operations do not
  need a live Elorus call.
- Add VS Code extension-host tests for command registration and provider
  discovery.
- Inspect the produced VSIX and assert that source maps, tests, `.env` files,
  development dependencies, and credentials are absent.

### CI matrix

- Root package: build and tests on the supported Node matrix.
- Extension: type-check, bundle, test, and `vsce package`.
- Smoke test the VSIX on Linux in CI; run scheduled or release-candidate smoke
  tests on Windows and macOS.
- Add Remote/WSL/Dev Container manual release checks until they can be reliably
  automated.
- Publish the MCP npm package and VS Code extension as independent artifacts and
  versions. The extension records the bundled MCP version.

### Release stages

1. Install-from-VSIX developer preview.
2. Marketplace pre-release with telemetry off by default (or no telemetry).
3. Stable Marketplace release after cross-platform and remote-environment
   checks.

Exit criterion: a clean-machine user can install, configure, discover tools,
run a read tool, and approve a write tool using only extension commands.

## Docker assessment

### Local VS Code use

Docker should not be the default local execution model.

Benefits are modest because the current MCP server is already a small,
short-lived Node process. Costs are significant: Docker Desktop becomes a hard
dependency, startup is slower, credentials still have to enter the container,
attachment paths require mounts, and Remote/WSL behavior becomes more complex.

An optional Docker definition can still be useful for contributors and users
who explicitly want process/network isolation. It should be documented as an
advanced mode, not used by the Marketplace extension's default provider.

### Self-hosted and public service

Docker does make sense as the deployment unit for the hosted server. It gives a
reproducible runtime, a non-root filesystem/process boundary, image scanning,
health probes, and compatibility with ordinary container platforms. It does not
by itself make the current server public: stdio must be replaced at the adapter
layer by Streamable HTTP, and authentication/multi-tenancy must be designed
first.

Recommended progression:

1. **Single-tenant self-hosted preview**
   - one Elorus organization per deployment;
   - credentials supplied by the platform's secret manager;
   - Streamable HTTP at `/mcp`;
   - an independent bearer-token or reverse-proxy authentication boundary;
   - `/healthz` for process health and `/readyz` for configuration readiness;
   - HTTPS at the ingress;
   - explicitly unsupported as a shared public service.
2. **Multi-tenant private beta**
   - implement the MCP authorization specification with OAuth 2.1 and an
     external identity provider;
   - map an authenticated principal to one or more Elorus connection profiles;
   - encrypt Elorus credentials with a managed KMS and provide revoke/delete
     flows;
   - instantiate clients/server sessions per principal—never from one global
     `ELORUS_API_KEY`;
   - rate-limit and audit by principal and organization;
   - redact request bodies, authorization headers, API keys, organization IDs,
     document content, and attachment content from logs/traces.
3. **Public service**
   - complete threat modeling, privacy/retention policy, abuse controls,
     dependency and image scanning, backup/restore testing, incident response,
     quotas, monitoring, SLOs, and a security review;
   - verify MCP authorization discovery and redirect flows with VS Code and at
     least one non-VS-Code client;
   - add horizontal scaling only after choosing stateless or externally stored
     MCP session state.

### Container requirements

- Multi-stage build using a pinned Node 24 LTS image/digest.
- Run as an unprivileged user with a read-only root filesystem where the hosting
  platform permits it.
- No credentials or `.env` files in image layers.
- Minimal production dependencies and no compiler/test assets in the runtime
  image.
- Graceful shutdown, request/body/time limits, structured redacted logs, and
  health/readiness endpoints.
- Drop unnecessary Linux capabilities and set CPU/memory/process limits.
- Disable `file_path` attachment uploads in hosted mode. Remote callers should
  use bounded base64 uploads or a future presigned-object-storage flow; a
  container path is not the user's local path.
- Put TLS, request-size enforcement, and coarse rate limiting at the ingress,
  with application-level per-user limits behind it.

## Hosted-server code changes

The current factory can bind one `ElorusClient` into tool closures, which is
ideal for local stdio and single-tenant deployment. A multi-tenant server must
create that factory per authenticated user/session or change registrations to
resolve a client from authenticated request context. Do not keep a process-wide
mutable client.

Implement the hosted adapter in `packages/hosted-server`, not `src/index.ts`:

1. Parse and validate hosted-only configuration.
2. Authenticate before MCP request handling.
3. Resolve the caller's Elorus connection.
4. Construct or retrieve an isolated MCP server/session for that principal.
5. Connect it through the SDK's current Streamable HTTP transport.
6. Dispose sessions and sensitive data deterministically.

This leaves the CLI and extension paths simple and prevents hosting concerns
from leaking into the existing package.

## Important risks and mitigations

| Risk | Mitigation |
|---|---|
| Extension and npm server drift | Build the bundled server from the same commit and expose both versions in diagnostics. |
| Secrets leak through settings/logs | SecretStorage only; centralized redaction; automated VSIX/log scans. |
| Write tools are invoked too casually | Correct MCP annotations and retain VS Code's confirmation flow; test destructive tools explicitly. |
| Node is absent or incompatible | Preflight the runtime and show a precise setup command; investigate a supported packaged runtime separately. |
| Remote VS Code runs on a different host | Use extension-host paths and secrets; test SSH, WSL, and Dev Containers. |
| Local attachments expose broad filesystem access | Keep the existing realpath containment checks and require an explicit root. |
| Hosted service crosses tenant data | Per-principal client/session isolation and authorization on every request. |
| Docker is mistaken for a security boundary | Use least privilege, ingress auth, secret management, isolation, and application controls in addition to the container. |
| Public server stores long-lived Elorus keys | Encrypt with KMS, minimize retention, support revocation/deletion, and prefer a future delegated Elorus auth mechanism if available. |

## Recommended first milestone

Deliver a local-only pre-release extension with this scope:

- existing root npm/stdio package unchanged for users;
- reusable server factory extracted;
- VS Code MCP provider registration;
- one SecretStorage-backed Elorus profile;
- bundled server artifact launched with a validated system Node runtime;
- configure, test, clear, restart, and diagnostics commands;
- no custom webview, no duplicated tool UI, no Docker dependency, no hosted
  endpoint;
- automated provider, bundle, MCP discovery, and VSIX-content tests.

After real users validate this path, build the single-tenant Streamable HTTP
adapter and container. Treat a multi-tenant public server as a separate security
and product milestone, not as a packaging follow-up.

## External references

- [VS Code MCP developer guide](https://code.visualstudio.com/api/extension-guides/ai/mcp)
- [VS Code MCP server management](https://code.visualstudio.com/docs/agent-customization/mcp-servers)
- [VS Code SecretStorage API](https://code.visualstudio.com/api/references/vscode-api#SecretStorage)
- [VS Code extension bundling](https://code.visualstudio.com/api/working-with-extensions/bundling-extension)
- [VS Code extension publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension)
- [MCP TypeScript SDK Streamable HTTP API](https://ts.sdk.modelcontextprotocol.io/v2/api/%40modelcontextprotocol/node/streamableHttp.html)
- [Node.js release status](https://nodejs.org/en/about/previous-releases)
- [Docker Node.js guidance](https://docs.docker.com/guides/nodejs/)
