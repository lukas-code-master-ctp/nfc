import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['**/__tests__/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', '.next', 'e2e', '.claude'],
    setupFiles: ['./vitest.setup.ts'],
    // Sin esta variable, los tests de zona horaria pasan incluso si se borra
    // `timeZone: ZONA` del código — porque en máquinas chilenas la zona del SO
    // es la misma y el test nunca falla. Así la garantía solo se cumple en CI
    // (UTC) y en máquinas de otros países, nunca en el diario de los devs.
    env: { TZ: 'UTC' },
  },
  resolve: {
    alias: { '@': resolve(__dirname, '.') },
  },
})
