const CACHE_VERSION = '__CACHE_VERSION__'
const OFFLINE_URL = '/offline.html'
const SHELL_URL = '/index.html'

const PRECACHE_URLS = [
  OFFLINE_URL,
  '/site.webmanifest',
  '/favicon.svg',
  '/web-app-manifest-192x192.png',
  '/web-app-manifest-512x512.png',
]

const BYPASS_PREFIXES = ['/api/', '/proxy', '/.netlify/', '/sw.js']
const STREAM_EXTENSION_RE = /\.(m3u8|ts|m4s|mp4|mkv|flv)(\?|$)/i

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_VERSION).then(cache => cache.addAll(PRECACHE_URLS)))
})

self.addEventListener('activate', event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(keys.filter(key => key !== CACHE_VERSION).map(key => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

async function safeCacheMatch(key) {
  try {
    return await caches.match(key)
  } catch {
    return undefined
  }
}

async function safeCachePut(key, response) {
  try {
    const cache = await caches.open(CACHE_VERSION)
    await cache.put(key, response)
  } catch {
    // 缓存写入失败（如存储空间不足）不应阻断正常的网络响应。
  }
}

async function handleNavigation(request) {
  let response
  try {
    response = await fetch(request)
  } catch {
    const cachedShell = await safeCacheMatch(SHELL_URL)
    if (cachedShell) return cachedShell
    const offlinePage = await safeCacheMatch(OFFLINE_URL)
    if (offlinePage) return offlinePage
    return new Response('Offline', { status: 503, statusText: 'Service Unavailable' })
  }

  if (response && response.ok && response.type === 'basic') {
    await safeCachePut(SHELL_URL, response.clone())
  }
  return response
}

async function handleCacheFirst(request) {
  const cached = await safeCacheMatch(request)
  if (cached) return cached

  const response = await fetch(request)
  if (response && response.ok && response.type === 'basic') {
    await safeCachePut(request, response.clone())
  }
  return response
}

async function handleNetworkFirst(request) {
  let response
  try {
    response = await fetch(request)
  } catch (error) {
    const cached = await safeCacheMatch(request)
    if (cached) return cached
    throw error
  }

  if (response && response.ok && response.type === 'basic') {
    await safeCachePut(request, response.clone())
  }
  return response
}

self.addEventListener('fetch', event => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (BYPASS_PREFIXES.some(prefix => url.pathname.startsWith(prefix))) return
  if (STREAM_EXTENSION_RE.test(url.pathname)) return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
    return
  }

  if (url.pathname === '/runtime-config.js') {
    event.respondWith(handleNetworkFirst(request))
    return
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(handleCacheFirst(request))
  }
})
