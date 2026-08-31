import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Docker Desktop loads the built extension UI via a `file://` URL, not an
  // HTTP server. The default `/assets/...` (root-absolute) paths Vite emits
  // resolve against the filesystem root under `file://` (e.g. `C:\assets\`)
  // instead of index.html's own directory, so every asset 404s and the
  // panel stays blank. Relative paths resolve correctly under both `file://`
  // and the Vite dev server.
  base: "./",
  server: {
    port: 3000,
  },
  build: {
    outDir: "dist",
  },
});
