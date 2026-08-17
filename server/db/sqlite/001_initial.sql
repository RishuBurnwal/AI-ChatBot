PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  age TEXT,
  address TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('ai', 'human')),
  status TEXT NOT NULL CHECK (status IN ('active', 'closed', 'handoff')),
  provider_used TEXT,
  model_used TEXT,
  agent_id TEXT,
  summary TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender TEXT NOT NULL CHECK (sender IN ('user', 'ai', 'agent', 'system')),
  text TEXT NOT NULL,
  confidence REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_session_created_idx ON messages(session_id, created_at);

CREATE TABLE IF NOT EXISTS permission_consents (
  session_id TEXT PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  location TEXT,
  camera TEXT,
  microphone TEXT,
  screen TEXT,
  ip TEXT,
  isp TEXT,
  device_info TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS handoff_requests (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  confidence REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted', 'resolved')),
  resolved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_documents (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  kind TEXT NOT NULL,
  status TEXT NOT NULL,
  size_kb REAL NOT NULL DEFAULT 0,
  uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_chunks (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  tokens TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS form_fields (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  field_key TEXT NOT NULL,
  type TEXT NOT NULL,
  required INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  text TEXT NOT NULL,
  parent_id TEXT REFERENCES questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
