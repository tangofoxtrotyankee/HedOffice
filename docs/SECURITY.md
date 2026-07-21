# HedOffice — Security (v1 baseline)

## Inverted trust model

HedOffice **inverts the usual MCP trust model**: instead of an agent we trust
calling untrusted servers, *we* run the server and **untrusted / third-party
agents call us**. The assets to protect are the user's machine, the
notebook/transcript data, API keys, and the integrity of office actions.

> MCP security is an unsolved area industry-wide. Prompt injection has no robust
> general mitigation, and documented tool-poisoning/injection success rates are
> high (e.g. **84.2% with auto-approval enabled**; Palo Alto Unit 42 found a
> **78.3%** success rate when a single compromised server sits among five
> connected servers). This baseline **reduces but cannot eliminate** risk.

## Primary threats (mapped to OWASP MCP Top 10)

- **Prompt injection via tool results / poisoned notebook** (MCP10: Context
  Injection & Over-Sharing) — a malicious agent (or data it ingested) writes
  adversarial content into a notebook/task that later influences the user or
  another agent (v2). **Mitigation:** treat all agent-written content as
  untrusted; render with clear provenance/data-marking; never auto-execute
  notebook content; in v2, datamark cross-agent content. Because the documented
  injection success rate is so high, the **approval gate is non-optional**.
- **Confused deputy / over-privileged tools** — an agent calling office tools
  beyond its remit. **Mitigation:** per-agent capability scoping (each cubicle's
  agent gets a tool allowlist); least privilege by default.
- **Tool poisoning / rug-pulls** (Invariant Labs, April 2025; CVE-2025-54136
  "MCPoison" is the canonical config-rewrite example) — less relevant since *we*
  author the tools, but the inverse risk (a malicious agent abusing legit tools)
  is mitigated by approval gates + rate limits.
- **Token mismanagement & secret exposure** (MCP01) / **SSRF** — agents must not
  use office tools to exfiltrate keys or reach internal URLs. **Keys never
  transit to agents; tools never proxy arbitrary outbound requests.**

## Secrets storage

Store all API keys in the **OS keychain** (macOS Keychain, Windows Credential
Manager/DPAPI, Linux libsecret). In a desktop shell, prefer the built-in
`safeStorage`-style API over the archived `keytar`; access secrets only from the
trusted main process. **Never** write keys to config files or the event log.
Decrypt on demand; hold in memory only as needed.

> Secret storage is accessed behind a `SecretStore` interface
> (`apps/desktop/electron/secrets.ts`) so headless Phases 0–3 don't depend on a
> shell. **Implemented:** `ElectronSecretStore` encrypts each secret with
> `safeStorage` (OS keychain) and persists base64 to a `0600` userData file,
> accessed only from the main process; it refuses to store a secret if OS
> encryption is unavailable (no plaintext fallback). `InMemorySecretStore` backs
> headless dev/tests. See [DECISIONS.md ADR-005](DECISIONS.md).

## Agent authn / authz

v1 single-user baseline:
- When the user registers an agent in a cubicle, HedOffice mints a **per-agent
  bearer token**; the agent presents it (Authorization header on the Streamable
  HTTP connection).
- **Validate `Origin`/host on every connection.** The 2025-11-25 spec requires
  servers to respond with **HTTP 403 Forbidden for invalid `Origin` headers**
  (DNS-rebinding protection for localhost).
- Full OAuth 2.1 (resource server, PKCE, RFC 8707 resource indicators, CIMD) is
  the documented path but **deferred** — overkill for a single local user, no
  added security for localhost. Design the auth seam so it can be added for a
  future cloud-deploy story.

## Tool permissioning & approval gates

Each tool is tagged with a sensitivity level:
- **Read tools** (`notebook.read`, `task.list`) → **auto-allow**.
- **Mutating / sensitive tools** → route through an **approval gate** using MCP
  **elicitation** to surface a structured confirmation to the user before the
  action proceeds.
- Per-agent policy can set actions to `auto` / `prompt` / `deny`. Given the
  84.2% auto-approval attack figure, the **default for mutating tools is
  `prompt`, never `auto`**.

> **Implemented (Phase 3):** `ApprovalGate` in `@hedoffice/core` gates the
> record-mutating tools (`notebook.write`/`append`, `task.create`/`update`) — the
> set in `MUTATING_TOOLS`. `channel.say` is *not* gated (it is the agent's
> conversational output, not a record mutation). The gate emits
> `approval.requested`/`approval.resolved` and flips presence to `blocked` while
> pending. The human decision comes from an injected `approver` (the UI in Phase
> 4; MCP elicitation is the transport). If no approver is wired in headless dev,
> the gate falls through to allow **and logs an `audit.security_event`** — so
> production must register an approver. Default policy is `prompt`.

## Staged permissions (per-agent trust ladder)

Each registered agent carries a **permission stage** that sets the *default*
gate policy for the mutating tools (per-tool overrides still win):

| Stage        | Gate policy | Meaning                                        |
|--------------|-------------|------------------------------------------------|
| `observe`    | `deny`      | read + channel only — first-link / testing     |
| `supervised` | `prompt`    | human approves each mutating action (default)  |
| `autonomous` | `auto`      | allowed, still fully audit-logged              |

New agents registered through the operator surfaces (CLI / admin API) start at
`observe`; promotion is an explicit operator act (`agents stage …` or
`POST /admin/agents/:id/stage`) and every change emits `agent.stage_changed`.
Revocation (`agent.revoked`) nulls the token hash — the kill switch — while
keeping the cubicle's history. See [INTEGRATION.md](INTEGRATION.md) for the
rollout playbook.

## Audit logging

Every tool call, result, approval decision, connection, and security event is an
immutable row in the event log (`tool.called`, `tool.result`, `approval.*`,
`audit.security_event`). Because the log is append-only and totally ordered, it
doubles as a **tamper-evident audit trail**.

---

# Threat model (Phase 5 — STRIDE)

> **Status: threat model complete (Prompt 5A); session hardening + kill switch
> implemented (Prompts 5B/5C).** The analysis below cites the code as it stood
> when the model was written; the **Fix status** table at the end records what
> has since landed. Fix IDs (F1…F18) are collected in the ranked fix list;
> effort is **S** (≤½ day), **M** (1–2 days), **L** (3+ days). This section
> satisfies R5.1 of [ROADMAP_PHASES_5-10.md](ROADMAP_PHASES_5-10.md).

**Assets:** the user's machine; notebook/task/transcript/charter/library data;
per-agent bearer tokens + the admin token; provider API keys; the integrity of
office actions (nothing fires without the right gate); the audit log itself.

**Trust boundaries:** (1) BYO agent ⇄ MCP endpoint `/mcp`; (2) browser ⇄
`/admin/*` and `/ui/api/*` on the hosted deploy; (3) Electron renderer ⇄ main
process IPC; (4) HedOffice process ⇄ other processes of the same OS user;
(5) external content ⇄ agent context (prompt injection — Phase 9 formalises
this one).

## T1 — Hostile / compromised BYO MCP client

*STRIDE: Spoofing, Tampering, Denial of service, Elevation of privilege.*

- **T1.1 Connect without a valid token.** Attack path: POST `initialize` with
  no/garbage bearer. **Mitigated:** the bearer is resolved against the hashed
  registry at initialize (`packages/mcp-server/src/server.ts:89-123`,
  `packages/core/src/agents.ts:146-151`); failure appends
  `audit.security_event` (`auth_failed`) and returns 401. Tokens are 256-bit
  random (`agents.ts:44`). Gap: none at initialize.
- **T1.2 Abuse legitimate tools to mutate records.** Attack path: a compromised
  agent calls `notebook.write` / `task.*` with adversarial content.
  **Mitigated:** the approval gate covers `MUTATING_TOOLS`
  (`packages/core/src/approvals.ts:140-145`) with stage-derived policy
  (`approvals.ts:12-16`), default `prompt`. **Gaps:** (a) when **no approver is
  registered**, a `prompt` policy **auto-allows** and only logs
  `approval_no_approver` (`approvals.ts:103-119`) — on the hosted deploy this
  is reachable whenever `HEDOFFICE_ADMIN_TOKEN` is unset (`apps/server/src/boot.ts:68-79`);
  (b) the **desktop app never wires `stageLookup`** (passes
  `defaultPolicy:"prompt"`, `apps/desktop/electron/main.ts:32-35` vs
  `packages/core/src/office.ts:46-50`), so per-agent stages are ignored
  locally. **Fixes:** F1 (fail closed with no approver, S), F2 (wire
  `stageLookup` on desktop, S).
- **T1.3 Flood the event log / oversized payloads.** Attack path: loop
  `notebook.append` with ~2 MB bodies. **Mitigated (partial):** global
  `express.json({limit:"2mb"})` (`server.ts:58`); every tool input is
  Zod-validated for shape (`packages/schema/src/tools.ts`,
  `packages/event-store/src/store.ts:80-81`). **Gaps:** no per-field size caps
  (`NotebookWriteInput.content` is an unbounded `z.string()`, `tools.ts:14`);
  **no rate limiting anywhere** (`express-rate-limit` is in the lockfile but
  imported nowhere); no cap on session count. **Fixes:** F3 (content-length
  caps, S), F4 (per-session/per-IP rate limits, M).
- **T1.4 Keep operating after revocation.** Attack path: agent is revoked but
  its open session keeps calling tools. **Gap:** `revoke()` nulls the token
  hash but **explicitly does not close live sessions**
  (`packages/core/src/agents.ts:76-96`), and nothing re-checks auth
  post-initialize (see T4.2) — so a revoked agent runs until it disconnects.
  **Fix:** F5 (revocation terminates live sessions — folds into the Prompt 5C
  kill-switch work, S).

## T2 — Prompt-injected agent content

*STRIDE: Tampering, Elevation of privilege (via the agent as confused deputy).*

- **T2.1 Poisoned content steers the agent into mutations.** Attack path:
  adversarial text enters the agent's context (notebook it re-reads, a user
  utterance, or — from Phase 9 — external content) and instructs it to misuse
  tools. **Mitigated:** the approval gate is non-optional for mutations with
  default `prompt` (see T1.2); tool-call events log an `argsHash`, not raw
  arguments (`packages/mcp-server/src/tools.ts:52-58`), so the log can't be
  used as an injection amplifier; the library is read-only to agents (no write
  tool exists, `docs/ARCHITECTURE.md` v1 tool set). **Residual risk
  (accepted):** prompt injection has no robust general mitigation (see the
  header of this doc); `channel.say` is deliberately ungated, so an injected
  agent can *say* anything to the user — treat everything an agent says as
  untrusted output. The structural answer is staged permissions (Phase 7) and
  the untrusted-content envelope (Phase 9, R9.6). **Fix now:** F6 (keep
  default `prompt`; add the injection drill to TESTING.md, S).

## T3 — Secrets exfiltration

*STRIDE: Information disclosure.*

- **T3.1 Agent-reachable secret paths.** **Mitigated (verified absent):**
  provider keys never transit to agents; no tool proxies outbound requests; no
  agent input reaches `fs`, `child_process`, or SQL text (all queries
  parameterized — `store.ts`, `agents.ts`, `cubicle.ts`, `library.ts`; no
  `child_process`/`exec` imports exist in app/package source). Event payloads
  carry content **hashes**, not content (`packages/schema/src/events.ts:37-107`).
- **T3.2 Local key storage.** **Mitigated:** `ElectronSecretStore` encrypts via
  `safeStorage`, persists 0600, **refuses plaintext fallback**
  (`apps/desktop/electron/secrets-electron.ts:20-34`). **Gap:** R5.3's
  boot-time plaintext-secret check doesn't exist yet (nothing to catch a
  future regression). **Fix:** F7 (startup scan refusing to boot on plaintext
  keys in config, S).
- **T3.3 Token leakage on the hosted deploy.** **Gaps:** (a) an empty registry
  auto-seeds a `demo` agent and **prints its bearer token to stdout**
  (`apps/server/src/boot.ts:89-92`, `apps/server/src/index.ts:55`) — deploy
  logs become a credential store unless `HEDOFFICE_DEMO_AGENT=0`; (b) the UI
  accepts the operator token as a **`?token=` query param** for SSE
  (`apps/server/src/ui.ts:80-96`), which lands in server/proxy logs;
  (c) admin/UI token comparisons use `!==`, not constant-time
  (`apps/server/src/admin.ts:29`, `ui.ts:84`). **Fixes:** F8 (demo agent
  opt-in, not opt-out, S), F9 (`timingSafeEqual` everywhere a token is
  compared, S), F10 (short-lived derived SSE ticket instead of the raw token
  in the query string, M).
- **T3.4 Token-hash strength.** `sha256(token)` unsalted, single round
  (`packages/core/src/ids.ts:9-11`). **Accepted risk:** inputs are 256-bit
  random, so offline brute force is infeasible; salting adds nothing for
  non-human-chosen secrets. Revisit only if operator-chosen tokens are ever
  allowed (env-seeded tokens already enforce ≥32 chars,
  `apps/server/src/env-agents.ts:43-48`).

## T4 — Session-ID guessing / replay

*STRIDE: Spoofing.*

- **T4.1 Guessing.** **Mitigated:** `Mcp-Session-Id` is `crypto.randomUUID()`
  (`packages/mcp-server/src/server.ts:129`) — 122 bits of randomness;
  guessing is infeasible.
- **T4.2 Replay / theft.** Attack path: any process that observes a live
  session ID (logs, proxy, another local process) replays it. **Gap (the big
  one):** after initialize, requests are served **on session ID alone** — no
  bearer re-check, no origin binding, no expiry
  (`server.ts:96-100`, `server.ts:150-158`). The session ID is a
  bearer-equivalent credential. Sessions live until `transport.onclose`
  (`server.ts:139-144`); `PresenceEngine.idleMs()` is computed but never
  enforced (`packages/core/src/presence.ts:154-156`). On the hosted deploy,
  DNS-rebinding protection is **disabled** and `allowedOrigins` is never set
  (`apps/server/src/boot.ts:64`). **Fixes (this is Prompt 5B):** F11 (idle
  timeout, default 30 min, M), F12 (reject + `security.violation` event on
  replay from a new origin, M), F13 (optional per-request bearer re-check
  under `HEDOFFICE_REQUIRE_TOKEN=1`, M), F14 (set `allowedOrigins`/re-enable
  rebinding protection from env on the hosted deploy, S).

## T5 — Hostile local process reading the SQLite file

*STRIDE: Information disclosure, Tampering.*

- **T5.1 Read the DB.** Attack path: any same-user process opens the DB (and
  its `-wal`/`-shm` sidecars) and reads notebooks, transcripts, charters,
  library docs. **Mitigated (partial):** agent tokens appear only as SHA-256
  hashes (`agents.ts:45-50`); provider keys are never in the DB. **Gaps:** the
  DB file is created with default umask — no explicit 0600
  (`packages/event-store/src/store.ts:55-58`; contrast the secrets file) — and
  there is **no encryption at rest**. **Fixes:** F15 (chmod 0600 on DB +
  sidecars at open, S). **Accepted risk:** full at-rest encryption (SQLCipher,
  L) is deferred — HedOffice is local-first and the OS user account is the
  trust boundary; a hostile process running *as the user* can also read
  process memory, so DB encryption buys little until there's a threat model
  requiring it (e.g. multi-user machines). Documented here as accepted.
- **T5.2 Tamper with the log.** Append-only store with no update/delete API
  (`store.ts:44-50`) gives tamper-evidence *through the app*; direct SQLite
  writes bypass it. Same accepted OS-user boundary as T5.1.

## T6 — Hosted deploy (Railway) browser UI & admin surface

*STRIDE: Spoofing, Information disclosure, Denial of service.*

- **T6.1 Reach operator surfaces.** **Mitigated:** the entire admin + UI
  surface is **absent unless `HEDOFFICE_ADMIN_TOKEN` is set**
  (`apps/server/src/boot.ts:68`); every route requires the bearer
  (`admin.ts:26-41`, `ui.ts:80-96`) and failures append `audit.security_event`;
  env-seeded tokens must be ≥32 chars or boot throws
  (`env-agents.ts:43-48`); the admin API is secret-free by design — no route
  returns or accepts a token (`admin.ts:16-20`); approvals auto-deny after
  `HEDOFFICE_APPROVAL_TIMEOUT_MS` (default 5 min, `boot.ts:73-79`).
- **T6.2 Cross-origin / browser-borne attacks.** **Gaps:** no CORS policy, no
  `helmet`, no CSP on the served UI (deps absent from
  `apps/server/package.json`, no imports anywhere); plus the origin gaps of
  T4.2 and the token-leak paths of T3.3. **Fixes:** F16 (helmet + CSP +
  explicit CORS deny-by-default, S), F14, F10.
- **T6.3 Brute force / DoS on auth endpoints.** **Gap:** no rate limiting on
  `/mcp` initialize, `/admin`, or `/ui` (see T1.3). 32-char minimum tokens
  make brute force impractical, but failures are also unthrottled log-writers
  — an attacker can grow the event log via `auth_failed` appends. **Fix:** F4.

## T7 — Electron renderer (local UI)

*STRIDE: Elevation of privilege.*

- **T7.1 Renderer compromise → office takeover.** **Mitigated:**
  `contextIsolation: true`, `nodeIntegration: false`, typed preload bridge
  (`apps/desktop/electron/main.ts:50-59`, `preload.ts:14-32`); Electron 33
  sandboxes renderers by default. **Gaps:** `sandbox`/`webSecurity` are not
  pinned explicitly and there is no CSP; the IPC surface lets any renderer
  code call `registerAgent` — which **returns the plaintext bearer token to
  the renderer** (`handlers.ts:15-16`) — and `resolveApproval` for any
  pending approval (`main.ts:46-48`), with no per-channel authorization. A
  renderer XSS therefore mints agent credentials and self-approves gates.
  **Fixes:** F17 (pin `sandbox: true`, add CSP, S), F18 (stop returning the
  token over IPC — display once via a main-process dialog or copy-to-clipboard
  flow; require explicit user gesture for `resolveApproval`, M).

## Ranked fix list (for MD approval)

**Small (≤½ day each):**
| ID | Fix | Threat | Lands in |
|---|---|---|---|
| F1 | Approval gate fails **closed** when no approver is registered | T1.2 | Prompt 5B/5C adjunct |
| F2 | Wire `stageLookup` in the desktop app | T1.2 | Prompt 5B adjunct |
| F3 | Byte caps on notebook/task/charter/library content fields | T1.3 | Prompt 5B |
| F5 | Revocation terminates live sessions | T1.4 | Prompt 5C |
| F6 | Injection drill added to TESTING.md; default stays `prompt` | T2.1 | docs |
| F7 | Boot check: refuse to start if plaintext keys found in config (R5.3) | T3.2 | Prompt 5B |
| F8 | Demo agent becomes opt-**in** (`HEDOFFICE_DEMO_AGENT=1`) | T3.3 | Prompt 5B |
| F9 | `crypto.timingSafeEqual` for all token comparisons | T3.3 | Prompt 5B |
| F14 | Hosted deploy: `allowedOrigins` from env, rebinding protection on | T4.2/T6.2 | Prompt 5B |
| F15 | `chmod 0600` the SQLite DB + WAL/SHM at open | T5.1 | Prompt 5B |
| F16 | `helmet` + CSP + deny-by-default CORS on the hosted server | T6.2 | Prompt 5B |
| F17 | Pin `sandbox: true` + renderer CSP | T7.1 | Prompt 5B |

**Medium (1–2 days each):**
| ID | Fix | Threat | Lands in |
|---|---|---|---|
| F4 | Rate limiting: per-session tool calls, per-IP auth attempts | T1.3/T6.3 | Prompt 5B |
| F10 | Derived short-lived SSE ticket replaces `?token=` | T3.3 | Prompt 5B |
| F11 | Session idle timeout (default 30 min, configurable) | T4.2 | **Prompt 5B (R5.2)** |
| F12 | Origin-change replay → reject + `security.violation` event | T4.2 | **Prompt 5B (R5.2)** |
| F13 | Per-request bearer re-check under `HEDOFFICE_REQUIRE_TOKEN=1` | T4.2 | **Prompt 5B (R5.2)** |
| F18 | IPC hardening: no plaintext token to renderer; gesture-gated approvals | T7.1 | Prompt 5B adjunct |

**Large / deferred (accepted risks):**
- At-rest DB encryption (SQLCipher) — deferred, T5.1 rationale above.
- Full OAuth 2.1 — deferred as before (see *Agent authn/authz*).
- Prompt injection in general — cannot be eliminated; layered mitigations
  (gate, stages, Phase 9 quarantine) + drills. Residual risk accepted.
- Unsalted SHA-256 token hashing — accepted for 256-bit random tokens (T3.4).

> The `security.violation` event type (used by F12 and required by
> R5.2/Phase 6+) is now a first-class typed event
> (`packages/schema/src/events.ts`), alongside `system.killswitch`,
> `cubicle.suspend`, and `cubicle.resume` for R5.6. Existing
> `audit.security_event` emissions stay as-is (they remain the channel for
> *informational* events like `session_idle_expired`).

## Fix status (Prompts 5B / 5C)

Implemented in this phase, with tests:

| ID | Fix | Where | Proof |
|---|---|---|---|
| F1 | Approval gate **fails closed** (no approver ⇒ deny + `security.violation`) | `packages/core/src/approvals.ts`, `control.ts` | `core` integration test |
| F2 | Desktop honours per-agent stage (dropped the fixed `defaultPolicy`) | `apps/desktop/electron/main.ts` | typecheck |
| F3 | Per-field length caps on tool inputs | `packages/schema/src/tools.ts` | schema |
| F5 | Revocation stops a live session (per-call guard + force-disconnect) | `packages/mcp-server/src/tools.ts`, `apps/server/src/admin.ts` | `hardening.test.ts` |
| F7 | Boot refuses on a plaintext secrets file | `apps/server/src/preflight.ts` | `preflight.test.ts` |
| F8 | Demo agent is opt-**in** (`HEDOFFICE_DEMO_AGENT=1`) | `apps/server/src/index.ts` | — |
| F9 | Constant-time token comparison | `apps/server/src/auth.ts` (admin + ui) | — |
| F11 | Idle session expiry (default 30 min, configurable) | `packages/mcp-server/src/server.ts` | `hardening.test.ts` |
| F12 | Origin-change replay ⇒ 403 + `security.violation` | `packages/mcp-server/src/server.ts` | `hardening.test.ts` + harness |
| F13 | Per-request bearer re-check (`HEDOFFICE_REQUIRE_TOKEN=1`) | `packages/mcp-server/src/server.ts` | `hardening.test.ts` + harness |
| F14 | Hosted `allowedOrigins` from env re-enables rebinding protection | `apps/server/src/boot.ts` | — |
| F15 | `chmod 0600` the SQLite DB + WAL/SHM at open | `packages/event-store/src/store.ts` | — |
| F17 | Renderer `sandbox: true` pinned | `apps/desktop/electron/main.ts` | typecheck |
| — | **Kill switch** (global `killAll`/`liftKill`, per-cubicle `suspend`/`resume`) | `packages/core/src/control.ts`, admin API, CLI | `hardening.test.ts` |

Runnable adversarial proof: `pnpm --filter @hedoffice/harness security`.

**Still open (tracked, not yet done):**

- **F4** rate limiting (per-session tool calls, per-IP auth attempts) — M.
- **F10** short-lived SSE ticket to replace the `?token=` query param — M.
- **F16** `helmet` + explicit deny-by-default CORS + CSP on the hosted UI — S
  (deferred to avoid breaking the served renderer without a tested CSP).
- **F17 (CSP half)** a renderer Content-Security-Policy — the `sandbox` pin
  landed; the production CSP header is deferred with F16.
- **F18** IPC hardening: stop returning the plaintext agent token to the
  renderer, gesture-gate `resolveApproval` — M (UI-coupled).
- **Accepted risks** (unchanged): at-rest DB encryption, full OAuth 2.1,
  residual prompt injection, unsalted hashing of 256-bit random tokens.
