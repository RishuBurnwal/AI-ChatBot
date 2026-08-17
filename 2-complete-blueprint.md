# Complete Blueprint — Architecture & Best Practices

Phase 1 scope reminder: **security (auth/RBAC/encryption/audit logs/
retention/export/isolation-hardening) is deferred to Phase 2.** Only the
*functional* permission-consent flow (location/mic/camera/screen-share
prompts) is in scope now, since that's part of core product behaviour, not
a security feature.

Use this as your master reference — the source of truth all implementation
work should align to. You can also paste this directly to an AI
as a planning prompt: *"Review this blueprint and confirm/refine the
technical plan before I start building."*

## 1. System Overview

A single deployable application with two front-facing surfaces sharing one
backend:

- `/widget` — customer-facing chat + calling client
- `/admin` — agent/admin operations dashboard

Both talk to one API + one realtime layer + one database, so AI memory,
sessions, and configuration stay consistent across both.

## 2. Recommended Stack

| Layer | Recommendation | Why |
|---|---|---|
| App framework | Next.js (App Router) | One project, two routes, server actions, easy API routes |
| API layer | Node/Express (or Next.js API routes) | Simple, well-understood, huge ecosystem |
| Database | PostgreSQL | Relational data (users, sessions, forms, messages) + supports pgvector |
| Vector store | pgvector (in Postgres) or Pinecone/Qdrant | Knowledge-base + memory embeddings |
| Realtime | Socket.io | Chat messages + handoff notifications, one room per session |
| Voice/Video/Screen-share | LiveKit (self-host or cloud) or simple-peer + WebRTC | Handles calling/screen-share without hand-rolled signaling |
| Background jobs | BullMQ + Redis | Doc processing/embedding, summary generation, notification dispatch |
| File storage | S3-compatible bucket (or local disk for MVP) | Uploaded KB documents |

## 3. AI Provider Abstraction Layer

Single interface, one implementation per provider:

```
generateResponse({
  provider,     // "openai" | "openrouter" | "google" | "nvidia" | "groq" | "perplexity"
  model,
  apiKey,
  messages,
  systemPrompt,
  tools          // for structured confidence/handoff output
}) -> { text, confidence, needs_human, reason }
```

- Provider/model/API key configurable per-bot from Admin Settings (plaintext
  storage acceptable in this phase — Phase 2 encrypts it).
- New providers should be addable by writing one adapter file, no core logic
  changes.
- Use function-calling / JSON-mode (where supported) to get the
  `confidence`/`needs_human` signal reliably instead of parsing free text.

## 4. Memory System (2 tiers)

**A. Company Knowledge Base (long-term, admin-managed)**
Upload (PDF/DOCX/MD/TXT) → text extraction → chunking → embedding → stored
in vector table tagged by org/bot → retrieved via similarity search and
injected into the prompt on each AI turn (RAG pattern).

**B. Conversation Memory (per-session, self-updating)**
Rolling summary updated every N messages + last-K raw messages kept in
context window. Summary + KB-retrieved chunks + persona/system prompt +
rules = full context sent to the model each turn.

**Scope enforcement:** the system prompt explicitly instructs the model to
answer only within persona + KB + rules; a lightweight scope-check (or the
model's own `needs_human`/decline behavior) prevents answering outside
context — this is a *product-quality* control, not a security control.

## 5. Confidence-Based Handoff Flow

1. Every AI turn returns `{ confidence, needs_human, reason }`.
2. If `needs_human = true` OR `confidence < threshold` (configurable in
   Admin) → create a `handoff_request` record → emit Socket.io event to
   all available agents → show alert/badge in Admin "Live Chats."
3. Agent clicks "Take Over" → session mode flips `ai → human`; AI stops
   auto-replying until agent releases it back.
4. Widget shows "connecting you to a human agent..." banner during this
   transition.

## 6. Data Model (core entities)

- `users` (name, phone, email, age, address, created_at)
- `sessions` (user_id, date, mode [ai/human], provider_used, agent_id, status)
- `messages` (session_id, sender[user/ai/agent], text, timestamp)
- `forms` / `form_responses`
- `questions` (text, type, `next_question_ids[]` — graph structure for the tree)
- `permission_consents` (session_id, location, camera, mic, screen_share,
  ip, isp, device_info, status[granted/denied/"No permission granted"])
- `kb_documents` (filename, type, status, org/bot_id)
- `kb_chunks` (document_id, embedding, text)
- `provider_configs` (provider, model, api_key, active)
- `ai_persona` (system_prompt, rules[])
- `handoff_requests` (session_id, reason, confidence, status, resolved_by)

## 7. Session/"Folder" Structure

Represent as **virtual folders via DB query**, not literal filesystem
folders: group by `date` → `user` → `session`. Admin UI renders this as a
folder tree; underlying storage stays in Postgres for scalability/search.

## 8. Permissions Flow (functional, in-scope now)

- Admin toggles which permissions to request (Location / Camera / Mic /
  Screen-share) in Permissions Settings.
- Widget requests exactly those, individually, via browser Permissions API.
- Each result (granted/denied) + IP/ISP (server-side lookup) + device info
  saved against the session/form record by default.
- If denied → store literal value `"No permission granted"` for that field,
  and surface the same as an inline UI error.

## 9. Multi-User Concurrency (correctness, not security)

- One Socket.io room per session; server holds per-session context objects
  keyed by `session_id`, never shared or merged across sessions.
- Load-test target: 10+ concurrent sessions with zero context bleed.

## 10. Phase 2 Backlog (explicitly OUT of scope now)

- API keys stored server-side encrypted (KMS/vault)
- Customer data isolation hardening (tenant scoping enforced at query layer)
- Admin RBAC (roles/permissions matrix)
- Agent-level permission scoping
- Audit logs (who did what, when)
- Encryption at rest for sensitive fields
- Configurable data retention policies
- Deletion/export (GDPR-style) capability
- Hardened guarantee against unauthorized memory extraction
- Hardened guarantee against cross-user memory leakage (beyond the
  functional isolation already built in Phase 1)
