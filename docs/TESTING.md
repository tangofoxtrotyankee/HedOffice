# HedOffice — Manual / On-Device Testing To-Do

Everything in the repo is **typechecked + unit-tested headlessly** (`pnpm check`,
currently ~95 tests across 6 packages + the app, plus 5 harness demos). This list
covers what could **not** be verified in the headless CI container and needs a
real machine, hardware, network, or a human eye. Work top to bottom; check items
off as you confirm them.

> Quick start on a dev machine:
> ```sh
> pnpm install && pnpm check          # build + typecheck + all unit tests
> pnpm --filter @hedoffice/harness multi-client   # + voice-loop / integration / floor-view
> pnpm --filter @hedoffice/desktop dev            # the UI in a browser (127.0.0.1:4318)
> ```

---

## 1. Desktop UI — visual & interaction (browser, `pnpm dev`)
- [ ] Floor renders; box-drawing cubicles align (no fragmented borders) at the
      default zoom. If boxes fragment, lower `--lh-box` before changing fonts.
- [ ] **Box-drawing across platforms/fonts** — check on macOS, Windows
      (ClearType) and Linux (FreeType); the `DESIGN.md` caveat flags rendering
      differences. Verify `╔═╗ ┌─┐ ╭─╮ ┄ ▓` and the glyphs `◉ ◐ ○ ▓ ·`.
- [ ] **Grayscale benchmark** — toggle the grayscale chip; every presence state is
      still distinguishable by glyph alone.
- [ ] **Theme** — light "Daylight Office" and dark "Night Shift" both legible;
      re-verify WCAG AA contrast with a checker (esp. hero-orange on cream, and
      every semantic status color as text).
- [ ] **Walk in** — click/Enter a cubicle → expanded panels; `esc`/backdrop closes.
- [ ] **Terminal feed** — blinking cursor, typewriter reveal, colored verb glyphs.
- [ ] **Approval modal** — unmistakable; `✓ Approve` / `✗ Deny` readable in mono.
- [ ] **Motion calm check** — only the cursor + slow status glyphs move; enable OS
      "reduce motion" and confirm all animation stops.
- [ ] **Department rail** filters the floor; **bottom bar** chips invert when active;
      **scanline** toggle stays subtle (text never drops below AA).
- [ ] **v2 rooms** toggle (`╔ Rooms`) — cubicles compose inside rooms unchanged.

## 2. Electron shell (`pnpm --filter @hedoffice/desktop electron:dev`)
> Needs a display. Build the renderer (`pnpm build`) + compile `electron/`
> (electron-vite or `tsc`), then launch Electron against `electron/main.ts`.
- [ ] App window opens; renderer loads; `contextIsolation` on, no `nodeIntegration`.
- [ ] **Live data** — register an agent; the floor reflects real event-log state
      (not the sample) and refreshes as the agent acts.
- [ ] **Approval round-trip** — a real agent calls a mutating tool → cubicle goes
      `blocked` → the modal appears → Approve lets it proceed, Deny refuses; both
      land in the event log (`approval.requested` / `approval.resolved`).
- [ ] **Secrets** — store/read/delete a provider key via `safeStorage` on each OS
      (macOS Keychain, Windows DPAPI, Linux libsecret); confirm the `secrets.json`
      contents are ciphertext and `0600`; confirm a graceful error when OS
      encryption is unavailable (no plaintext written).

## 3. MCP server with a real BYO agent
- [ ] Point an openclaw/Hermes-style client at `http://127.0.0.1:4317/mcp` with the
      `Authorization: Bearer <token>` from a registered agent; it discovers the
      tools and can read/write notebook, tasks, and channel.
- [ ] **Auth** — a wrong/absent token gets `401` + an `audit.security_event`.
- [ ] **DNS-rebinding** — a request with a disallowed `Origin` header gets `403`
      (configure `allowedOrigins`).
- [ ] **Many clients** — 3+ real agents concurrently stay isolated (no cross-cubicle
      leakage), and sessions clean up on disconnect (`terminateSession`).

## 4. Local audio (the part headless CI can't do)
> Needs a mic, a speaker, `sherpa-onnx-node`, and model downloads
> (Kokoro/Piper TTS, Zipformer/Moonshine STT, Silero VAD).
- [ ] Install `sherpa-onnx-node`; download models; implement the `LocalSttProvider`
      / `LocalTtsProvider` bodies (skeletons throw a setup error today).
- [ ] **Glass-to-glass latency** — measure warm end-to-end on the reference laptop.
      Target **< 800 ms** (ideal 500–650). *Benchmark gate:* if warm > ~1 s, make
      **Piper** the default and prompt for a hosted provider.
- [ ] **Barge-in** — speaking over the agent flushes playback + cancels TTS within
      ~100 ms (cancel on first VAD trigger, not silence-end).
- [ ] **First-sentence streaming** — the first sentence is voiced before the full
      reply arrives.
- [ ] **ElevenLabs provider** — set a real key; confirm streaming PCM playback and
      that `cancel()` aborts mid-stream. (Streaming/cancel logic is unit-tested
      against a fake; this verifies the real socket + audio.)
- [ ] *(optional)* **VoxCPM** — if a GPU is available, try it as the premium TTS
      provider via a Python sidecar (see `ARCHITECTURE.md` provider matrix).

## 5. Security & hardening (Phase 5)
- [ ] Threat-model pass against the OWASP MCP Top 10 (see `SECURITY.md`); confirm
      tools never proxy arbitrary outbound requests and keys never reach agents.
- [ ] Per-agent tool **allowlist / policy** (`auto` / `prompt` / `deny`) behaves as
      configured; default for mutating tools is `prompt`.
- [ ] Prompt-injection spot check — adversarial notebook/transcript content is
      rendered with provenance and never auto-executed.
- [ ] Confirm an approver is always registered in production (no silent
      "no-approver auto-allow" — that path emits an `audit.security_event`).

## 6. Packaging & release
- [ ] `electron-builder` (`electron-builder.yml`) produces installers on macOS
      (dmg), Windows (nsis), Linux (AppImage); each launches and runs.
- [ ] Code signing / notarization (macOS) and a signed Windows installer.
- [ ] SQLite + native audio addons are bundled and load from the packaged app.
- [ ] Fresh-machine install smoke test (no dev toolchain present).
- [ ] OSS release: license/readme/contributing, tagged `v1.0`, GitHub release.

## 7. Data & persistence
- [ ] Point the event store at a **file** (not `:memory:`); confirm WAL mode,
      that events survive a restart, and that projections rebuild by replay.
- [ ] Agent reconnect preserves notebook/task/transcript history (keyed by
      `agentId`, not `sessionId`).

---

### Known headless-verified (no manual action needed)
Schema/event-store/core/mcp-server logic, the voice-loop orchestration + barge-in
(modeled timings), presence inference (5 states), the approval gate + bridge,
the floor/cubicle geometry, the IPC handlers, and the secret-store interface are
all covered by `pnpm check`. The harness scripts (`multi-client`, `voice-loop`,
`integration`, `floor-view`) and previews (`preview-floor`, `preview-walkin`,
`preview-rooms`) run anywhere.
