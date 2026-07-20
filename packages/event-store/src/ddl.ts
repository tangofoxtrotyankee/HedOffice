/**
 * SQLite schema for the HedOffice event store.
 *
 * The `events` table is the append-only source of truth (ADR-001). The
 * projection tables are derived, disposable read models rebuilt from events —
 * their DDL is defined here for forward-compatibility, but populating them is
 * Phase 1+ work. In Phase 0 we prove append + replay over `events` itself.
 *
 * See docs/ARCHITECTURE.md (data model).
 */
export const DDL = /* sql */ `
CREATE TABLE IF NOT EXISTS events (
  event_id       INTEGER PRIMARY KEY AUTOINCREMENT,  -- total order
  agent_id       TEXT    NOT NULL,
  stream_id      TEXT    NOT NULL,
  type           TEXT    NOT NULL,
  payload        TEXT    NOT NULL,                    -- JSON
  ts             INTEGER NOT NULL,                    -- epoch ms
  actor          TEXT    NOT NULL CHECK (actor IN ('user','agent','system')),
  correlation_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_events_agent  ON events (agent_id, event_id);
CREATE INDEX IF NOT EXISTS idx_events_stream ON events (stream_id, event_id);
CREATE INDEX IF NOT EXISTS idx_events_type   ON events (type, event_id);

-- Derived projection tables (rebuilt from events; populated in Phase 1+).
CREATE TABLE IF NOT EXISTS notebooks (
  agent_id   TEXT PRIMARY KEY,
  content    TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id         TEXT PRIMARY KEY,
  agent_id   TEXT NOT NULL,
  title      TEXT NOT NULL,
  status     TEXT NOT NULL,
  detail     TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transcripts (
  agent_id  TEXT NOT NULL,
  turn      INTEGER NOT NULL,
  role      TEXT NOT NULL,
  text      TEXT NOT NULL,
  audio_ref TEXT,
  PRIMARY KEY (agent_id, turn)
);

CREATE TABLE IF NOT EXISTS agents (
  agent_id   TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  token_hash TEXT,
  created_at INTEGER NOT NULL,
  stage      TEXT NOT NULL DEFAULT 'supervised'
             CHECK (stage IN ('observe','supervised','autonomous'))
);

-- Operator-authored role/boundaries document per cubicle (docs/INTEGRATION.md).
CREATE TABLE IF NOT EXISTS charters (
  agent_id   TEXT PRIMARY KEY,
  content    TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL
);

-- Shared governance library: operator-authored, path-addressed markdown docs
-- (constitution.md, ethics.md, decision_trees/*, …) readable by every agent.
CREATE TABLE IF NOT EXISTS library_docs (
  path       TEXT PRIMARY KEY,
  content    TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS presence (
  agent_id      TEXT PRIMARY KEY,
  status        TEXT NOT NULL,
  last_activity INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS cost_ledger (
  agent_id      TEXT    NOT NULL,
  ts            INTEGER NOT NULL,
  model         TEXT    NOT NULL,
  input_tokens  INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  usd           REAL    NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cost_agent ON cost_ledger (agent_id, ts);
`;
