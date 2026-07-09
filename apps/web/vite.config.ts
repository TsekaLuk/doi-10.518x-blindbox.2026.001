import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 5173 is taken by the user's Pebble (electron-vite) dev session — stay clear.
    port: 5180,
    strictPort: true,
  },
});
