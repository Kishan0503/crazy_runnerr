import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Unit tests cover the pure gameplay logic in src/game (no DOM / WebGL).
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
