import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isQuotaExceededError,
  runEmergencyStorageCleanup,
  safeLocalStorage,
} from './safeStorage'

describe('safeStorage', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('识别各种浏览器的配额超限错误', () => {
    const chromeQuotaErr = new DOMException('quota exceeded', 'QuotaExceededError')
    expect(isQuotaExceededError(chromeQuotaErr)).toBe(true)

    const firefoxQuotaErr = new DOMException('quota reached', 'NS_ERROR_DOM_QUOTA_REACHED')
    expect(isQuotaExceededError(firefoxQuotaErr)).toBe(true)

    const genericQuotaErr = { name: 'QuotaExceededError', message: 'Quota exceeded' }
    expect(isQuotaExceededError(genericQuotaErr)).toBe(true)

    const normalErr = new Error('Other error')
    expect(isQuotaExceededError(normalErr)).toBe(false)
  })

  it('setItem 正常写入与读取', () => {
    safeLocalStorage.setItem('test-key', 'test-value')
    expect(safeLocalStorage.getItem('test-key')).toBe('test-value')
    safeLocalStorage.removeItem('test-key')
    expect(safeLocalStorage.getItem('test-key')).toBeNull()
  })

  it('在配额超限时触发紧急清理并自动重试成功', () => {
    localStorage.setItem('xkatv-tmdb-match-cache-store', JSON.stringify({ old: 'cache' }))
    localStorage.setItem('xkatv-search-store', JSON.stringify({ search: 'history' }))

    let attempt = 0
    const originalSetItem = localStorage.setItem.bind(localStorage)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, val) => {
      if (key === 'target-store' && attempt === 0) {
        attempt++
        throw new DOMException('quota exceeded', 'QuotaExceededError')
      }
      return originalSetItem(key, val)
    })

    expect(() => safeLocalStorage.setItem('target-store', 'saved-content')).not.toThrow()
    expect(localStorage.getItem('target-store')).toBe('saved-content')
    expect(localStorage.getItem('xkatv-tmdb-match-cache-store')).toBeNull()
    expect(localStorage.getItem('xkatv-search-store')).toBeNull()
  })

  it('即使清理后依然超限也不向外抛出致命异常', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded', 'QuotaExceededError')
    })

    expect(() => safeLocalStorage.setItem('huge-key', 'huge-value')).not.toThrow()
  })

  it('runEmergencyStorageCleanup 压缩追剧更新和观看历史', () => {
    const bigUpdates = {
      state: {
        entries: Object.fromEntries(
          Array.from({ length: 25 }, (_, i) => [`k-${i}`, { id: i }]),
        ),
      },
    }
    localStorage.setItem('xkatv-series-updates', JSON.stringify(bigUpdates))

    const bigHistory = {
      state: {
        viewingHistory: Array.from({ length: 50 }, (_, i) => ({ id: i })),
      },
    }
    localStorage.setItem('xkatv-viewing-history', JSON.stringify(bigHistory))

    const cleaned = runEmergencyStorageCleanup()
    expect(cleaned).toBe(true)

    const updatesAfter = JSON.parse(localStorage.getItem('xkatv-series-updates')!)
    expect(Object.keys(updatesAfter.state.entries).length).toBe(10)

    const historyAfter = JSON.parse(localStorage.getItem('xkatv-viewing-history')!)
    expect(historyAfter.state.viewingHistory.length).toBe(25)
  })
})
