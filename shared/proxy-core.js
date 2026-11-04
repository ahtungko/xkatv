/**
 * 统一代理核心逻辑（供 Vercel/Netlify/本地中间件复用）
 * 使用 JS 文件确保 Serverless 运行时可直接解析，不依赖 TS 源文件转译。
 */
const DEFAULT_PROXY_TIMEOUT_MS = 15000
const MIN_PROXY_TIMEOUT_MS = 1000
const MAX_PROXY_TIMEOUT_MS = 120000

/**
 * 解析代理超时配置（毫秒）
 */
export function getProxyTimeoutMs(rawTimeout = process.env.PROXY_TIMEOUT_MS) {
  const parsed = Number(rawTimeout)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PROXY_TIMEOUT_MS
  }
  return Math.min(MAX_PROXY_TIMEOUT_MS, Math.max(MIN_PROXY_TIMEOUT_MS, Math.floor(parsed)))
}

/**
 * 解析 fetch 异常，尽量透传底层 cause 信息
 */
export function parseProxyError(error) {
  const payload = {
    message: error instanceof Error ? error.message : 'Unknown error',
  }

  if (!(error instanceof Error) || !error.cause || typeof error.cause !== 'object') {
    return payload
  }

  const cause = error.cause
  const parsedCause = {}

  if (typeof cause.name === 'string') {
    parsedCause.name = cause.name
  }
  if (typeof cause.code === 'string' || typeof cause.code === 'number') {
    parsedCause.code = String(cause.code)
  }
  if (typeof cause.message === 'string') {
    parsedCause.message = cause.message
  }

  if (Object.keys(parsedCause).length > 0) {
    payload.cause = parsedCause
  }

  return payload
}

export async function handleProxyRequest(targetUrl) {
  try {
    new URL(targetUrl)
  } catch {
    throw new Error('Invalid URL format')
  }

  const timeoutMs = getProxyTimeoutMs()
  return fetch(targetUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept: 'application/json, text/plain, */*',
    },
    signal: AbortSignal.timeout(timeoutMs),
  })
}

export function getTargetUrl(url) {
  const urlObj = new URL(url, 'http://localhost')
  const targetUrl = urlObj.searchParams.get('url')

  if (!targetUrl) {
    throw new Error('URL parameter is required')
  }

  return decodeURIComponent(targetUrl)
}

export function isM3u8Response(targetUrl, contentType = '') {
  return (
    targetUrl.toLowerCase().includes('.m3u8') ||
    contentType.includes('mpegurl') ||
    contentType.includes('x-mpegurl')
  )
}

export function rewriteM3u8Urls(text, baseUrl) {
  if (!text || !text.includes('#EXTM3U')) return text
  const lines = text.split('\n')
  const rewritten = lines.map(line => {
    const trimmed = line.trim()
    if (!trimmed) return line

    // 处理包含 URI="..." 的所有 HLS 标签（如 EXT-X-KEY, EXT-X-MAP, EXT-X-MEDIA 等）
    if (trimmed.startsWith('#') && trimmed.includes('URI="')) {
      return line.replace(/URI="([^"]+)"/g, (match, uri) => {
        if (!uri.startsWith('http://') && !uri.startsWith('https://')) {
          try {
            return `URI="${new URL(uri, baseUrl).href}"`
          } catch {
            return match
          }
        }
        return match
      })
    }

    if (
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('http://') &&
      !trimmed.startsWith('https://')
    ) {
      try {
        return new URL(trimmed, baseUrl).href
      } catch {
        return line
      }
    }
    return line
  })
  return rewritten.join('\n')
}
