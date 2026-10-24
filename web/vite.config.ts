import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Link previews only work with absolute URLs, which depend on where the site
// is deployed. VITE_SITE_URL (no trailing slash) fills %SITE_URL% in
// index.html; without it the URLs stay relative, which is fine locally.
function siteUrl(url: string): Plugin {
  return {
    name: 'synapse-site-url',
    transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', url.replace(/\/$/, '')),
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), siteUrl(loadEnv(mode, process.cwd()).VITE_SITE_URL ?? '')],
  // Carbon's Sass uses syntax newer Sass deprecates; warn only for our own files.
  css: { preprocessorOptions: { scss: { quietDeps: true } } },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
}))
