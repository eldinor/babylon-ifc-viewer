import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const configDir = dirname(fileURLToPath(import.meta.url))
const packageJsonPath = resolve(configDir, 'package.json')
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8')) as { version?: string }
const appVersion = packageJson.version ?? '0.0.0'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
})
