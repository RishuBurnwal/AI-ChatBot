import { useEffect, useRef, useState } from "react";
import { Bot, Headset, MonitorUp, Phone, Send, ShieldCheck, User, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatSession, PermissionKey, PermissionState } from "@/lib/crm-types";
import { emitTyping, type TypingActor } from "@/lib/realtime";
import { CallOverlay, type CallKind } from "./CallOverlay";
import { PermissionCenter } from "./PermissionCenter";

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export interface ChatPanelProps {
  session: ChatSession;
  greeting: string;
  quickReplies: string[];
  requestedPermissions: Record<PermissionKey, boolean>;
  onSend: (message: ChatMessage) => void | Promise<void>;
  onPermissionChange: (key: PermissionKey, state: PermissionState) => void;
  remoteTyping: TypingActor[];
}

/**
 * Fully self-contained chat surface. All state is scoped to this component
 * instance + the session prop, so multiple widget instances never share state.
 */
export function ChatPanel({
  session,
  greeting,
  quickReplies,
  requestedPermissions,
  onSend,
  onPermissionChange,
  remoteTyping,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [typing, setTyping] = useState(false);
  const [sendError, setSendError] = useState("");
  const [call, setCall] = useState<CallKind | null>(null);
  const [permOpen, setPermOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [session.messages.length, typing]);

  const send = async (text: string) => {
    const value = text.trim();
    if (!value) return;
    setDraft("");
    setSendError("");
    emitTyping(session.id, "customer", false);

    setTyping(true);
    try {
      await onSend({
        id: crypto.randomUUID(),
        sender: "user",
        text: value,
        at: new Date().toISOString(),
      });
    } catch (error) {
      setDraft(value);
      setSendError(error instanceof Error ? error.message : "Message could not be sent.");
    } finally {
      setTyping(false);
    }
  };

  const startCall = (kind: CallKind) => {
    const needed: PermissionKey =
      kind === "screen" ? "screen" : kind === "video" ? "camera" : "microphone";
    if (requestedPermissions[needed] && session.permissions[needed] !== "granted") {
      setPermOpen(true);
      return;
    }
    setCall(kind);
  };

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-card">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-3">
        <span className="grid size-9 place-items-center rounded-full bg-primary text-primary-foreground">
          <Bot className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Nova · Support</p>
          <p className="truncate text-xs text-muted-foreground">
            {session.takenOver ? "Live agent connected" : "AI assistant · replies instantly"}
          </p>
        </div>
        <div className="flex gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Start voice call"
            onClick={() => startCall("voice")}
          >
            <Phone className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Start video call"
            onClick={() => startCall("video")}
          >
            <Video className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Share screen"
            onClick={() => startCall("screen")}
          >
            <MonitorUp className="size-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Permissions"
            onClick={() => setPermOpen(true)}
          >
            <ShieldCheck className="size-4" />
          </Button>
        </div>
      </header>

      {session.handoffRequested && (
        <div className="flex items-center gap-2 border-b border-border bg-warning/20 px-4 py-2 text-xs font-medium text-foreground">
          <Headset className="size-4" />
          Connecting you to a human agent…
        </div>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        <div className="rounded-xl bg-muted px-3 py-2 text-sm text-muted-foreground">
          {greeting}
        </div>
        {session.messages.map((m) =>
          m.sender === "system" ? (
            <p key={m.id} className="text-center text-xs text-muted-foreground">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className={cn("flex gap-2", m.sender === "user" && "justify-end")}>
              {m.sender !== "user" && (
                <span className="mt-auto grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                  {m.sender === "agent" ? (
                    <Headset className="size-3.5" />
                  ) : (
                    <Bot className="size-3.5" />
                  )}
                </span>
              )}
              <div className="max-w-[78%]">
                <div
                  className={cn(
                    "rounded-2xl px-3.5 py-2 text-sm",
                    m.sender === "user"
                      ? "rounded-br-sm bg-primary text-primary-foreground"
                      : "rounded-bl-sm bg-muted text-foreground",
                  )}
                >
                  {m.text}
                </div>
                <p
                  className={cn(
                    "mt-1 text-[11px] text-muted-foreground",
                    m.sender === "user" && "text-right",
                  )}
                >
                  {m.sender === "agent" ? "Agent · " : m.sender === "ai" ? "Nova · " : ""}
                  {time(m.at)}
                </p>
              </div>
              {m.sender === "user" && (
                <span className="mt-auto grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
                  <User className="size-3.5" />
                </span>
              )}
            </div>
          ),
        )}
        {(typing || remoteTyping.length > 0) && (
          <div
            role="status"
            aria-live="polite"
            className="w-fit rounded-2xl bg-muted px-3 py-2 text-xs text-muted-foreground"
          >
            <span className="mr-2">
              {typing
                ? "AI is verifying your message"
                : remoteTyping.includes("agent")
                  ? "Agent is typing"
                  : "Typing"}
            </span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-1.5 animate-bounce rounded-full bg-muted-foreground"
                style={{ animationDelay: `${i * 120}ms` }}
              />
            ))}
          </div>
        )}
      </div>

      {quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-2.5">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void send(q)}
              className="rounded-full border border-border px-3 py-1 text-xs font-medium transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form
        className="flex items-center gap-2 border-t border-border px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <Input
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            emitTyping(session.id, "customer", e.target.value.trim().length > 0);
          }}
          onBlur={() => emitTyping(session.id, "customer", false)}
          placeholder="Type your message…"
          aria-label="Message"
        />
        <Button type="submit" size="icon" aria-label="Send message" disabled={!draft.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
      {sendError && (
        <p role="alert" className="border-t border-border px-4 py-2 text-xs text-destructive">
          {sendError} Please try again.
        </p>
      )}

      {call && (
        <CallOverlay kind={call} sessionId={session.id} initiator onClose={() => setCall(null)} />
      )}
      <PermissionCenter
        open={permOpen}
        onOpenChange={setPermOpen}
        requested={requestedPermissions}
        states={session.permissions}
        onChange={onPermissionChange}
      />
    </div>
  );
}
