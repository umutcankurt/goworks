import { defineConfig } from 'vite'
import path from 'node:path'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'
import dotenv from 'dotenv'

// Load .env at build time (for the developer environment)
dotenv.config()

const MAIN_EXTERNALS = [
  'googleapis',
  'google-auth-library',
  'gaxios',
  'dotenv',
  'papaparse',
  'better-sqlite3',
  'bottleneck',
  'sanitize-html',
]

export default defineConfig({
  server: {
    warmup: {
      clientFiles: ['./src/main.tsx', './src/App.tsx'],
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react/jsx-runtime',
      'react/jsx-dev-runtime',
      'react-dom/client',
      'react-router-dom',
      'framer-motion',
      'lucide-react',
      'recharts',
      'clsx',
      'react-dropzone',
      'papaparse',
    ],
  },
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: {
              external: MAIN_EXTERNALS,
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      renderer: process.env.NODE_ENV === 'test'
        ? undefined
        : {},
    }),
  ],
})
