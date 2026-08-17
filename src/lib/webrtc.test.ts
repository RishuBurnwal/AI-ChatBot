import { describe, expect, it } from "vitest";
import { mediaKindForParticipant, mediaRequestFor } from "./webrtc";

describe("WebRTC media requests", () => {
  it("requests microphone only for voice calls", () => {
    expect(mediaRequestFor("voice")).toEqual({
      source: "user",
      constraints: { audio: true, video: false },
    });
  });

  it("requests microphone and camera for video calls", () => {
    expect(mediaRequestFor("video")).toEqual({
      source: "user",
      constraints: { audio: true, video: { facingMode: "user" } },
    });
  });

  it("uses display capture for screen sharing", () => {
    expect(mediaRequestFor("screen")).toEqual({
      source: "display",
      constraints: { audio: true, video: true },
    });
  });

  it("does not ask the receiving agent to share their screen", () => {
    expect(mediaKindForParticipant("screen", false)).toBe("voice");
    expect(mediaKindForParticipant("screen", true)).toBe("screen");
  });
});
