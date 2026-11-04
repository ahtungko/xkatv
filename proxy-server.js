import express from 'express'
import cors from 'cors'
import {
  getProxyTimeoutMs,
  parseProxyError,
  handleProxyRequest,
  isM3u8Response,
  rewriteM3u8Urls,
} from './shared/proxy-core.js'

const app = express()
const PORT = process.env.PROXY_PORT || 3001

app.use(cors({ origin: '*' }))

app.get('/proxy', async (req, res) => {
  try {
    const { url } = req.query
    if (!url) {
      return res.status(400).json({ error: 'URL parameter is required' })
    }

    const targetUrl = decodeURIComponent(url)
    const response = await handleProxyRequest(targetUrl)
    const contentType = response.headers.get('content-type') || 'application/json'

    res.setHeader('Content-Type', contentType)

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
    res.status(500).json({
      error: 'Proxy request failed',
      message,
      cause,
      timeoutMs: getProxyTimeoutMs(),
    })
  }
})

app.listen(PORT, () => console.log(`Proxy server on :${PORT}`))
