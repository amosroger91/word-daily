import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the studio also works behind a path prefix.
  base: "./",
  server: { watch: { ignored: ["**/data/**"] } },
  build: { outDir: "dist" },
});
