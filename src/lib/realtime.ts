import { io, type Socket } from "socket.io-client";

export type TypingActor = "customer" | "agent" | "ai";
export type CallKind = "voice" | "video" | "screen";
export interface TypingUpdate {
  sessionId: string;
  actor: TypingActor;
  typing: boolean;
}
export interface CallInvite {
  sessionId: string;
  kind: CallKind;
}

let socket: Socket | undefined;

export function getRealtimeSocket() {
  if (!socket) socket = io({ transports: ["websocket", "polling"] });
  return socket;
}

export function joinRealtimeSession(sessionId: string) {
  const connection = getRealtimeSocket();
  connection.emit("session:join", sessionId);
  return () => connection.emit("session:leave", sessionId);
}

export function emitTyping(sessionId: string, actor: TypingActor, typing: boolean) {
  getRealtimeSocket().emit("typing:update", { sessionId, actor, typing });
}

export function inviteCall(sessionId: string, kind: CallKind) {
  getRealtimeSocket().emit("call:invite", { sessionId, kind });
}
