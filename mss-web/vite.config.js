import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  // Server-only setting: never expose backend routing configuration to the bundle.
  const env = loadEnv(mode, process.cwd(), 'MSS_')
  const target = process.env.MSS_API_PROXY_TARGET || env.MSS_API_PROXY_TARGET || 'http://127.0.0.1:4000'
  const proxy = Object.fromEntries(
    ['/api', '/uploads', '/media'].map((path) => [path, { target, changeOrigin: true }]),
  )

  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  }
})
