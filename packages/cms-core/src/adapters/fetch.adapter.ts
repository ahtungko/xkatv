import type { RequestAdapter, RequestConfig } from '../types'

/**
 * 默认Fetch请求适配器
 */
export function createFetchAdapter(): RequestAdapter {
  return {
    async fetch(url: string, config?: RequestConfig): Promise<Response> {
      const { timeout = 10000, retry = 3, headers, signal } = config || {}

      return fetchWithTimeout(url, { headers, signal }, timeout, retry)
    },
  }
}

/**
 * 带超时和重试的fetch实现
 */
async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeout: number,
  retry: number
): Promise<Response> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => {
    controller.abort('request timeout')
  }, timeout)

  // 合并外部signal和超时signal
  const originalSignal = options.signal
  const onAbort = () => {
    clearTimeout(timeoutId)
    controller.abort(originalSignal?.reason)
  }
  if (originalSignal) {
    if (originalSignal.aborted) {
      clearTimeout(timeoutId)
      throw (originalSignal as { reason?: unknown }).reason || new DOMException('Aborted', 'AbortError')
    }
    originalSignal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)

    // 如果是外部调用方主动取消（比如用户切页面或重新搜索），不进行重试
    if (originalSignal?.aborted) {
      throw error
    }

    if (retry > 0 && (error as Error)?.name !== 'AbortError') {
      let label = url
      try {
        const u = new URL(url)
        label = u.origin + u.pathname
      } catch {
        // keep raw url
      }
      console.warn(`[CMS] 源请求超时/失败，正在重试 (剩余${retry}次) [${label}]:`, error)
      return fetchWithTimeout(url, options, timeout, retry - 1)
    }

    throw error
  } finally {
    originalSignal?.removeEventListener('abort', onAbort)
  }
}
