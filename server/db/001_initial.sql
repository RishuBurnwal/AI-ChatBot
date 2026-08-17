CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  phone text,
  email text NOT NULL,
  age text,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL CHECK (mode IN ('ai', 'human')),
  status text NOT NULL CHECK (status IN ('active', 'closed', 'handoff')),
  provider_used text,
  model_used text,
  agent_id text,
  summary text NOT NULL DEFAULT ''
);

CREATE TABLE messages (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sender text NOT NULL CHECK (sender IN ('user', 'ai', 'agent', 'system')),
  text text NOT NULL,
  confidence real,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX messages_session_created_idx ON messages(session_id, created_at);

CREATE TABLE permission_consents (
  session_id uuid PRIMARY KEY REFERENCES sessions(id) ON DELETE CASCADE,
  location text,
  camera text,
  microphone text,
  screen_share text,
  ip text,
  isp text,
  device_info jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE kb_documents (
  id uuid PRIMARY KEY,
  filename text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE kb_chunks (
  id uuid PRIMARY KEY,
  document_id uuid NOT NULL REFERENCES kb_documents(id) ON DELETE CASCADE,
  text text NOT NULL,
  embedding vector(1536)
);
CREATE INDEX kb_chunks_embedding_idx ON kb_chunks USING hnsw (embedding vector_cosine_ops);

CREATE TABLE provider_configs (
  id uuid PRIMARY KEY,
  provider text NOT NULL UNIQUE,
  model text NOT NULL,
  api_key text NOT NULL,
  active boolean NOT NULL DEFAULT false
);

CREATE TABLE questions (
  id text PRIMARY KEY,
  text text NOT NULL,
  next_question_ids text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE handoff_requests (
  id uuid PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  reason text NOT NULL,
  confidence real NOT NULL,
  status text NOT NULL CHECK (status IN ('pending', 'accepted', 'resolved')),
  resolved_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
