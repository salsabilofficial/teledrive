import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["logo.svg"],
      manifest: {
        name: "Telegram Drive",
        short_name: "TG Drive",
        description: "Cloud storage powered by Telegram",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        icons: [
          { src: "/logo.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "/logo.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,ico}"],
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
