import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, MonitorUp, PhoneOff, Video, VideoOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getRealtimeSocket, joinRealtimeSession, type CallKind } from "@/lib/realtime";
import { acquireCallMedia, createCallPeer, mediaKindForParticipant } from "@/lib/webrtc";

export type { CallKind } from "@/lib/realtime";
export type CallState = "connecting" | "ringing" | "connected" | "ended" | "failed";

const TITLES: Record<CallKind, string> = {
  voice: "Voice call",
  video: "Video call",
  screen: "Screen share",
};

interface SignalPayload {
  sessionId: string;
  signal:
    | { type: "description"; description: RTCSessionDescriptionInit }
    | { type: "candidate"; candidate: RTCIceCandidateInit };
}

export interface CallOverlayProps {
  kind: CallKind;
  sessionId: string;
  initiator: boolean;
  onClose: () => void;
}

export function CallOverlay({ kind, sessionId, initiator, onClose }: CallOverlayProps) {
  const [state, setState] = useState<CallState>("connecting");
  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(kind === "voice");
  const [error, setError] = useState("");
  const localVideo = useRef<HTMLVideoElement>(null);
  const remoteVideo = useRef<HTMLVideoElement>(null);
  const remoteAudio = useRef<HTMLAudioElement>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const peer = useRef<RTCPeerConnection | null>(null);

  useEffect(() => {
    let disposed = false;
    const socket = getRealtimeSocket();
    const leave = joinRealtimeSession(sessionId);
    const connection = createCallPeer();
    remoteStream.current = new MediaStream();
    peer.current = connection;

    const sendDescription = () => {
      if (!connection.localDescription) return;
      socket.emit("webrtc:signal", {
        sessionId,
        signal: { type: "description", description: connection.localDescription },
      });
    };
    connection.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("webrtc:signal", {
          sessionId,
          signal: { type: "candidate", candidate: event.candidate.toJSON() },
        });
      }
    };
    connection.ontrack = (event) => {
      for (const track of event.streams[0]?.getTracks() ?? [event.track]) {
        if (!remoteStream.current?.getTracks().some((candidate) => candidate.id === track.id)) {
          remoteStream.current?.addTrack(track);
        }
      }
      if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream.current;
      if (remoteAudio.current) remoteAudio.current.srcObject = remoteStream.current;
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") setState("connected");
      if (["failed", "disconnected"].includes(connection.connectionState)) {
        setState("failed");
        setError("The peer connection was lost. Check both devices and network permissions.");
      }
    };

    const handleSignal = async (payload: SignalPayload) => {
      if (payload.sessionId !== sessionId) return;
      if (payload.signal.type === "candidate") {
        await connection.addIceCandidate(payload.signal.candidate);
        return;
      }
      await connection.setRemoteDescription(payload.signal.description);
      if (payload.signal.description.type === "offer") {
        await connection.setLocalDescription(await connection.createAnswer());
        sendDescription();
      }
    };
    const handleAccepted = async (invite: { sessionId: string }) => {
      if (!initiator || invite.sessionId !== sessionId) return;
      await connection.setLocalDescription(await connection.createOffer());
      sendDescription();
    };
    const handleHangup = (endedSessionId: string) => {
      if (endedSessionId === sessionId) setState("ended");
    };
    socket.on("webrtc:signal", handleSignal);
    socket.on("call:accepted", handleAccepted);
    socket.on("webrtc:hangup", handleHangup);

    void acquireCallMedia(mediaKindForParticipant(kind, initiator))
      .then((stream) => {
        if (disposed) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStream.current = stream;
        stream.getTracks().forEach((track) => connection.addTrack(track, stream));
        if (localVideo.current) localVideo.current.srcObject = stream;
        stream.getVideoTracks().forEach((track) => {
          track.onended = () => endCall();
        });
        if (initiator) {
          setState("ringing");
          socket.emit("call:invite", { sessionId, kind });
        } else {
          socket.emit("call:accept", { sessionId, kind });
        }
      })
      .catch((reason: unknown) => {
        setState("failed");
        setError(reason instanceof Error ? reason.message : "Could not access media devices.");
      });

    function endCall() {
      socket.emit("webrtc:hangup", sessionId);
      setState("ended");
    }

    return () => {
      disposed = true;
      socket.off("webrtc:signal", handleSignal);
      socket.off("call:accepted", handleAccepted);
      socket.off("webrtc:hangup", handleHangup);
      leave();
      connection.close();
      localStream.current?.getTracks().forEach((track) => track.stop());
      remoteStream.current?.getTracks().forEach((track) => track.stop());
    };
  }, [initiator, kind, sessionId]);

  useEffect(() => {
    if (state !== "connected") return;
    const id = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [state]);

  const endCall = () => {
    getRealtimeSocket().emit("webrtc:hangup", sessionId);
    localStream.current?.getTracks().forEach((track) => track.stop());
    peer.current?.close();
    setState("ended");
  };
  const toggleAudio = () => {
    const next = !muted;
    localStream.current?.getAudioTracks().forEach((track) => (track.enabled = !next));
    setMuted(next);
  };
  const toggleVideo = () => {
    const next = !camOff;
    localStream.current?.getVideoTracks().forEach((track) => (track.enabled = !next));
    setCamOff(next);
  };
  const clock = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const hasVideo = kind !== "voice";
  const showLocalVideo = kind === "video" || (kind === "screen" && initiator);

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-between bg-foreground/95 p-6 text-background">
      <div className="w-full text-center">
        <p className="text-xs uppercase tracking-widest opacity-60">{TITLES[kind]}</p>
        <h3 className="mt-1 text-lg font-semibold">Nexus Support</h3>
        <p role="status" className="mt-1 text-sm opacity-70">
          {state === "connecting" && "Requesting device permission…"}
          {state === "ringing" && "Waiting for an agent…"}
          {state === "connected" && `Connected · ${clock}`}
          {state === "ended" && "Call ended"}
          {state === "failed" && error}
        </p>
      </div>

      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-xl bg-black/30">
        {hasVideo ? (
          <>
            <video
              ref={remoteVideo}
              autoPlay
              playsInline
              className="h-full w-full object-contain"
            />
            {showLocalVideo && (
              <video
                ref={localVideo}
                autoPlay
                muted
                playsInline
                className="absolute bottom-3 right-3 h-28 w-20 rounded-lg border border-white/30 bg-black object-cover"
              />
            )}
          </>
        ) : (
          <>
            <audio ref={remoteAudio} autoPlay />
            <div className="flex size-32 items-center justify-center rounded-full bg-background/10 text-3xl font-semibold">
              NS
            </div>
          </>
        )}
        {kind === "screen" && state !== "connected" && (
          <MonitorUp className="absolute size-10 opacity-70" />
        )}
      </div>

      {state === "ended" || state === "failed" ? (
        <Button className="mt-4 w-full" variant="secondary" onClick={onClose}>
          Back to chat
        </Button>
      ) : (
        <div className="mt-4 flex items-center gap-3">
          <Button
            size="icon"
            variant="secondary"
            aria-label={muted ? "Unmute" : "Mute"}
            onClick={toggleAudio}
          >
            {muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
          </Button>
          {hasVideo && (
            <Button
              size="icon"
              variant="secondary"
              aria-label={camOff ? "Turn video on" : "Turn video off"}
              onClick={toggleVideo}
            >
              {camOff ? <VideoOff className="size-4" /> : <Video className="size-4" />}
            </Button>
          )}
          <Button size="icon" variant="destructive" aria-label="End call" onClick={endCall}>
            <PhoneOff className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
