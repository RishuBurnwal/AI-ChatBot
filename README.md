# Nexus Support

Nexus Support is an AI-powered CRM and live-support application with two surfaces:

- `/widget` — customer chat, permissions, voice/video calls, screen sharing, and human handoff.
- `/admin` — live-chat operations, customer history, form submissions, knowledge base, AI persona, providers, and settings.

An AI assistant (configurable across Groq, OpenRouter, OpenAI, Google Gemini, NVIDIA, and Perplexity) answers customers in real time, is grounded in an admin-managed knowledge base, and only transfers a chat to a human agent after an explicit, AI-verified escalation decision.

## Features

- **AI chat widget** — multi-provider LLM replies with a rolling conversation summary and retrieval-augmented knowledge injection on every turn.
- **Live agent handoff** — AI-classified `needs_human` decisions create a handoff; greetings, thanks, short text, and low confidence alone never transfer a chat, and provider failure keeps the session active instead of faking a reply.
- **Realtime operations** — Socket.IO pushes messages, typing indicators, AI-verification status, handoff state, and agent-takeover updates between the widget and Admin.
- **Voice, video & screen share** — peer-to-peer WebRTC with real `MediaStream` tracks, ICE signaling, mute/video controls, and clean track cleanup.
- **CRM & history** — customers, sessions, transcripts, permissions, and handoffs persisted to SQLite and mirrored to a live Excel workbook you can download from Admin.
- **Admin dashboard** — Live Chats, Users & Sessions, Form Submissions, Forms Builder, Knowledge Base, AI Persona & Rules, AI Provider, Permissions, and General Settings.
- **Form submissions export** — date-filtered, formatted Excel download of every submitted customer form.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | TanStack Start, React 19, Vite, Tailwind CSS v4, shadcn/ui |
| Backend | Express, Socket.IO, Multer |
| AI providers | Groq, OpenRouter, OpenAI, Google Gemini, NVIDIA NIM, Perplexity (adapter interface) |
| Persistence | SQLite (`better-sqlite3`) + live Excel mirror (`exceljs`) |
| Documents | PDF, DOCX, Markdown, TXT extraction for the knowledge base |
| Tests | Vitest, Playwright (Chromium), Python `unittest` |

## Local development

Requirements:

- **Node.js 22 or newer** and npm.
- **Python 3.9 or newer** (only for the `run.py` launcher and its tests).

The easiest option starts everything and opens the widget automatically:

```sh
python run.py
```

Press `Ctrl+C` once to stop both servers.

The launcher binds the web app and API to all network interfaces and prints every detected LAN URL. When an Android phone is connected to Windows Mobile Hotspot, try the printed `192.168.137.1` URL first, for example:

```text
http://192.168.137.1:5173/widget
```

If the phone cannot connect, set the laptop network profile to **Private** and allow Node.js through Windows Defender Firewall on private networks. Keep the hotspot enabled and confirm both devices are on the same hotspot network. The port may be higher than `5173` if that port is already occupied, so use the exact URL printed by `run.py`.

Camera, microphone, and screen capture are browser-protected APIs. `localhost` is trusted, but a plain `http://192.168.x.x` address is not a secure context. Chat and realtime typing work over the LAN URL; for physical-device calls and screen sharing, expose the Vite URL through a trusted HTTPS development tunnel or deploy behind HTTPS. Android browser support for screen capture can vary, so verify `navigator.mediaDevices.getDisplayMedia` on the target browser.

Or start each process manually:

```sh
npm install
npm run dev:api
npm run dev
```

The UI runs on the Vite URL and proxies `/api` and Socket.IO to port `8787`.

Copy `.env.example` to `.env.local` and add only the provider credentials you intend to use. Keys remain server-side and are never returned to the browser.

## Verification

```sh
npm test                # unit + integration tests (Vitest)
npm run test:coverage   # test run with coverage report
npm run test:e2e        # Playwright end-to-end tests (needs `npx playwright install chromium` on first run)
npm run lint            # ESLint
npm run build           # production build
python test_run.py      # launcher tests
```

## Project structure

```text
server/                 # Express API, Socket.IO realtime, AI adapters, persistence
  app.ts                # HTTP API routes
  index.ts              # server bootstrap + realtime wiring
  realtime-server.ts    # Socket.IO rooms and WebRTC signaling
  core/
    provider-registry.ts  # AI provider interface + fallback chain
    provider-adapters.ts  # OpenAI-compatible, Google adapters
    support-service.ts    # AI turn evaluation, handoff decisions
    sqlite-repository.ts  # SQLite persistence + Excel mirror
    domain.ts             # permission + question-graph validation
    document-service.ts   # PDF/DOCX/MD/TXT text extraction
src/                    # TanStack Start frontend
  routes/               # /widget and /admin/* pages
  components/widget/    # chat panel, intake form, calls, permissions
  lib/                  # API client, CRM store, realtime, WebRTC
tests/                  # Playwright e2e specs
run.py                  # one-command launcher (LAN + hotspot URLs)
```

## Architecture

The provider interface and fallback registry live in `server/core/provider-registry.ts`. HTTP APIs are in `server/app.ts`; realtime session rooms and WebRTC signaling are in `server/realtime-server.ts`, wired up in `server/index.ts`.

All customer, session, message, permission, form, question, setting, and knowledge metadata is saved live to `data/nexus-support.sqlite`. Every successful mutation also refreshes `data/nexus-support.xlsx`. The workbook can be downloaded from the **Users & Sessions** page in Admin (full workbook) and the **Form Submissions** page (date-filtered). Deleting a customer cascades to that customer's sessions, messages, permissions, and handoffs in both files.

API keys are intentionally excluded from SQLite and Excel. They are loaded server-side from `.env.local`, which is ignored by Git.

## Realtime and handoff rules

- Socket.IO pushes messages, typing status, AI-verification status, handoff state, and agent-transfer updates between the widget and Admin.
- Every AI-mode customer message is evaluated by the configured AI provider before a handoff decision.
- Greetings, thanks, short ambiguous text, and low confidence alone cannot trigger a handoff.
- A handoff requires an explicit `needs_human` decision from AI and is blocked completely if AI verification fails.
- A direct public handoff endpoint is intentionally unavailable, preventing the browser from bypassing verification.
- Voice/video calls and screen sharing use actual `MediaStream` tracks, peer-to-peer WebRTC negotiation, ICE signaling, mute/video controls, and track cleanup.
