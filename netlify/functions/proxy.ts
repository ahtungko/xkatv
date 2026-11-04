import type { Handler, HandlerEvent } from '@netlify/functions'
import {
  getProxyTimeoutMs,
  handleProxyRequest,
  isM3u8Response,
  parseProxyError,
  rewriteM3u8Urls,
} from '../../src/shared/lib/proxy'

const handler: Handler = async (event: HandlerEvent) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers,
      body: '',
    }
  }

  const { url } = event.queryStringParameters || {}

  if (!url) {
    return {
      statusCode: 400,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'URL parameter is required' }),
    }
  }

  try {
    const response = await handleProxyRequest(url)
    const contentType = response.headers.get('content-type') || 'application/json'

    if (isM3u8Response(url, contentType) && response.status === 200) {
      let text = await response.text()
      text = rewriteM3u8Urls(text, response.url || url)
      return {
        statusCode: response.status,
        headers: {
          ...headers,
          'Content-Type': contentType,
        },
        body: text,
      }
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    return {
      statusCode: response.status,
      headers: {
        ...headers,
        'Content-Type': contentType,
      },
      body: buffer.toString('base64'),
      isBase64Encoded: true,
    }
  } catch (error) {
    const { message, cause } = parseProxyError(error)
    const timeoutMs = getProxyTimeoutMs()
    return {
      statusCode: 500,
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Proxy request failed', message, cause, timeoutMs }),
    }
  }
}

export { handler }
