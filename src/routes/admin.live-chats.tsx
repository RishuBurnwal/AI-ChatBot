import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bot, Headset, Phone, Send, User, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { useCrm } from "@/lib/crm-store";
import { CallOverlay } from "@/components/widget/CallOverlay";
import type { CallInvite } from "@/lib/realtime";

export const Route = createFileRoute("/admin/live-chats")({
  component: LiveChats,
});

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

function LiveChats() {
  const crm = useCrm();
  const open = useMemo(() => crm.sessions.filter((s) => s.status !== "closed"), [crm.sessions]);
  const [selectedId, setSelectedId] = useState<string | null>(open[0]?.id ?? null);
  const session = crm.sessions.find((s) => s.id === selectedId) ?? null;
  const user = crm.users.find((u) => u.id === session?.userId);
  const [draft, setDraft] = useState("");
  const [activeCall, setActiveCall] = useState<CallInvite | null>(null);

  useEffect(() => {
    if (!selectedId && open[0]) setSelectedId(open[0].id);
  }, [open, selectedId]);

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <section className="rounded-xl border border-border bg-card shadow-card">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">Active sessions</h2>
          <Badge variant="secondary">{open.length}</Badge>
        </header>
        <ul className="max-h-[70vh] divide-y divide-border overflow-y-auto">
          {open.map((s) => {
            const u = crm.users.find((x) => x.id === s.userId);
            const last = s.messages[s.messages.length - 1];
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={cn(
                    "w-full px-4 py-3 text-left transition-colors hover:bg-muted",
                    selectedId === s.id && "bg-muted",
                  )}
                >
                  <div className="flex items-center gap-2">
                    <p className="flex-1 truncate text-sm font-medium">
                      {u?.intake.name ?? "Guest"}
                    </p>
                    {s.handoffRequested && (
                      <Badge className="bg-destructive text-destructive-foreground">Handoff</Badge>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {crm.typingBySession[s.id]?.includes("customer")
                      ? "Customer is typing…"
                      : crm.typingBySession[s.id]?.includes("ai")
                        ? "AI is verifying…"
                        : (last?.text ?? "No messages yet")}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {s.id} · {time(s.startedAt)}
                  </p>
                </button>
              </li>
            );
          })}
          {open.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              No active chats.
            </li>
          )}
        </ul>
      </section>

      <section className="relative flex min-h-[70vh] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-card">
        {crm.incomingCall && !activeCall && (
          <div className="flex items-center gap-3 border-b border-border bg-success/15 px-4 py-3">
            <Phone className="size-4 animate-pulse text-success" />
            <p className="min-w-0 flex-1 text-sm font-medium">
              Incoming {crm.incomingCall.kind} call from session {crm.incomingCall.sessionId}
            </p>
            <Button
              size="sm"
              onClick={() => {
                setSelectedId(crm.incomingCall?.sessionId ?? null);
                setActiveCall(crm.incomingCall);
                crm.clearIncomingCall();
              }}
            >
              Accept
            </Button>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Dismiss call"
              onClick={crm.clearIncomingCall}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
        {!session ? (
          <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
            Select a conversation to view it.
          </div>
        ) : (
          <>
            <header className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{user?.intake.name ?? "Guest"}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.intake.email} · session {session.id}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="takeover" className="text-xs">
                  Take over (AI off)
                </Label>
                <Switch
                  id="takeover"
                  checked={session.takenOver}
                  onCheckedChange={(value) => crm.setTakeover(session.id, value)}
                />
              </div>
            </header>

            {session.handoffRequested && (
              <div className="flex items-center gap-2 border-b border-border bg-warning/20 px-4 py-2 text-xs font-medium">
                <Headset className="size-4" /> AI requested a handoff — customer is waiting.
              </div>
            )}

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {session.messages.map((m) =>
                m.sender === "system" ? (
                  <p key={m.id} className="text-center text-xs text-muted-foreground">
                    {m.text}
                  </p>
                ) : (
                  <div
                    key={m.id}
                    className={cn("flex gap-2", m.sender === "user" && "justify-end")}
                  >
                    {m.sender !== "user" && (
                      <span className="mt-auto grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground">
                        {m.sender === "agent" ? (
                          <Headset className="size-3.5" />
                        ) : (
                          <Bot className="size-3.5" />
                        )}
                      </span>
                    )}
                    <div className="max-w-[70%]">
                      <div
                        className={cn(
                          "rounded-2xl px-3.5 py-2 text-sm",
                          m.sender === "user"
                            ? "rounded-br-sm bg-secondary text-secondary-foreground"
                            : m.sender === "agent"
                              ? "rounded-bl-sm bg-primary text-primary-foreground"
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
                        {m.sender === "ai" ? "Nova" : m.sender === "agent" ? "Agent" : "Customer"} ·{" "}
                        {time(m.at)}
                      </p>
                    </div>
                    {m.sender === "user" && (
                      <span className="mt-auto grid size-7 shrink-0 place-items-center rounded-full bg-muted">
                        <User className="size-3.5" />
                      </span>
                    )}
                  </div>
                ),
              )}
              {(crm.typingBySession[session.id]?.length ?? 0) > 0 && (
                <p role="status" className="text-xs font-medium text-primary">
                  {crm.typingBySession[session.id]?.includes("customer")
                    ? "Customer is typing…"
                    : "AI is verifying the message…"}
                </p>
              )}
            </div>

            <form
              className="flex items-center gap-2 border-t border-border p-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                crm.appendMessage(session.id, {
                  id: crypto.randomUUID(),
                  sender: "agent",
                  text: draft.trim(),
                  at: new Date().toISOString(),
                });
                crm.sendTyping(session.id, "agent", false);
                setDraft("");
              }}
            >
              <Input
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  crm.sendTyping(session.id, "agent", e.target.value.trim().length > 0);
                }}
                onBlur={() => crm.sendTyping(session.id, "agent", false)}
                placeholder={
                  session.takenOver ? "Reply as agent…" : "Enable Take over to reply manually"
                }
                disabled={!session.takenOver}
                aria-label="Agent reply"
              />
              <Button
                type="submit"
                size="icon"
                disabled={!session.takenOver || !draft.trim()}
                aria-label="Send"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </>
        )}
        {activeCall && (
          <CallOverlay
            kind={activeCall.kind}
            sessionId={activeCall.sessionId}
            initiator={false}
            onClose={() => setActiveCall(null)}
          />
        )}
      </section>
    </div>
  );
}
