import { readFileSync } from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

type SwListener = (event: Record<string, unknown>) => void

interface MockResponse {
  ok: boolean
  status: number
  type: string
  body: string
  clone: () => MockResponse
}

function createMockResponse(body: string, init: Partial<MockResponse> = {}): MockResponse {
  const res: MockResponse = {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    type: init.type ?? 'basic',
    body,
    clone: () => createMockResponse(body, init),
  }
  return res
}

function loadServiceWorker(overrides?: {
  caches?: Record<string, unknown>
  fetch?: ReturnType<typeof vi.fn>
}) {
  const listeners = new Map<string, SwListener>()
  const skipWaiting = vi.fn()
  const claim = vi.fn().mockResolvedValue(undefined)
  const fetchMock = overrides?.fetch ?? vi.fn()

  const cacheStore = new Map<string, MockResponse>()
  const cacheObj = {
    addAll: vi.fn().mockResolvedValue(undefined),
    put: vi.fn(async (key: unknown, value: MockResponse) => {
      const normalized = typeof key === 'string' ? key : (key as { url: string }).url
      cacheStore.set(normalized, value)
    }),
  }

  const cachesMock = {
    open: vi.fn().mockResolvedValue(cacheObj),
    match: vi.fn(async (key: unknown) => {
      const normalized = typeof key === 'string' ? key : (key as { url: string }).url
      return cacheStore.get(normalized)
    }),
    keys: vi.fn().mockResolvedValue(['xkatv-old', 'xkatv-test']),
    delete: vi.fn().mockResolvedValue(true),
    ...overrides?.caches,
  }

  const selfMock = {
    location: { origin: 'https://example.com' },
    clients: { claim },
    skipWaiting,
    addEventListener: vi.fn((type: string, listener: SwListener) => {
      listeners.set(type, listener)
    }),
  }

  const templatePath = path.resolve(process.cwd(), 'scripts/sw.template.js')
  const source = readFileSync(templatePath, 'utf8').replace(/__CACHE_VERSION__/g, 'xkatv-test')

  vm.runInNewContext(source, {
    self: selfMock,
    caches: cachesMock,
    fetch: fetchMock,
    URL,
    Response,
  })

  return {
    listeners,
    selfMock,
    cachesMock,
    cacheObj,
    cacheStore,
    fetchMock,
    skipWaiting,
    claim,
  }
}

describe('sw.template.js', () => {
  it('rejects install waitUntil when precaching fails so the existing worker is preserved', async () => {
    const precacheError = new Error('network error during precache')
    const { listeners, cacheObj } = loadServiceWorker()
    cacheObj.addAll.mockRejectedValueOnce(precacheError)

    let waitUntilPromise: Promise<unknown> | undefined
    listeners.get('install')?.({
      waitUntil: (promise: Promise<unknown>) => {
        waitUntilPromise = promise
      },
    })

    await expect(waitUntilPromise).rejects.toThrow('network error during precache')
  })

  it('cleans up stale caches on activate and supports SKIP_WAITING messages', async () => {
    const { listeners, cachesMock, claim, skipWaiting } = loadServiceWorker()

    let waitUntilPromise: Promise<unknown> | undefined
    listeners.get('activate')?.({
      waitUntil: (promise: Promise<unknown>) => {
        waitUntilPromise = promise
      },
    })

    await waitUntilPromise
    expect(cachesMock.delete).toHaveBeenCalledWith('xkatv-old')
    expect(cachesMock.delete).not.toHaveBeenCalledWith('xkatv-test')
    expect(claim).toHaveBeenCalledTimes(1)

    listeners.get('message')?.({ data: { type: 'SKIP_WAITING' } })
    expect(skipWaiting).toHaveBeenCalledTimes(1)
  })

  it('returns the live network response even when cache writes fail across all strategies', async () => {
    const quotaError = new Error('QuotaExceededError')
    const { listeners, cacheObj, fetchMock } = loadServiceWorker()
    cacheObj.put.mockRejectedValue(quotaError)

    // 1. Navigation request
    const navRes = createMockResponse('<html>live</html>')
    fetchMock.mockResolvedValueOnce(navRes)
    let navPromise: Promise<MockResponse> | undefined
    listeners.get('fetch')?.({
      request: { method: 'GET', url: 'https://example.com/favorites', mode: 'navigate' },
      respondWith: (p: Promise<MockResponse>) => {
        navPromise = p
      },
    })
    await expect(navPromise).resolves.toBe(navRes)

    // 2. Hashed asset (cache-first)
    const assetRes = createMockResponse('console.log(1)')
    fetchMock.mockResolvedValueOnce(assetRes)
    let assetPromise: Promise<MockResponse> | undefined
    listeners.get('fetch')?.({
      request: { method: 'GET', url: 'https://example.com/assets/app-123.js', mode: 'cors' },
      respondWith: (p: Promise<MockResponse>) => {
        assetPromise = p
      },
    })
    await expect(assetPromise).resolves.toBe(assetRes)

    // 3. Runtime config (network-first)
    const configRes = createMockResponse('window.__CONFIG__={}')
    fetchMock.mockResolvedValueOnce(configRes)
    let configPromise: Promise<MockResponse> | undefined
    listeners.get('fetch')?.({
      request: { method: 'GET', url: 'https://example.com/runtime-config.js', mode: 'no-cors' },
      respondWith: (p: Promise<MockResponse>) => {
        configPromise = p
      },
    })
    await expect(configPromise).resolves.toBe(configRes)
  })

  it('falls back to cached shell then offline page when navigation fails offline', async () => {
    const { listeners, cacheStore, fetchMock } = loadServiceWorker()
    fetchMock.mockRejectedValue(new Error('offline'))

    const offlineRes = createMockResponse('<html>offline</html>')
    cacheStore.set('/offline.html', offlineRes)

    let offlinePromise: Promise<MockResponse> | undefined
    listeners.get('fetch')?.({
      request: { method: 'GET', url: 'https://example.com/settings', mode: 'navigate' },
      respondWith: (p: Promise<MockResponse>) => {
        offlinePromise = p
      },
    })
    await expect(offlinePromise).resolves.toBe(offlineRes)

    const shellRes = createMockResponse('<html>shell</html>')
    cacheStore.set('/index.html', shellRes)

    let shellPromise: Promise<MockResponse> | undefined
    listeners.get('fetch')?.({
      request: { method: 'GET', url: 'https://example.com/settings', mode: 'navigate' },
      respondWith: (p: Promise<MockResponse>) => {
        shellPromise = p
      },
    })
    await expect(shellPromise).resolves.toBe(shellRes)
  })

  it('bypasses proxy, api, sw.js, streams, and cross-origin requests', () => {
    const { listeners } = loadServiceWorker()
    const bypassedUrls = [
      'https://example.com/api/accounts',
      'https://example.com/proxy?url=abc',
      'https://example.com/sw.js',
      'https://example.com/assets/live.m3u8',
      'https://other-origin.example/assets/app.js',
    ]

    for (const url of bypassedUrls) {
      const respondWith = vi.fn()
      listeners.get('fetch')?.({
        request: { method: 'GET', url, mode: 'cors' },
        respondWith,
      })
      expect(respondWith).not.toHaveBeenCalled()
    }
  })
})
