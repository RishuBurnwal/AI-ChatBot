import { createServer } from "node:http";
import { io as createClient, type Socket as ClientSocket } from "socket.io-client";
import { afterEach, describe, expect, it } from "vitest";
import { attachRealtime } from "./realtime-server";

const clients: ClientSocket[] = [];
const servers: Array<ReturnType<typeof createServer>> = [];

afterEach(async () => {
  clients.splice(0).forEach((client) => client.disconnect());
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise<void>((resolve) => server.close(() => resolve()))),
  );
});

async function fixture() {
  const server = createServer();
  servers.push(server);
  const realtime = attachRealtime(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing test server address");
  const url = `http://127.0.0.1:${address.port}`;
  const connect = () => {
    const client = createClient(url, { transports: ["websocket"], forceNew: true });
    clients.push(client);
    return new Promise<ClientSocket>((resolve) => client.on("connect", () => resolve(client)));
  };
  return { realtime, connect };
}

describe("realtime chat server", () => {
  it("broadcasts live chat updates and typing status to agents and the session", async () => {
    const { realtime, connect } = await fixture();
    const agent = await connect();
    const customer = await connect();
    agent.emit("agent:available");
    customer.emit("session:join", "session-1");

    const typing = new Promise<Record<string, unknown>>((resolve) =>
      agent.once("typing:update", resolve),
    );
    customer.emit("typing:update", { sessionId: "session-1", actor: "customer", typing: true });
    await expect(typing).resolves.toMatchObject({
      sessionId: "session-1",
      actor: "customer",
      typing: true,
    });

    const agentUpdate = new Promise((resolve) => agent.once("chat:updated", resolve));
    const customerUpdate = new Promise((resolve) => customer.once("chat:updated", resolve));
    realtime.publishChatUpdated("session-1");
    await expect(Promise.all([agentUpdate, customerUpdate])).resolves.toHaveLength(2);
  });

  it("relays call invitations and WebRTC signals without echoing them to the sender", async () => {
    const { connect } = await fixture();
    const agent = await connect();
    const customer = await connect();
    agent.emit("agent:available");
    agent.emit("session:join", "session-2");
    customer.emit("session:join", "session-2");

    const invite = new Promise<Record<string, unknown>>((resolve) =>
      agent.once("call:invite", resolve),
    );
    customer.emit("call:invite", { sessionId: "session-2", kind: "video" });
    await expect(invite).resolves.toMatchObject({ sessionId: "session-2", kind: "video" });

    const signal = new Promise<Record<string, unknown>>((resolve) =>
      agent.once("webrtc:signal", resolve),
    );
    customer.emit("webrtc:signal", {
      sessionId: "session-2",
      signal: { type: "offer", sdp: "test" },
    });
    await expect(signal).resolves.toMatchObject({ signal: { type: "offer", sdp: "test" } });
  });
});
