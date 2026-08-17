# Codex Prompt — Backend, Integration & Testing

```
You are completing the BACKEND and full end-to-end INTEGRATION for an
AI-powered CRM + Live Support platform whose frontend UI already exists
(built separately). Your job: wire everything to real, working logic, and
verify every single feature with automated tests before marking it done.

⚠️ SCOPE: Do NOT implement authentication, RBAC, API-key encryption, audit
logging, per-tenant data isolation hardening, or any other security
feature in this phase. Leave clean, clearly-commented extension points
(e.g. a single `requireAuth()` middleware stub that currently no-ops) so
security can be layered in later without a rewrite. Focus entirely on
FUNCTIONAL correctness.

=== ARCHITECTURE TO IMPLEMENT ===
- Single backend (Node/Express or Next.js API routes) serving two frontend
  routes: /widget (customer) and /admin (agent/admin).
- PostgreSQL for structured data (users, sessions, messages, forms,
  questions, permissions, provider configs).
- pgvector (or a vector DB of your choice) for: (a) company knowledge base
  document embeddings, (b) conversation-memory recall.
- Socket.io for real-time chat + handoff notifications, one room per session.
- WebRTC (LiveKit or simple-peer) for voice call / video call / screen
  share, with proper signaling and clean call-teardown.

=== FEATURES TO WIRE UP (each must be fully working, not partial) ===

1. **Multi-provider AI adapter** — one interface, concrete implementations
   for OpenAI, OpenRouter, Google Gemini, NVIDIA NIM, Groq, Perplexity.
   Provider/model/API-key from Admin Settings (plain DB storage is fine for
   this phase). Must be trivial to add a 7th provider later (document the
   interface).

2. **Memory system** — KB upload endpoint (PDF/DOCX/MD/TXT) → text
   extraction → chunking → embedding → vector table, tagged to
   org/knowledge-base; RAG injection each AI turn. Conversation memory:
   rolling summary per session, updated every N messages, injected into
   context. AI must only answer within persona+KB+rules scope; enforce via
   explicit system-prompt instruction + a post-response scope check —
   out-of-scope questions get a polite decline, never hallucination.

3. **Confidence-based handoff** — AI response must return structured
   `{ confidence, needs_human, reason }` via function-calling/JSON-mode (not
   string parsing). Below-threshold or `needs_human=true` → create DB
   record → real-time Socket.io notification to available agents. Agent
   "take over" flips session mode `ai → human`; AI stays silent until
   released back.

4. **Multi-user concurrency correctness** — test 10+ concurrent sessions,
   verify zero context/message/memory leakage between them.

5. **Forms & question tree** — CRUD API for intake form fields; CRUD API
   for predefined questions with `next_question_ids` graph (supports
   branching/multiple children); endpoint to fetch full tree for the admin
   visualizer. Store filled form + permission-consent metadata (location,
   device info, IP, ISP lookup, camera/mic/screen status) against the
   session. Denied permission → store exactly `"No permission granted"`.

6. **Sessions & history** — every session stores user ref, date, transcript,
   form data, permission data, provider/model used, handoff events, agent
   who handled it. Build date→user grouped/paginated listing endpoints for
   the admin UI's folder-style view.

7. **Calling & screen share** — working voice/video call and screen-share
   between widget user and agent; proper join/leave/cleanup, no orphaned
   WebRTC connections.

=== TESTING REQUIREMENT (mandatory, non-negotiable) ===
- Automated tests (unit + integration — Jest/Vitest + supertest, Socket.io
  integration tests) for every feature above.
- No feature marked "done"/green unless its test suite passes.
- Explicitly test edge cases: denied permissions, provider API failure/
  fallback, empty knowledge base, out-of-scope question handling, handoff
  under concurrent load, session isolation under 10+ simultaneous chats,
  file upload of each supported doc type, malformed/cyclic question-tree.
- Produce a final test report / checklist mapping each feature → pass/fail.
  Do not report the project complete while any item is red or partially
  implemented. Nothing should be a stub pretending to be done.

Deliver working code with clear module boundaries so security (auth, RBAC,
encryption, audit logs, retention, export/delete) can be layered in later
without a rewrite.
```
