import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: {
    alias: {
      electron: path.resolve(__dirname, 'src/electronStub.ts'), // optional stub
    },
  },
  optimizeDeps: {
    exclude: ['electron'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  }
})
