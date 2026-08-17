import type { CallKind } from "./realtime";

export function mediaKindForParticipant(kind: CallKind, initiator: boolean): CallKind {
  return kind === "screen" && !initiator ? "voice" : kind;
}

export function mediaRequestFor(kind: CallKind) {
  if (kind === "screen") {
    return {
      source: "display" as const,
      constraints: { audio: true, video: true } satisfies DisplayMediaStreamOptions,
    };
  }
  return {
    source: "user" as const,
    constraints: {
      audio: true,
      video: kind === "video" ? { facingMode: "user" } : false,
    } satisfies MediaStreamConstraints,
  };
}

export async function acquireCallMedia(kind: CallKind) {
  if (!navigator.mediaDevices) {
    throw new Error("Camera and microphone require HTTPS or localhost in this browser.");
  }
  const request = mediaRequestFor(kind);
  if (request.source === "display") {
    if (!navigator.mediaDevices.getDisplayMedia) {
      throw new Error("Screen sharing is not supported by this browser.");
    }
    return navigator.mediaDevices.getDisplayMedia(request.constraints);
  }
  return navigator.mediaDevices.getUserMedia(request.constraints);
}

export function createCallPeer() {
  return new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
}
