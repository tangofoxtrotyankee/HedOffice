# HedOffice — Visual Design System

## "A Warm Mission-Control TUI" (v1)

> The spec for **Phase 4 — Office UX** (see [ROADMAP.md](ROADMAP.md)). Docs only
> today; no UI is built yet. UI follows the headless Phases 2–3.

## North star

**HedOffice is a warm mission-control TUI** — a beautiful retro text-mode console
for running a team of AI agents, where every cubicle is a hand-drawn box, every
agent's status is a glyph, and the "cold terminal" feeling is deliberately warmed
into something calm, friendly, and human.

The core move: keep the developer-native TUI chrome (monospace, box-drawing, a
real terminal feed) but pour **Headspace-style warmth** over it — a cream/charcoal
palette and a hero orange — so the terminal reads as a cozy mission control you
*want* to walk into, not a cold hacker console.

**Emotional goals (priority order):** Deliberate › Calm › Legible › Friendly ›
Developer-native.

**Principles:**
- *Text is the material.* Boxes, dividers, meters, glyphs are all type; embrace the grid.
- *Warm the cold, don't fight it.* Keep terminal language; change its temperature.
- *One aesthetic, executed precisely.* No glossy/Material mixing — coherence is the premium signal.
- *Hierarchy through weight, lightness, and box-style — color is the accent, not the structure.*
- *Glyph + color, never color alone.*

## Color system

Author in **OKLCH** for perceptually-even light/dark contrast; ship the sRGB hex
below as `@supports` fallbacks. All body text passes WCAG **AA** (≥4.5:1) on every
surface; primary text passes AAA.

### Light — "Daylight Office" (warm cream)

| Token | Hex | Role |
|---|---|---|
| `bg/base` | `#FBF3E6` | App background (warm paper, not white) |
| `bg/surface` | `#F4E9D4` | Cubicle/panel fill (depth without borders) |
| `bg/surface-raised` | `#EFE0C6` | Expanded cubicle, modals |
| `bg/inset` | `#33291F` | Terminal feed inset (dark "computer screen" well) |
| `border/hairline` | `#E2D2B4` | Faint box-drawing rules |
| `border/strong` | `#A8754A` | Active/focused box outline (≥3:1) |
| `ink/primary` | `#2C2620` | Primary text (~13:1, AAA) |
| `ink/secondary` | `#5A4F42` | Secondary/metadata (~6:1, AA) |
| `ink/muted` | `#766A59` | Dim/timestamp (~4.6:1, AA) |
| `accent/hero` | `#E8631A` | Hero orange — **fills / large text / UI only** (~3.4:1 on cream) |
| `accent/hero-ink` | `#B8480E` | Orange **text/links** on cream (~4.7:1, AA) |
| `accent/hero-on` | `#FFFFFF` | Text on hero-orange fills |

### Dark — "Night Shift" (warm charcoal, never #000)

| Token | Hex | Role |
|---|---|---|
| `bg/base` | `#1F1B17` | App background (brown-black, retro-CRT warmth) |
| `bg/surface` | `#272219` | Cubicle/panel fill |
| `bg/surface-raised` | `#322A1F` | Expanded cubicle, modals |
| `bg/inset` | `#161310` | Terminal feed well (deepest layer) |
| `border/hairline` | `#3A3127` | Faint rules |
| `border/strong` | `#C98A4E` | Active/focused outline (≥3:1) |
| `ink/primary` | `#F3E7D2` | Primary text (~13:1, AAA) |
| `ink/secondary` | `#CDBBA0` | Secondary (~8:1) |
| `ink/muted` | `#9A8B74` | Dim (~4.7:1, AA) |
| `accent/hero` | `#F5832F` | Hero orange (brighter for dark; ~7:1, AAA as text) |
| `accent/hero-on` | `#201A14` | Text on hero-orange fills |

### Semantic — presence/status & feedback

Color is **always** paired with a distinct glyph (and optional motion). Hues lean
on the CVD-robust blue/orange/yellow axis; `running` (green) vs `blocked`
(coral-red) are never separated by hue alone — `◉` solid vs `▓` shaded are
unmistakable in monochrome.

| Semantic | Light | Dark | Glyph | Meaning |
|---|---|---|---|---|
| `status/running` | `#2E7D5B` | `#5FB98C` | `◉` | Actively executing tool calls |
| `status/thinking` | `#C77A12` | `#E8B23E` | `◐` | Reasoning/streaming, no tool action yet |
| `status/idle` | `#6E8BA3` | `#8FB3CE` | `○` | Connected, awaiting work |
| `status/blocked` | `#C0461F` | `#F0795A` | `▓` | Needs approval / errored / waiting on human |
| `status/offline` | `#766A59` | `#9A8B74` | `·` | Disconnected / not provisioned |
| `feedback/success` | `#2E7D5B` | `#5FB98C` | `✓` | Completed OK |
| `feedback/warn` | `#C77A12` | `#E8B23E` | `!` | Caution / soft failure |
| `feedback/error` | `#C0461F` | `#F0795A` | `✗` | Hard error |
| `feedback/info` | `#2F6E8F` | `#6FB3D6` | `i` | Neutral information |

**Contrast notes:** pure hero orange is intentionally below 4.5:1 on cream — use
it only for fills/large text/UI (≥3:1) and use `accent/hero-ink` for orange text.
All focus/interactive borders meet the 3:1 non-text rule (WCAG 1.4.11).

## Typography

- **Body / UI / feed: JetBrains Mono** (free, OFL) — the workhorse, and the face
  documented to keep box-drawing crisp up to 120% line-height. Use the
  **non-ligature variant (JetBrains Mono NL)** for the terminal feed so `!=` / `->`
  don't merge; ligatures allowed in prose/notebook.
- **Display: Geist Mono** (free, OFL) — wordmark, splash/empty states, big headers.
- **Berkeley Mono — DEFERRED.** Premium, but its license restricts
  terminal/IDE-style *products*; do not adopt until cleared. Default to Geist Mono.
- **Departure Mono** (free) — optional retro pixel accent for boot/splash, used rarely.
- Keep the product chrome **all-monospace**; a warm geometric sans is permitted
  *only* for marketing/long-form help prose, never in app chrome.

**Type scale (8pt-aligned):** `display` 32/1.15 · `h1` 24/1.2 · `h2` 18/1.3 ·
`body` 16/1.5 · `ui` 14/1.45 · `feed` 13/1.4 · `meta` 12/1.4.

**Box-drawing line-height:** cap at **1.2** (prefer 1.0–1.15 for the tightest
frames) so vertical segments (`│ ║`) touch and render as continuous strokes.
Looser 1.4–1.5 only for prose blocks with no box-drawing. Set
`font-variant-numeric: tabular-nums lining-nums` globally; one uniform border
thickness (`--border-thickness: 1.5px`, bump to 2px if hairlines look weak) with
`font-weight: 500` for a sturdy unified stroke.

## ASCII layout system

The whole app sits on a **character-cell grid** (every element occupies whole
cells on both axes), using CSS `ch` units and a fixed line-box height. The floor
is conceptually an 80–120 column console that reflows at breakpoints.

### Box-hierarchy grammar

| Style | Chars | Means |
|---|---|---|
| Single | `┌─┐ │ └─┘` | **Cubicle** (one agent) — the default calm frame |
| Double | `╔═╗ ║ ╚═╝` | **Room / department** (v2 container) — "building within the building" |
| Rounded | `╭─╮ ╰─╯` | **Soft/friendly chrome** — outer shell, bottom bar, modals (Headspace rounding) |
| Heavy | `┏━┓ ┗━┛` | **Focus / selection** — the walked-into / keyboard-focused box (+ `border/strong`) |
| Dashed | `┄ ┆` | **Placeholder / empty seat / provisioning** |
| Block shades | `░ ▒ ▓ █` | **Meters, density, the `blocked` glyph** |

Decorative corner accents (`◆ ◈ ✦`) only sparingly (e.g. a pinned cubicle).

### Floor view (v1 single-agent) — mockup

```
╭──────────────────────────────────────────────────────────────────────────────╮
│  HEDOFFICE ▸ FLOOR 1 · MISSION CONTROL                          ◉ 3  ○ 2  ▓ 1  │
├────────────┬───────────────────────────────────────────────────────────────────┤
│ DEPARTMENTS│                                                                   │
│            │   ┌─ research ──────────◉─┐   ┌─ writer ────────────◐─┐           │
│ 1 ▸ ALL    │   │ ◉ running             │   │ ◐ thinking            │           │
│ 2   research│  │ » grep repo for auth  │   │ » drafting section 3  │           │
│ 3   writer │   │ tasks  ▓▓▓▓▒░ 4/6      │   │ tasks  ▓▓░░░░ 1/5      │           │
│ 4   ops    │   │ ░▒▓█▓▒░▒▓ activity     │   │ ░░▒▓▒░░░░ activity     │           │
│ 5   finance│   └───────────────────────┘   └───────────────────────┘           │
│            │                                                                   │
│ + add dept │   ┌─ ops ───────────────○─┐   ┌─ qa ─────────────────▓─┐           │
│            │   │ ○ idle                │   │ ▓ blocked             │           │
│            │   │ » waiting for task    │   │ » needs approval: rm  │           │
│            │   │ tasks  ░░░░░░ 0/0      │   │ tasks  ▓▓▓▓▓▒ 5/6      │           │
│            │   │ ········· activity     │   │ ▓▓▓▓▓▓▓▓▓ activity!    │           │
│            │   └───────────────────────┘   └───────────────────────┘           │
│            │                                                                   │
│            │   ┌┄ finance ┄┄┄┄┄┄┄┄┄┄┄·┄┐   (empty seat — click to provision)   │
│            │   ┆ · offline / unstaffed ┆                                       │
│            │   └┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄┘                                       │
╰────────────┴───────────────────────────────────────────────────────────────────╯
 ╭──────────────────────────────────────────────────────────────────────────────╮
 │ [ ✉ Messages ]   [ ⦿ Talk / Knock ]   [ 🔇 Mute ]   [ ⇲ Share ]   [ ⚙ Settings ]│
 ╰──────────────────────────────────────────────────────────────────────────────╯
```

### Expanded cubicle ("walked into research") — mockup

```
┏━ research ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ ◉ running ━┓
┃ ┌─ NOTEBOOK (memory) ───────────────┐  ┌─ TASKS ─────────────────────────┐ ┃
┃ │ • repo uses JWT in /auth/*        │  │ ✓ map auth endpoints            │ ┃
┃ │ • prefers ripgrep over grep       │  │ ◉ grep repo for auth  ◂ current │ ┃
┃ │ • TODO: confirm refresh-token TTL │  │ ○ summarize findings            │ ┃
┃ │                                   │  │ ○ open PR with notes            │ ┃
┃ └───────────────────────────────────┘  └─────────────────────────────────┘ ┃
┃ ┌─ TERMINAL · tool-call feed ───────────────────────────────────────────┐ ┃
┃ │ 12:04:21  ◉ run  rg "jwt" -n src/         → 14 matches                 │ ┃
┃ │ 12:04:22  ◉ read src/auth/verify.ts:1-48                               │ ┃
┃ │ 12:04:25  ◐ think  "verify uses HS256; check secret source"            │ ┃
┃ │ 12:04:27  ◉ run  rg "process.env" -n src/auth/  → 3 matches            │ ┃
┃ │ 12:04:29  ! warn  secret read from env at runtime                     ▌│ ┃
┃ └───────────────────────────────────────────────────────────────────────┘ ┃
┃ ┌─ TALK ────────────────────────────────────────────────────────────────┐ ┃
┃ │  ⦿ hold to talk   ▣▣▣▣▢▢▢ listening…   "hey, focus on refresh tokens"   │ ┃
┃ └───────────────────────────────────────────────────────────────────────┘ ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ [esc] step out ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
```

- **At rest** a cubicle is a compact card (name, presence glyph, one-line activity
  ticker, task counter, 1-row activity meter). **Walking in** expands to the 2×2
  panel workspace, upgrades the border to **heavy**, wraps in a rounded modal, and
  reveals via a brief iris/typewriter grow (not a slide).
- **Department rail** (left): numbered vertical list `N  name  <count glyphs>`;
  selected row gets a heavy left tick + `accent/hero` text; collapses to glyphs on
  narrow screens.
- **Bottom control bar:** one rounded pinned bar — Messages, Talk/Knock, Mute,
  Share, Settings; active toggles invert to a filled `accent/hero` chip.

## Presence & status glyph system

Five states, each a **distinct glyph + luminance + hue + optional motion** so it's
unambiguous in monochrome, in color, and to color-blind users.

| State | Glyph | Color | Motion |
|---|---|---|---|
| **running** | `◉` filled circle | sage green | slow pulse (~2s) |
| **thinking** | `◐` half circle | amber | gentle fill rotate (◐◓◑◒) |
| **idle** | `○` open circle | slate blue | none (steady) |
| **blocked** | `▓` heavy shaded block | coral-red | one attention blink on entry, then steady |
| **offline** | `·` middle dot | muted neutral | none, reduced opacity |

Red–green color blindness affects ~8% of males, so we never rely on red-vs-green
hue: every state has a structurally different glyph that survives grayscale,
states differ by luminance as well as hue, and motion is a third channel. The
floor header repeats glyphs with counts (`◉ 3  ○ 2  ▓ 1`) so status is readable as
plain text. Motion respects `prefers-reduced-motion` (falls back to static
glyph + color).

> **Backend mapping.** These five states are exactly the `PresenceStatus` enum in
> `packages/schema/src/primitives.ts`. The `PresenceEngine`
> (`packages/core/src/presence.ts`) infers `offline`/`idle`/`running` today;
> `thinking` and `blocked` are wired in **Phase 3** when the signals (user
> utterance awaiting reply, pending elicitation/approval) exist. Presence is always
> inferred, never self-reported (ADR-003/ADR-009).

## Component inventory

- **Cubicle card** — single-line box; header `┌─ name ───◉─┐` with inline glyph;
  body = activity ticker (`»`), task meter (`▓▓▒░ 4/6`), 1-row sparkline. Hover
  raises to `bg/surface-raised`; focus upgrades to heavy border.
- **Notebook panel** — `NOTEBOOK (memory)`; bulleted editable memory; `•` facts,
  `TODO:` in `feedback/warn`.
- **Task list** — rows prefixed with status glyphs (`✓ ◉ ○`); current task `◂
  current` in `accent/hero`; block-shade progress meter.
- **Terminal / tool-call feed** — dark inset well even in light theme; lines
  `HH:MM:SS  <glyph> <verb>  <detail> → <result>`; verbs colored by semantic; a
  block cursor `▌` blinks at the live tail; typewriter reveal for new lines.
- **Presence indicator** — the §glyph, inline in headers / rail counts / standalone dot.
- **Talk / voice control** — `⦿ hold to talk` + live input-level meter (`▣▣▣▢▢`);
  output waveform when the agent speaks; "Knock" variant with accept/deny gate.
- **Buttons** — bracketed `[ Label ]`; primary = `accent/hero` fill + rounded
  corners; secondary = hairline box; destructive = `feedback/error` outline that
  fills on confirm.
- **Modals / approval-gate** — rounded frame on `bg/surface-raised`, dimmed floor
  behind. The approval gate (the `blocked ▓` reason) shows the requested action
  verbatim in a feed-style inset with `[ ✓ Approve ]  [ ✗ Deny ]` — the most
  safety-critical component: strongest (heavy) border + attention blink. (Ties to
  the MCP elicitation approval gate in [SECURITY.md](SECURITY.md).)

## Motion & interaction

Motion communicates, never decorates; all of it respects `prefers-reduced-motion`.
- **Blinking block cursor `▌`** at the feed tail (~1s, 50% duty) — the one
  always-on motion ("alive").
- **Typewriter reveal** for new feed lines and "walking in" (~150–300ms).
- **Status motion** per the table, slow (≥1.5–2s) so the floor stays calm when busy.
- **Hover/focus** — instant lift + border emphasis (~120ms); heavy-border focus
  ring doubles as the keyboard-focus indicator (WCAG 2.4.7).
- **Scanlines / CRT glow** — optional, very restrained, **off by default**, never
  reduces contrast below AA.
- **Expansion** — quick iris/box-grow from the cubicle rect (~200ms), not a fade.

Budget: no parallax, no continuous decorative animation beyond cursor + slow
status pulses; everything else is event-driven (arrives, then rests).

## v1 → v2 visual path

The box-hierarchy grammar makes the evolution additive, not a redesign:
- **Departments become double-line `╔═╗` rooms** that contain single-line `┌─┐`
  cubicles — building › room › desk is already encoded by single-vs-double
  borders. "The Kitchen" is a rounded informal `╭─ the kitchen ─╮` room.
- **Wall-mounted shared boards** (Roam-style docs) render as titled panels joined
  into a room wall with tee characters (`╠═ board: roadmap ═╣`).
- **Agent-to-agent interaction** draws as box-drawing connectors (`├─▶`, `╪`)
  between cubicles, with a shared mini-feed in the room.
- The **same tokens, glyphs, type scale, and motion** carry across; only new
  *container* border-styles and connector glyphs are added. Nothing in v1 unwinds.

## Design tokens

Three tiers — **primitives → semantic (alias) → component** — as CSS custom
properties; light/dark are `[data-theme]` overrides on the *semantic* layer only
(components never reference primitives). Author colors in OKLCH where possible;
hex below are sRGB fallbacks.

```css
:root {
  /* ---------- PRIMITIVES (raw scales; never used directly in components) ---------- */
  /* warm neutrals — cream→charcoal */
  --cream-50:#FBF3E6; --cream-100:#F4E9D4; --cream-200:#EFE0C6; --cream-300:#E2D2B4;
  --char-900:#161310; --char-800:#1F1B17; --char-700:#272219; --char-600:#322A1F; --char-500:#3A3127;
  --ink-900:#2C2620; --ink-700:#5A4F42; --ink-500:#766A59;
  --paper-100:#F3E7D2; --paper-300:#CDBBA0; --paper-500:#9A8B74;
  /* hero orange ramp */
  --orange-700:#B8480E; --orange-600:#E8631A; --orange-500:#F5832F;
  /* accents */
  --green-600:#2E7D5B; --green-400:#5FB98C;
  --amber-600:#C77A12; --amber-400:#E8B23E;
  --slate-500:#6E8BA3; --slate-300:#8FB3CE;
  --coral-600:#C0461F; --coral-400:#F0795A;
  --sky-600:#2F6E8F;  --sky-400:#6FB3D6;

  /* ---------- SPACE (8pt + character-cell) ---------- */
  --space-0:0; --space-1:4px; --space-2:8px; --space-3:12px; --space-4:16px;
  --space-6:24px; --space-8:32px; --cell-w:1ch; --cell-h:1.2em;

  /* ---------- TYPE ---------- */
  --font-mono:"JetBrains Mono","JetBrains Mono NL",ui-monospace,monospace;
  --font-display:"Geist Mono",var(--font-mono); /* swap to Berkeley Mono only if license cleared */
  --fs-display:32px; --fs-h1:24px; --fs-h2:18px; --fs-body:16px;
  --fs-ui:14px; --fs-feed:13px; --fs-meta:12px;
  --lh-box:1.15;   /* box-drawing elements (cap at 1.2) */
  --lh-tight:1.3;  --lh-prose:1.5;
  --fw-regular:400; --fw-medium:500; --fw-bold:700;

  /* ---------- BORDER / BOX-STYLE ---------- */
  --border-thickness:1.5px; /* "monospace web" technique; bump to 2px if hairlines look weak */
  --box-single:"┌─┐│└┘";  --box-double:"╔═╗║╚╝";
  --box-round:"╭─╮│╰╯";   --box-heavy:"┏━┓┃┗┛"; --box-dashed:"┄┆";
  --radius-chrome:8px;     /* outer rounded shells/bars/modals only */
  --radius-default:0;      /* inner boxes stay square to honor the grid */

  /* ---------- MOTION ---------- */
  --motion-cursor:1s; --motion-status-slow:2s; --motion-typewriter:220ms;
  --motion-hover:120ms; --ease-standard:cubic-bezier(.2,.0,.2,1);
}

/* ---------- SEMANTIC (alias) — LIGHT (default) ---------- */
:root, [data-theme="light"]{
  --bg-base:var(--cream-50); --bg-surface:var(--cream-100);
  --bg-surface-raised:var(--cream-200); --bg-inset:#33291F;
  --border-hairline:var(--cream-300); --border-strong:#A8754A;
  --text-primary:var(--ink-900); --text-secondary:var(--ink-700); --text-muted:var(--ink-500);
  --accent-hero:var(--orange-600); --accent-hero-ink:var(--orange-700); --accent-hero-on:#FFFFFF;
  --status-running:var(--green-600);  --status-thinking:var(--amber-600);
  --status-idle:var(--slate-500);     --status-blocked:var(--coral-600); --status-offline:var(--ink-500);
  --feedback-success:var(--green-600);--feedback-warn:var(--amber-600);
  --feedback-error:var(--coral-600);  --feedback-info:var(--sky-600);
}
/* ---------- SEMANTIC (alias) — DARK ---------- */
[data-theme="dark"]{
  --bg-base:var(--char-800); --bg-surface:var(--char-700);
  --bg-surface-raised:var(--char-600); --bg-inset:var(--char-900);
  --border-hairline:var(--char-500); --border-strong:#C98A4E;
  --text-primary:var(--paper-100); --text-secondary:var(--paper-300); --text-muted:var(--paper-500);
  --accent-hero:var(--orange-500); --accent-hero-ink:var(--orange-500); --accent-hero-on:#201A14;
  --status-running:var(--green-400);  --status-thinking:var(--amber-400);
  --status-idle:var(--slate-300);     --status-blocked:var(--coral-400); --status-offline:var(--paper-500);
  --feedback-success:var(--green-400);--feedback-warn:var(--amber-400);
  --feedback-error:var(--coral-400);  --feedback-info:var(--sky-400);
}

/* ---------- COMPONENT (reference semantic only) ---------- */
:root{
  --cubicle-bg:var(--bg-surface); --cubicle-border:var(--border-hairline);
  --cubicle-border-focus:var(--border-strong);
  --feed-bg:var(--bg-inset); --feed-cursor:var(--accent-hero);
  --btn-primary-bg:var(--accent-hero); --btn-primary-fg:var(--accent-hero-on);
  --rail-active:var(--accent-hero); --gate-border:var(--feedback-error);
}
@media (prefers-reduced-motion:reduce){ :root{ --motion-cursor:0s; --motion-status-slow:0s; --motion-typewriter:0s; } }
```

Primitives carry no meaning and are never referenced by components; semantic
tokens flip entirely on `[data-theme]` (theme switching is a one-layer change);
component tokens reference semantics only. Inner boxes keep `--radius-default:0` to
honor the grid; only the outer "friendly" shells/bars/modals take
`--radius-chrome:8px` — exactly where the Headspace rounding warmth is injected
without breaking box alignment.

## Caveats

- **Headspace hex are unverified / our palette is original.** The palette is
  inspired by Headspace's *spirit* (warm hero orange on cream, friendly accents),
  not copied; don't represent any hex here as Headspace's official color.
- **All contrast ratios are computed estimates** — re-verify with a checker
  (WebAIM / CI contrast check) against final rendered colors, especially
  orange-on-cream and any semantic color used as text.
- **Box-drawing rendering varies** across macOS / Windows ClearType / Linux
  FreeType — test the real glyphs at target sizes on all three; define a minimum
  80-column layout with graceful narrow-screen reflow.
- **Font licensing is a real constraint** — JetBrains Mono + Geist Mono are
  OFL/free and safe; Berkeley Mono is paid and restricts terminal/IDE *products*
  (see ADR-008). Confirm permitted use before shipping it in chrome.
- **Emoji control-bar glyphs** (`✉ ⦿ 🔇 ⇲ ⚙`) are placeholders; replace with pure
  box-drawing/Unicode-symbol or a monochrome icon font for full text-mode coherence.
