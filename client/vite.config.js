import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/__tests__/setup.js',
    css: false,           // skip CSS processing in tests
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/__tests__/**', 'src/main.jsx'],
    },
  },
})

