import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import {memoryPlugin} from './server/memory-plugin';

export default defineConfig({
  build: { outDir: ".artifacts/dist" },
  plugins: [react(),memoryPlugin()],
});
