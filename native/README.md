# Cryzo native implementation

This is the native implementation branch of [Cryzo Desktop](https://github.com/Imma2013/cryzo-desktop), forked from OpenCode. It is **an internal development build, not a public alpha**.

The upstream application remains in this repository as the UI and protocol reference. Cryzo's new desktop executable embeds the Rust engine directly. It does not start Electron, Bun, the upstream TypeScript engine, or a browser sandbox.

## Run

Prerequisites: Bun 1.4.4, current stable Rust, and the [Tauri platform prerequisites](https://v2.tauri.app/start/prerequisites/). Windows requires Visual Studio C++ build tools and the Windows SDK. macOS requires Xcode command line tools.

```sh
cd packages/desktop-tauri
npm ci --workspaces=false --ignore-scripts
bun run dev
```

Engine checks are independent of the frontend:

```sh
cd native
cargo fmt --all --check
cargo clippy -p cryzo-engine --all-targets -- -D warnings
cargo test -p cryzo-engine
```

Run the development HTTP service with `cargo run -p cryzo-engine -- serve <data-directory>`. Its first stdout line contains the loopback URL and a process-specific Bearer token. Treat that line as a credential; do not publish it. The Tauri app uses IPC and does not require this HTTP service.

## Implemented in this branch

- Separate Tauri 2 executable with a SolidJS native inspector.
- OS credential storage, not browser storage or SQLite secrets.
- SQLite WAL sessions, idempotent prompt admission, ordered resumable event pages, and explicit interrupted-session status after restart.
- An OS file lock keeps a second local engine from resetting an active owner's recovery state.
- Authenticated loopback-only development HTTP service and direct Tauri IPC.
- Workspace-relative file reads, listings and writes, Git diffs, and bounded-duration program execution.
- Single-use approval bound to the exact session and operation for writes and commands.
- API-key Chat Completions streaming with cancellation and network-fragment-safe SSE decoding.
- Frozen OpenCode baseline: 230 provider entries and 8,787 model entries. This is an inventory, **not verified provider parity**.
- Native contract tests and CI configuration.

## Work remaining before public alpha

1. **Coding engine parity:** tool-call execution loop, plan/build modes, compaction, steering/queueing, agents/skills, PTY, MCP/OAuth, plugin compatibility, repository/worktree lifecycle, search and edits, crash recovery at every side-effect boundary, and the upstream API/event contract. The inspector currently streams model text and exposes manually approved local tools; it is not yet a complete coding agent.
2. **All baseline providers:** transport/auth adapters and fixtures for Responses, Anthropic, Gemini, Bedrock, Azure, Copilot and all other baseline integrations. API-key Chat Completions code alone does not establish provider compatibility. Verify OpenRouter free-model limits and NVIDIA NIM using each user's own account. Do not inherit OpenCode's subsidized model offers.
3. **Production UI:** adapt the preserved OpenCode SolidJS application to the Rust protocol and native platform bridge. The inspector is an internal test surface, not a replacement design for the product.
4. **Market:** a new Convex project for account connections, drafts/assets, calendar, approvals, scheduled jobs, delivery attempts and reconciliation. Hosted workers must publish while desktop is closed. Connect Facebook, Instagram, TikTok, YouTube, LinkedIn, Google Business Profile and Pinterest through approved provider APIs. Use Composio where its supported tool contracts cover the required operation. Do not copy Postiz AGPL code into this MIT project.
5. **Team:** organizations, categories/channels, roles, DMs, threads, attachments with a file-size cap, names and membership checks. Selected messages can become a task; the chosen local executor must accept it before creating an isolated worktree. Chat messages must never directly execute commands. Voice/video are later work.
6. **Billing:** Stripe subscription entitlements and a credit ledger together; signed webhooks and idempotent grants. Final prices and allowances require measured operating costs and owner approval.
7. **Distribution:** signed Windows installers, notarized Apple Silicon and Intel builds, updater signing, provenance and upgrade/recovery verification. No public download until signatures and parity gates pass. App stores follow direct downloads.
8. **Web:** Cryzo landing page, docs and download links on Vercel, connected only to verified releases. Keep the previous Cryzo website/database/deployment separate.

Each feature must be working and verified before it is shown as available. Do not replace unfinished integrations with success responses, placeholder controls, or fallback calls into the old engine.

## Source and licensing

Baseline commit and catalog digest are recorded in `baseline.json`. `node native/freeze.mjs` regenerates the inventory from the checked-in upstream snapshot. Review any baseline change intentionally.

The original repository's MIT license and notices remain intact. New Cryzo code is MIT. The OpenCode name/assets in the upstream tree are reference material, not a claim of affiliation. Never copy Postiz code without separately resolving its AGPL obligations.
