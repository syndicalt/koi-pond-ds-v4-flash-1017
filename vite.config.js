import { defineConfig } from "vite";

// Relative base so the built site works from any path, including the
// /<repo>/ subpath GitHub Pages serves a project site from.
export default defineConfig({
  base: "./",
});
