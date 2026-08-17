import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";

export type TypingActor = "customer" | "agent" | "ai";
export type CallKind = "voice" | "video" | "screen";

export interface RealtimePublisher {
  io: Server;
  publishChatUpdated(sessionId: string): void;
  publishTyping(sessionId: string, actor: TypingActor, typing: boolean): void;
  publishHandoff(sessionId: string, handoff: unknown): void;
  close(): Promise<void>;
}

const validSessionId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 100;

export function attachRealtime(server: HttpServer): RealtimePublisher {
  const io = new Server(server, { cors: { origin: true, credentials: true } });
  const publishToChat = (sessionId: string, event: string, payload: unknown) =>
    io.to("agents").to(`session:${sessionId}`).emit(event, payload);

  io.on("connection", (socket) => {
    socket.on("agent:available", () => socket.join("agents"));
    socket.on("session:join", (sessionId: unknown) => {
      if (validSessionId(sessionId)) socket.join(`session:${sessionId}`);
    });
    socket.on("session:leave", (sessionId: unknown) => {
      if (validSessionId(sessionId)) socket.leave(`session:${sessionId}`);
    });
    socket.on("typing:update", (payload: unknown) => {
      if (!isTypingPayload(payload)) return;
      socket.to("agents").to(`session:${payload.sessionId}`).emit("typing:update", payload);
    });
    socket.on("call:invite", (payload: unknown) => {
      if (!isCallInvite(payload)) return;
      socket.to("agents").to(`session:${payload.sessionId}`).emit("call:invite", payload);
    });
    socket.on("call:accept", (payload: unknown) => {
      if (!isCallInvite(payload)) return;
      socket.to(`session:${payload.sessionId}`).emit("call:accepted", payload);
    });
    socket.on("webrtc:signal", (payload: unknown) => {
      if (!isSignal(payload)) return;
      socket.to(`session:${payload.sessionId}`).emit("webrtc:signal", payload);
    });
    socket.on("webrtc:hangup", (sessionId: unknown) => {
      if (validSessionId(sessionId))
        socket.to(`session:${sessionId}`).emit("webrtc:hangup", sessionId);
    });
  });

  return {
    io,
    publishChatUpdated: (sessionId) =>
      publishToChat(sessionId, "chat:updated", { sessionId, at: new Date().toISOString() }),
    publishTyping: (sessionId, actor, typing) =>
      publishToChat(sessionId, "typing:update", { sessionId, actor, typing }),
    publishHandoff: (sessionId, handoff) =>
      publishToChat(sessionId, "handoff:created", { sessionId, handoff }),
    close: () => new Promise<void>((resolve) => io.close(() => resolve())),
  };
}

function isTypingPayload(
  value: unknown,
): value is { sessionId: string; actor: TypingActor; typing: boolean } {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    validSessionId(payload["sessionId"]) &&
    ["customer", "agent", "ai"].includes(String(payload["actor"])) &&
    typeof payload["typing"] === "boolean"
  );
}

function isCallInvite(value: unknown): value is { sessionId: string; kind: CallKind } {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return (
    validSessionId(payload["sessionId"]) &&
    ["voice", "video", "screen"].includes(String(payload["kind"]))
  );
}

function isSignal(value: unknown): value is { sessionId: string; signal: unknown } {
  if (!value || typeof value !== "object") return false;
  const payload = value as Record<string, unknown>;
  return validSessionId(payload["sessionId"]) && payload["signal"] !== undefined;
}
