import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

const SUSBOT_QUESTION_PATH = '/api/susbot/perguntar'

export function isSusbotQuestionPath(rawUrl = '') {
  const pathname = String(rawUrl).split(/[?#]/, 1)[0].replace(/^\/backend/, '')
  return pathname === SUSBOT_QUESTION_PATH || pathname === `${SUSBOT_QUESTION_PATH}/`
}

function warnProxyConfiguration({ proxyTarget, proxyApiKey }) {
  if (!proxyTarget) {
    console.warn('[Clara proxy] SUSBOT_PROXY_TARGET ausente; /backend nao sera encaminhado.')
  }
  if (!proxyApiKey) {
    console.warn('[Clara proxy] SUSBOT_API_KEY ausente; o endpoint /api/susbot/perguntar retornara 401.')
  }
}

async function checkProxyTarget(proxyTarget) {
  if (!proxyTarget || typeof fetch !== 'function') return

  try {
    const response = await fetch(proxyTarget, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    })
    console.info(`[Clara proxy] target acessivel (HTTP ${response.status}).`)
  } catch (error) {
    console.warn(`[Clara proxy] target inacessivel: ${error?.message || 'falha de conexao'}. Verifique o Quick Tunnel e reinicie o Vite.`)
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget = env.SUSBOT_PROXY_TARGET?.trim()
  const proxyApiKey = env.SUSBOT_API_KEY?.trim()
  warnProxyConfiguration({ proxyTarget, proxyApiKey })

  const proxy = proxyTarget
    ? {
        '/backend': {
          target: proxyTarget,
          changeOrigin: true,
          rewrite: path => path.replace(/^\/backend/, ''),
          configure: proxyServer => {
            proxyServer.on('proxyReq', (proxyReq, req) => {
              const matchesEndpoint = isSusbotQuestionPath(req.url)
              let headerInjected = false

              if (proxyApiKey && matchesEndpoint) {
                proxyReq.setHeader('X-API-Key', proxyApiKey)
                headerInjected = true
              }

              req.susbotApiKeyInjected = headerInjected
              if (matchesEndpoint) {
                console.info('[Clara proxy] proxyReq', {
                  hasApiKey: Boolean(proxyApiKey),
                  apiKeyLength: proxyApiKey?.length || 0,
                  url: req.url,
                  matchesEndpoint,
                  headerInjected,
                })
              }
            })
            proxyServer.on('proxyRes', (proxyRes, req) => {
              if (isSusbotQuestionPath(req.url)) {
                proxyRes.headers['x-susbot-api-key-injected'] = req.susbotApiKeyInjected ? '1' : '0'
              }
            })
            proxyServer.on('error', error => {
              console.warn(`[Clara proxy] falha ao acessar o target: ${error?.message || 'erro desconhecido'}.`)
            })
          },
        },
      }
    : undefined

  return {
    plugins: [
      react(),
      {
        name: 'susbot-proxy-startup-check',
        configureServer() {
          void checkProxyTarget(proxyTarget)
        },
        configurePreviewServer() {
          void checkProxyTarget(proxyTarget)
        },
      },
    ],
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
