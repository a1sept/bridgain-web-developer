import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Server-only settings come from the process (Compose); never load the root env into Vite.
export default defineConfig({
  plugins: [react()],
  envPrefix: "VITE_PUBLIC_",
  server: {
    port: 5173,
    strictPort: true,
    allowedHosts: process.env.DEV_ALLOWED_HOST
      ? [process.env.DEV_ALLOWED_HOST]
      : [],
    proxy: {
      "/api": {
        target: process.env.API_PROXY_TARGET || "http://localhost:3000",
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
              process.env.AUTH_PROXY_SECRET || "",
            );
          });
        },
      },
    },
  },
});
