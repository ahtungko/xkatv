import { describe, expect, it, vi } from 'vitest'
import { createCmsClient } from '@xkatv/cms-core'
import type { VideoSource } from '@xkatv/cms-core'

describe('aggregated search cancellation', () => {
  it('passes cancellation to an active source request', async () => {
    const source: VideoSource = {
      id: 'source', name: 'Source', url: 'https://example.com/api',
      detailUrl: 'https://example.com/api', isEnabled: true, updatedAt: new Date(),
      timeout: 5000, retry: 0,
    }
    let requestSignal: AbortSignal | undefined
    const client = createCmsClient({
      requestAdapter: {
        fetch: vi.fn((_url, config) => {
          requestSignal = config?.signal
          return new Promise<Response>((_resolve, reject) => {
            requestSignal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))
          })
        }),
      },
    })
    const controller = new AbortController()
    const search = client.aggregatedSearch('test', [source], 1, controller.signal)
    await vi.waitFor(() => expect(requestSignal).toBeDefined())
    controller.abort()
    await expect(search).rejects.toMatchObject({ name: 'AbortError' })
    expect(requestSignal?.aborted).toBe(true)
  })
})
