/**
 * xkaTV - 零依赖独立 Node.js 直播流代理服务器 (支持 Serv00 / VPS / 独立主机)
 *
 * 特性：
 * 1. 零外部依赖 (无需 npm install express / cors 等，使用 Node 18+ 原生标准库)
 * 2. 完美支持纯 IP、内网、非标准端口直播流 (无 Cloudflare 1003 限制)
 * 3. 自动补充 CORS 跨域请求头与 M3U8 相对路径切片
 * 4. 支持 ?native=1 原生 HLS (Safari/iOS) 递归代理重写
 * 5. 兼容 Serv00 (Phusion Passenger) 与标准 `node app.js` 启动方式
 */

const http = require('http');

const PORT = process.env.PORT || 3000;

function rewriteM3u8Urls(text, baseUrl, proxyPrefix = '') {
  if (!text || !text.includes('#EXTM3U')) return text;
  const resolve = uri => {
    try {
      const absolute = new URL(uri, baseUrl);
      return proxyPrefix && /^https?:$/.test(absolute.protocol)
        ? proxyPrefix + encodeURIComponent(absolute.href)
        : absolute.href;
    } catch {
      return uri;
    }
  };
  return text
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI="([^"]+)"/g, (_match, uri) => `URI="${resolve(uri)}"`);
      }
      return resolve(trimmed);
    })
    .join('\n');
}

async function handleRequest(req, res) {
  // CORS 跨域头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  // 处理浏览器预检请求
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  // 根路径健康检查
  if (parsedUrl.pathname === '/' || parsedUrl.pathname === '') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ status: 'ok', service: 'xkaTV Live Stream Proxy' }));
  }

  // 核心代理路由 /proxy
  if (parsedUrl.pathname === '/proxy') {
    const targetUrl = parsedUrl.searchParams.get('url');
    if (!targetUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'Missing ?url= parameter' }));
    }

    try {
      const targetObj = new URL(targetUrl);
      const reqHeaders = {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        Referer: `${targetObj.origin}/`,
        Accept: '*/*',
      };

      const response = await fetch(targetUrl, {
        method: req.method,
        headers: reqHeaders,
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });

      const contentType = response.headers.get('content-type') || '';
      const isM3u8 =
        targetUrl.toLowerCase().includes('.m3u8') ||
        contentType.includes('mpegurl') ||
        contentType.includes('x-mpegurl');

      res.statusCode = response.status;
      if (contentType) res.setHeader('Content-Type', contentType);

      if (isM3u8 && response.status === 200) {
        res.setHeader('Cache-Control', 'no-store');
        let text = await response.text();
        const isNative = parsedUrl.searchParams.get('native') === '1';
        const prefix = isNative ? '/proxy?native=1&url=' : '';
        text = rewriteM3u8Urls(text, response.url || targetUrl, prefix);
        return res.end(text);
      }

      res.setHeader('Cache-Control', 'no-store');
      const arrayBuffer = await response.arrayBuffer();
      return res.end(Buffer.from(arrayBuffer));
    } catch (err) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(JSON.stringify({ error: 'Proxy Error', message: err.message }));
    }
  }

  res.statusCode = 404;
  res.end('Not Found');
}

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
  console.log(`xkaTV Proxy running on port ${PORT}`);
});

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { handleRequest, rewriteM3u8Urls, server };
}
