import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { fileURLToPath } from "node:url";

const rootEnvPath = fileURLToPath(new URL("../../.env.dev", import.meta.url));
const rootEnv = existsSync(rootEnvPath)
  ? parseEnv(readFileSync(rootEnvPath, "utf8"))
  : {};
const apiTarget = process.env.API_PROXY_TARGET || rootEnv.API_PROXY_TARGET || "http://localhost:15175";
const proxySecret = process.env.AUTH_PROXY_SECRET || rootEnv.AUTH_PROXY_SECRET || "";
const allowedHost = process.env.DEV_ALLOWED_HOST || rootEnv.DEV_ALLOWED_HOST;
const port = Number(process.env.DEVELOPER_PORT || rootEnv.DEVELOPER_PORT || "5173");

export default defineConfig({
  plugins: [react()],
  envPrefix: "VITE_PUBLIC_",
  server: {
    port,
    strictPort: true,
    allowedHosts: allowedHost
      ? [allowedHost]
      : [],
    proxy: {
      "/api": {
        target: apiTarget,
        changeOrigin: true,
        configure(proxy) {
          proxy.on("proxyReq", (proxyRequest, request) => {
            // Overwrite untrusted browser headers; this secret never enters browser code.
            proxyRequest.setHeader(
              "x-bridgain-client-ip",
              request.socket.remoteAddress || "unknown",
            );
            proxyRequest.setHeader("x-bridgain-app", "developer");
            proxyRequest.setHeader(
              "x-bridgain-proxy-secret",
              proxySecret,
            );
          });
        },
      },
    },
  },
});
