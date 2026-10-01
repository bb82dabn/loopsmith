import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: './',
  plugins: [react()],
  build: {
    target: 'es2022',
    sourcemap: mode === 'development',
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
}))
