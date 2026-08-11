import { defineConfig } from "astro/config";

// Deployed under GitHub Pages project-page path
// (comp4020-agentic-coding-studio.github.io/comp4020-ass1-Alisonsun7/), so
// every internal link and asset URL needs this base baked in — Astro (unlike
// the old Vite setup) has no relative-base shortcut.
export default defineConfig({
  base: "/comp4020-ass1-Alisonsun7/",
  trailingSlash: "always",
});
