import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig(({ command }) => ({
  plugins: [react(), wasm(), topLevelAwait()],
  build: {
    target: "es2019",
    minify: "esbuild",
    cssMinify: true,
  },
  esbuild: {
    minifyIdentifiers: true,
    minifySyntax: true,
    minifyWhitespace: true,
    legalComments: "none",
  },
}));
