import type { ApiRequest, ApiResponse } from '../shared/serverless-http.js'
import {
  getProxyTimeoutMs,
  handleProxyRequest,
  isM3u8Response,
  parseProxyError,
  rewriteM3u8Urls,
} from '../shared/proxy-core.js'

export default async function handler(req: ApiRequest, res: ApiResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  try {
    const { url } = req.query

    if (!url || typeof url !== 'string') {
      return res.status(400).json({ error: 'URL parameter is required' })
    }

    const targetUrl = decodeURIComponent(url)
    const response = await handleProxyRequest(targetUrl)
    const contentType = response.headers.get('content-type') || 'application/json'

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=60')

    if (isM3u8Response(targetUrl, contentType) && response.status === 200) {
      res.setHeader('Cache-Control', 'no-store')
      let text = await response.text()
      text = rewriteM3u8Urls(
        text,
        response.url || targetUrl,
        req.query.native === '1' ? '/proxy?native=1&url=' : '',
      )
      return res.status(response.status).send(text)
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    res.status(response.status).send(buffer)
  } catch (error) {
    const { message, cause } = parseProxyError(error)
    const timeoutMs = getProxyTimeoutMs()
    res.status(500).json({ error: 'Proxy request failed', message, cause, timeoutMs })
  }
}
