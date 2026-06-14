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

> Secret storage is accessed behind an interface so headless Phases 0–3 don't
> depend on a shell. See [DECISIONS.md ADR-005](DECISIONS.md).

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

## Audit logging

Every tool call, result, approval decision, connection, and security event is an
immutable row in the event log (`tool.called`, `tool.result`, `approval.*`,
`audit.security_event`). Because the log is append-only and totally ordered, it
doubles as a **tamper-evident audit trail**.
