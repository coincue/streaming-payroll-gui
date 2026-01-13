import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/streaming-payroll-gui/', // Replace with your actual repo name
  test: {
    environment: 'jsdom',
    setupFiles: ['src/setupTests.ts']
  }
})
