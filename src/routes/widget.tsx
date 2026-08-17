import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ChatPanel } from "@/components/widget/ChatPanel";
import { IntakeForm } from "@/components/widget/IntakeForm";
import { useCrm } from "@/lib/crm-store";
import type { ChatSession, IntakeDetails, PermissionKey, PermissionState } from "@/lib/crm-types";
import { createSession, loadCrmState, savePermission, sendMessage } from "@/lib/api";
import {
  getRealtimeSocket,
  joinRealtimeSession,
  type TypingActor,
  type TypingUpdate,
} from "@/lib/realtime";

export const Route = createFileRoute("/widget")({
  head: () => ({
    meta: [
      { title: "Live Chat Support — Nexus Support Widget" },
      {
        name: "description",
        content:
          "Chat with our AI assistant, share your details, and connect to a human agent by voice, video, or screen share.",
      },
      { property: "og:title", content: "Live Chat Support — Nexus Support Widget" },
      {
        property: "og:description",
        content: "AI chat widget with voice, video, screen share, and instant human handoff.",
      },
    ],
  }),
  component: WidgetRoute,
});

const ACTIVE_SESSION_STORAGE_KEY = "nexus-support:active-session-id";

function saveActiveSessionId(sessionId: string | null) {
  try {
    if (sessionId) window.localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, sessionId);
    else window.localStorage.removeItem(ACTIVE_SESSION_STORAGE_KEY);
  } catch {
    // The widget still works when storage is disabled or unavailable.
  }
}

function WidgetRoute() {
  const crm = useCrm();
  const [session, setSession] = useState<ChatSession | null>(null);
  const [restoringSession, setRestoringSession] = useState(true);
  const [remoteTyping, setRemoteTyping] = useState<TypingActor[]>([]);
  const restorationAttemptedRef = useRef(false);
  const upsertSessionRef = useRef(crm.upsertSession);
  upsertSessionRef.current = crm.upsertSession;
  const realtimeSessionId = session?.id;

  useEffect(() => {
    if (crm.loading || restorationAttemptedRef.current) return;
    restorationAttemptedRef.current = true;
    try {
      const savedSessionId = window.localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY);
      const savedSession = crm.sessions.find(
        (candidate) => candidate.id === savedSessionId && candidate.status !== "closed",
      );
      if (savedSession) setSession(savedSession);
      else if (savedSessionId) saveActiveSessionId(null);
    } finally {
      setRestoringSession(false);
    }
  }, [crm.loading, crm.sessions]);

  useEffect(() => {
    if (session?.status === "closed") saveActiveSessionId(null);
  }, [session?.status]);

  useEffect(() => {
    if (!realtimeSessionId) return;
    const sessionId = realtimeSessionId;
    const socket = getRealtimeSocket();
    const leave = joinRealtimeSession(sessionId);
    const reload = async () => {
      const state = await loadCrmState();
      const updated = state.sessions.find((candidate) => candidate.id === sessionId);
      if (updated) {
        setSession(updated);
        upsertSessionRef.current(updated);
      }
    };
    const updateTyping = ({ sessionId: updatedId, actor, typing }: TypingUpdate) => {
      if (updatedId !== sessionId || actor === "customer") return;
      setRemoteTyping((previous) => {
        const actors = new Set(previous);
        if (typing) actors.add(actor);
        else actors.delete(actor);
        return [...actors];
      });
    };
    socket.on("chat:updated", reload);
    socket.on("handoff:created", reload);
    socket.on("typing:update", updateTyping);
    return () => {
      leave();
      socket.off("chat:updated", reload);
      socket.off("handoff:created", reload);
      socket.off("typing:update", updateTyping);
    };
  }, [realtimeSessionId]);

  const startSession = async (intake: IntakeDetails) => {
    const { session: remote } = await createSession(intake);
    const userId = remote.userId;
    const now = remote.startedAt;
    crm.upsertUser({ id: userId, intake, createdAt: now, lastSeen: now });
    const fresh: ChatSession = {
      id: remote.id,
      userId,
      startedAt: now,
      channel: "widget",
      status: "active",
      handoffRequested: false,
      takenOver: false,
      messages: [],
      permissions: {
        location: "unknown",
        camera: "unknown",
        microphone: "unknown",
        screen: "unknown",
      },
    };
    setSession(fresh);
    saveActiveSessionId(fresh.id);
    crm.upsertSession(fresh);
  };

  const update = (next: ChatSession) => {
    setSession(next);
    crm.upsertSession(next);
  };

  return (
    <main className="min-h-screen bg-background px-4 py-6">
      <div className="mx-auto flex h-[min(90vh,780px)] w-full max-w-md flex-col">
        <h1 className="sr-only">Nexus Support chat widget</h1>
        {crm.loading || restoringSession ? (
          <div className="grid h-full place-items-center rounded-2xl border border-border bg-card text-sm text-muted-foreground shadow-card">
            Loading saved form…
          </div>
        ) : session === null ? (
          <IntakeForm
            fields={crm.formFields}
            greeting={crm.general.widgetGreeting}
            onSubmit={startSession}
          />
        ) : (
          <ChatPanel
            session={session}
            greeting={crm.general.widgetGreeting}
            quickReplies={crm.quickReplies}
            requestedPermissions={crm.requestedPermissions}
            remoteTyping={remoteTyping}
            onSend={async (message) => {
              if (message.sender !== "user") return;
              const result = await sendMessage(session.id, message.text);
              const messages = [...session.messages, result.userMessage];
              if (result.reply) messages.push(result.reply);
              update({
                ...session,
                messages,
                handoffRequested: Boolean(result.handoff),
                status: result.handoff ? "handoff" : session.status,
              });
            }}
            onPermissionChange={(key: PermissionKey, state: PermissionState) => {
              void savePermission(session.id, key, state);
              update({ ...session, permissions: { ...session.permissions, [key]: state } });
            }}
          />
        )}
      </div>
    </main>
  );
}
