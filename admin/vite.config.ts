import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { adminApi } from './server/plugin.ts'

export default defineConfig(({ mode }) => {
  // '' prefix: read every variable from admin/.env, including the API key. The
  // key is only handed to the server plugin; Vite exposes just VITE_* to the
  // browser.
  const env = loadEnv(mode, process.cwd(), '')
  // `npm run dev --port 3001` hands the flag to npm, which exposes it as
  // npm_config_port; `npm run dev -- --port 3001` reaches Vite directly and
  // wins over this. Default 3000.
  const port = Number(process.env.npm_config_port) || 3000
  return {
    plugins: [
      react(),
      adminApi({
        endpoint: env.APPWRITE_ENDPOINT || 'https://cloud.appwrite.io/v1',
        projectId: env.APPWRITE_PROJECT_ID || '',
        apiKey: env.APPWRITE_API_KEY || '',
      }),
    ],
    // local only: never listen on the network, this panel holds the server key
    server: { host: '127.0.0.1', port, strictPort: true, allowedHosts: ['localhost', '127.0.0.1'] },
  }
})
