/**
 * xkaTV - Cloudflare Worker 电视直播/HLS 流反向代理
 *
 * 功能特性：
 * 1. 解决浏览器 HTTPS 下播放 HTTP 直播流报 Mixed Content（混合内容被阻断）的问题
 * 2. 自动补充 M3U8 播放列表中的相对路径切片，保证后续 TS 请求也能命中代理池
 * 3. 补全 CORS 跨域请求头（Access-Control-Allow-Origin: *）
 * 4. 视频切片以原生 Stream 直传，零内存积压，不消耗 Worker CPU 时间
 * 5. 建议在 2~3 个 Cloudflare 独立免费小号中分别部署，获得每日 200,000~300,000 次请求额度池
 */

export default {
  async fetch(request) {
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    }

    // 处理浏览器预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders })
    }

    const { searchParams } = new URL(request.url)
    const targetUrl = searchParams.get('url')

    if (!targetUrl) {
      return new Response('Missing ?url= parameter', { status: 400, headers: corsHeaders })
    }

    try {
      const targetObj = new URL(targetUrl)
      const reqHeaders = new Headers(request.headers)
      reqHeaders.delete('host')
      reqHeaders.set(
        'User-Agent',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      )
      if (!reqHeaders.has('Referer')) {
        reqHeaders.set('Referer', `${targetObj.origin}/`)
      }

      const response = await fetch(targetUrl, {
        method: request.method,
        headers: reqHeaders,
        redirect: 'follow',
      })

      const respHeaders = new Headers(response.headers)
      Object.entries(corsHeaders).forEach(([k, v]) => respHeaders.set(k, v))
      respHeaders.delete('content-security-policy')
      respHeaders.delete('x-frame-options')

      const contentType = respHeaders.get('content-type') || ''
      const isM3u8 =
        targetUrl.toLowerCase().includes('.m3u8') ||
        contentType.includes('mpegurl') ||
        contentType.includes('x-mpegurl')

      // M3U8 播放列表重写：将相对切片路径转为绝对路径，避免浏览器相对路径解析错误
      if (isM3u8 && response.status === 200) {
        let text = await response.text()
        const endpoint = new URL(request.url)
        endpoint.searchParams.set('native', '1')
        endpoint.searchParams.delete('url')
        const prefix = endpoint.href + '&url='
        text = rewriteM3u8Urls(
          text,
          response.url || targetUrl,
          new URL(request.url).searchParams.get('native') === '1' ? prefix : '',
        )
        respHeaders.delete('content-length')
        respHeaders.delete('content-encoding')
        respHeaders.set('Cache-Control', 'no-store')
        return new Response(text, {
          status: response.status,
          statusText: response.statusText,
          headers: respHeaders,
        })
      }

      // 视频切片以 Stream 形式直接透传
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: respHeaders,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return new Response(`Proxy Error: ${message}`, { status: 502, headers: corsHeaders })
    }
  },
}

function rewriteM3u8Urls(text, baseUrl, proxyPrefix = '') {
  if (!text || !text.includes('#EXTM3U')) return text
  const resolve = uri => {
    try {
      const absolute = new URL(uri, baseUrl)
      return proxyPrefix && /^https?:$/.test(absolute.protocol)
        ? proxyPrefix + encodeURIComponent(absolute.href)
        : absolute.href
    } catch {
      return uri
    }
  }
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim()
      if (!trimmed) return line
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${resolve(uri)}"`)
      }
      return resolve(trimmed)
    })
    .join('\n')
}
