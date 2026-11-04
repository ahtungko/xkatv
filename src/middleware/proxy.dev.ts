import type { Plugin } from 'vite'
import {
  handleProxyRequest,
  getProxyTimeoutMs,
  getTargetUrl,
  parseProxyError,
  isM3u8Response,
  rewriteM3u8Urls,
} from '../shared/lib/proxy'

export function proxyMiddleware(): Plugin {
  return {
    name: 'proxy-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/proxy')) {
          return next()
        }

        try {
          const targetUrl = getTargetUrl(req.url)
          const response = await handleProxyRequest(targetUrl)
          const contentType = response.headers.get('content-type') || 'application/json'

          res.setHeader('Access-Control-Allow-Origin', '*')
          res.setHeader('Content-Type', contentType)

          if (isM3u8Response(targetUrl, contentType) && response.status === 200) {
            let text = await response.text()
            text = rewriteM3u8Urls(text, response.url || targetUrl)
            res.writeHead(response.status)
            return res.end(text)
          }

          const buffer = Buffer.from(await response.arrayBuffer())
          res.writeHead(response.status)
          res.end(buffer)
        } catch (error) {
          const { message, cause } = parseProxyError(error)
          const timeoutMs = getProxyTimeoutMs()
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Proxy request failed', message, cause, timeoutMs }))
        }
      })
    },
  }
}
