import devServer from "@hono/vite-dev-server"
import path from "path"
const __dirname = import.meta.dirname
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    devServer({ entry: "api/boot.ts", exclude: [/^\/(?!api\/).*$/] }),
    react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "@contracts": path.resolve(__dirname, "./contracts"),
      // w3s-pw-web-sdk only uses jsonwebtoken.decode in the browser; the
      // real package drags Node crypto into the bundle. Shim is decode-only.
      jsonwebtoken: path.resolve(__dirname, "./src/lib/jsonwebtoken-shim.ts"),
    },
  },
  envDir: path.resolve(__dirname),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Heavy libraries get their own cacheable chunks instead of
        // inflating the entry bundle that every visitor downloads.
        manualChunks(id: string) {
          if (!id.includes("node_modules")) return;
          if (/[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/.test(id))
            return "vendor-react";
          if (/[\\/]node_modules[\\/](tanstack|trpc)[\\/]/.test(id))
            return "vendor-query";
          if (/[\\/]node_modules[\\/](viem|ox|@noble|@scure|abitype|ws)[\\/]/.test(id))
            return "vendor-viem";
        },
      },
    },
  },
});
