import { createServer } from "node:http";
import { resolve } from "node:path";
import { createApp } from "./app";
import { createDefaultProviderRegistry } from "./core/provider-adapters";
import { SQLiteRepository } from "./core/sqlite-repository";
import { attachRealtime } from "./realtime-server";

const dataDirectory = resolve(process.cwd(), "data");
const repository = new SQLiteRepository({
  databasePath: resolve(dataDirectory, "nexus-support.sqlite"),
  workbookPath: resolve(dataDirectory, "nexus-support.xlsx"),
});
const providers = createDefaultProviderRegistry();
const server = createServer();
const realtime = attachRealtime(server);
const app = createApp({
  repository,
  providers,
  onHandoff: (handoff) => {
    const sessionId = String((handoff as { sessionId?: unknown }).sessionId ?? "");
    if (sessionId) realtime.publishHandoff(sessionId, handoff);
  },
  onChatUpdated: (sessionId) => realtime.publishChatUpdated(sessionId),
  onTyping: (sessionId, actor, typing) => realtime.publishTyping(sessionId, actor, typing),
});
server.on("request", app);

const port = Number(process.env["API_PORT"] ?? 8787);
server.listen(port, "0.0.0.0", () =>
  console.log(`Nexus Support API listening on http://0.0.0.0:${port}`),
);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void realtime.close();
    server.close(() => {
      repository.close();
      process.exit(0);
    });
  });
}
