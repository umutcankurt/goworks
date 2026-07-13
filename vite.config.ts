import { defineConfig } from 'vite'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import electron from 'vite-plugin-electron/simple'
import react from '@vitejs/plugin-react'

// Note: .env is intentionally NOT loaded at build time. OAuth credentials are
// entered at onboarding and read from the app_config table at runtime
// (auth-service.ts), never inlined into the bundle. Keeping dotenv out of the
// build guarantees no secret can ever be baked into a shipped artifact.

// Build-time constants surfaced to the renderer (Login footer, About tab).
// Version tracks package.json; build date is stamped at the build moment, so
// both update automatically on every build with no manual edits.
const pkg = JSON.parse(
  readFileSync(path.join(__dirname, 'package.json'), 'utf-8'),
) as { version: string }
const APP_VERSION = pkg.version
const BUILD_DATE = new Date().toISOString()

/**
 * Stamps the version + build date into src/build-info.ts by replacing its
 * literal placeholders. Runs in both dev and build so the values are always
 * current; consumers import the resulting constants from build-info.ts.
 */
function buildInfoPlugin() {
  return {
    name: 'goworks-build-info',
    enforce: 'pre' as const,
    transform(code: string, id: string) {
      if (id.replace(/\\/g, '/').endsWith('/src/build-info.ts')) {
        return code
          .replaceAll('__GOWORKS_APP_VERSION__', APP_VERSION)
          .replaceAll('__GOWORKS_BUILD_DATE__', BUILD_DATE)
      }
      return null
    },
  }
}

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
    buildInfoPlugin(),
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
