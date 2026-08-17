# Nexus Support

Nexus Support is a full-stack AI customer support platform with a browser-based chat widget and a live admin dashboard. It supports AI-assisted conversations, realtime handoff to human agents, permissions capture, form collection, knowledge-base grounding, and WebRTC voice/video/screen-share calls.

The app is built around two main surfaces:

- `/widget` — customer-facing chat, permission prompts, multi-provider AI replies, and call controls
- `/admin` — operations dashboard for sessions, users, handoffs, forms, knowledge documents, AI config, and system settings

## What it does

- Answers customer questions using an AI provider chain with configurable fallbacks
- Grounds each reply in an admin-managed knowledge base and recent conversation context
- Only escalates to a human when the AI explicitly decides the user needs one
- Prevents handoff on greetings, thanks, small talk, or low-confidence conversational replies
- Keeps the live UI synchronized through Socket.IO and pushes session updates to Admin in realtime
- Persists sessions, user data, permissions, handoffs, and form submissions in SQLite
- Mirrors the database into a downloadable Excel workbook for reporting and export
- Includes WebRTC voice/video/screen sharing with browser permission handling and clean media teardown

## Core features

- AI chat widget with provider selection, persona guidance, and conversational summary memory
- Human takeover and release workflows for active sessions
- Realtime typing, session, and handoff notifications
- Permission consent management for location, camera, microphone, and screen access
- Knowledge-document ingestion from PDF, DOCX, Markdown, and TXT files
- Form-field and question-tree management for structured intake flows
- Exportable form submission reports filtered by date range
- Admin configuration for AI persona, rules, provider selection, and general company settings

## Tech stack

| Layer | Stack |
| --- | --- |
| Frontend | TanStack Start, React 19, Vite, Tailwind CSS v4, shadcn/ui |
| Backend | Express 5, Socket.IO, Multer |
| AI providers | Groq, OpenRouter, OpenAI, Google Gemini, NVIDIA NIM, Perplexity |
| Persistence | SQLite via better-sqlite3 + Excel mirror via ExcelJS |
| Document ingestion | PDF, DOCX, Markdown, TXT parsing |
| Testing | Vitest, Playwright, Python unittest |

## Project architecture

```text
server/
  app.ts                  # HTTP API layer and validation entry points
  index.ts                # API server bootstrap and realtime wiring
  realtime-server.ts      # Socket.IO room management and WebRTC signaling
  core/
    support-service.ts    # AI message processing, context setup, handoff decisions
    provider-registry.ts  # provider interface + fallback selection
    provider-adapters.ts  # OpenAI-compatible and Google adapters
    sqlite-repository.ts  # SQLite persistence, migrations, Excel mirror
    domain.ts             # permission normalization and question graph validation
    document-service.ts   # file text extraction for knowledge docs
src/
  routes/                 # widget and admin routes
  components/widget/      # chat UI, permission prompts, calls, forms
  lib/                    # API clients, realtime helpers, WebRTC logic, CRM store
run.py                   # one-command local launcher for the app and API
```

## Runtime behavior and safeguards

The system follows explicit handoff rules:

- Every AI-mode customer message is evaluated before a human handoff is created
- Greetings, thanks, short ambiguous messages, and low-confidence replies are not automatically escalated
- A handoff requires a clear `needs_human` decision and is blocked if verification fails
- There is no public browser endpoint for direct handoff escalation; the flow must pass through the backend service
- If a provider request fails, the app keeps the session active instead of pretending the AI answered

Realtime updates are pushed through Socket.IO for:

- chat updates
- typing indicators
- handoff state changes
- agent takeover and release events
- WebRTC signaling and calls

## Local development

### Requirements

- Node.js 22+
- npm
- Python 3.9+ for the launcher script

### Fastest start

```bash
python run.py
```

This starts the API and frontend together and opens the app in the browser. It also prints LAN and hotspot URLs for mobile access, including the Windows Mobile Hotspot pattern at `192.168.137.1` when available.

### Manual start

```bash
npm install
npm run dev:api
npm run dev
```

The API listens on port `8787` and the Vite frontend serves the widget/admin UI on its local port.

### Environment setup

Copy `.env.example` to `.env.local` and add only the provider keys you need. Keep all secrets server-side. The app loads them from the backend environment and never exposes them to the browser.

Example keys in `.env.local`:

```env
AI_PROVIDER=groq
GROQ_API_KEY=
OPENAI_API_KEY=
OPENROUTER_API_KEY=
GEMINI_API_KEY=
PERPLEXITY_API_KEY=
NVIDIA_API_KEY=
```

## Verification and quality checks

```bash
npm test                # Vitest unit/integration tests
npm run test:coverage   # test coverage report
npm run test:e2e        # Playwright end-to-end suite
npm run lint            # ESLint validation
npm run build           # production build
python test_run.py      # launcher validation tests
```

## Data model and persistence

The database is stored under `data/` and is kept in sync with an `.xlsx` workbook mirror. The app stores:

- users
- sessions
- messages
- permissions
- handoffs
- form fields
- question trees
- settings
- knowledge documents

Deleting a customer cascades to that customer’s sessions, messages, permissions, and handoffs in both the SQLite database and the mirrored workbook.

## Notes for mobile and browser permissions

For mobile testing over a LAN or hotspot:

- use the exact URL printed by `run.py`
- ensure the device is on the same hotspot or LAN network
- allow Node.js through Windows Defender Firewall on private networks when needed
- prefer `https` or a secure dev tunnel for physical-device calls and screen sharing because browser media APIs require secure contexts

## Repository status

This project is configured for a GitHub repo at:

- https://github.com/RishuBurnwal/Chat-support.git

## License

This project is currently configured as a local workspace application without an explicit license file. If you intend to publish the project publicly, add a `LICENSE` file and confirm the appropriate open-source terms before distributing it.
