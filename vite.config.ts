import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    chunkSizeWarningLimit: 800, // three.js alone is ~730 kB (186 kB gzipped)
    // Phase 4P: libraries in their own long-cached chunks, so a game update only
    // re-downloads the (small) game code, not three.js / React again.
    rolldownOptions: {
      output: {
        advancedChunks: {
          groups: [
            { name: 'three', test: /node_modules[\/]three[\/]/ },
            { name: 'r3f', test: /node_modules[\/](@react-three|postprocessing|three-stdlib|maath|zustand)[\/]/ },
            { name: 'react', test: /node_modules[\/](react|react-dom|scheduler)[\/]/ },
            { name: 'supabase', test: /node_modules[\/]@supabase[\/]/ },
            { name: 'vendor', test: /node_modules[\/]/ },
          ],
        },
      },
    },
  },
  // Unit tests cover the pure gameplay logic in src/game (no DOM / WebGL).
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
