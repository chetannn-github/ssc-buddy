import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Shared ecosystem controllers must use the widget's existing Firebase instance.
  resolve: { dedupe: ["firebase"] },
  clearScreen: false,
  server: { strictPort: true, port: 1420 },
  envPrefix: ["VITE_"],
});
