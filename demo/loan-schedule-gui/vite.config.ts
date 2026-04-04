import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

export default defineConfig({
  plugins: [
    react(),
    wasm(),
    topLevelAwait()
  ],
  optimizeDeps: {
    exclude: ['quickjs-emscripten']
  },
  server: {
    headers: {
      'Service-Worker-Allowed': '/',
      // Some browsers might be strict about WASM MIME type
    },
    fs: {
      allow: [
        '../../src',
        '../loan-schedule',
        '../../node_modules',
        '.'
      ]
    }
  },
  resolve: {
    alias: {
      '@bindings': path.resolve(__dirname, '../../src/bindings.ts'),
      '@loan-schedule': path.resolve(__dirname, '../loan-schedule/library.ts'),
      '@loan-types': path.resolve(__dirname, '../loan-schedule/types.ts'),
      '@engine': path.resolve(__dirname, '../../src/OpenModelTSEngine.ts')
    }
  }
})
