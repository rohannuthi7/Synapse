import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Carbon's Sass uses syntax newer Sass deprecates; warn only for our own files.
  css: { preprocessorOptions: { scss: { quietDeps: true } } },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
})
