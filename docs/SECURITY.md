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
