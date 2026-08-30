import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.SUSBOT_PROXY_TARGET?.trim()
  const proxyApiKey = env.SUSBOT_API_KEY?.trim()

  const proxy = proxyTarget
    ? {
        '/backend': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/backend/, ''),
          configure: proxyServer => {
            proxyServer.on('proxyReq', (proxyReq, req) => {
              if (proxyApiKey && req.url?.startsWith('/backend/api/susbot/perguntar')) {
                proxyReq.setHeader('X-API-Key', proxyApiKey)
              }
            })
          },
        },
      }
    : undefined

  return {
    plugins: [react()],
    server: {
      port: 3000,
      open: true,
      proxy,
    },
    preview: {
      port: 4173,
      proxy,
    },
  }
})
