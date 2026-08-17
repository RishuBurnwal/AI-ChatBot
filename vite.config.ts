import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tanstackStart({ server: { entry: "server" } }), viteReact(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/socket.io": { target: "http://localhost:8787", ws: true },
    },
  },
});
