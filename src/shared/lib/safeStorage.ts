import type { StateStorage } from 'zustand/middleware'

/**
 * 判断是否为 LocalStorage 空间超限错误 (QuotaExceededError)
 */
export function isQuotaExceededError(err: unknown): boolean {
  if (err instanceof DOMException) {
    return (
      err.code === 22 ||
      err.code === 1014 ||
      err.name === 'QuotaExceededError' ||
      err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
    )
  }
  if (typeof err === 'object' && err !== null) {
    const error = err as { name?: string; message?: string }
    return (
      error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      (typeof error.message === 'string' && error.message.toLowerCase().includes('quota'))
    )
  }
  return false
}

/**
 * 紧急存储空间释放策略
 * 当 localStorage 达到浏览器上限 (通常为 5MB) 时，自动清理可重建的临时缓存
 */
export function runEmergencyStorageCleanup(failingKey?: string): boolean {
  if (typeof window === 'undefined' || !window.localStorage) return false

  let reclaimed = false

  // 1. 优先清理 TMDB 匹配缓存 (纯搜索匹配结果，可随时自动重新匹配)
  if (failingKey !== 'xkatv-tmdb-match-cache-store') {
    try {
      if (localStorage.getItem('xkatv-tmdb-match-cache-store')) {
        localStorage.removeItem('xkatv-tmdb-match-cache-store')
        reclaimed = true
      }
    } catch {
      // 忽略
    }
  }

  // 2. 清理搜索历史记录 (非核心用户数据)
  if (failingKey !== 'xkatv-search-store') {
    try {
      if (localStorage.getItem('xkatv-search-store')) {
        localStorage.removeItem('xkatv-search-store')
        reclaimed = true
      }
    } catch {
      // 忽略
    }
  }

  // 3. 压缩追剧更新缓存 (仅保留前 10 条活跃更新)
  if (failingKey !== 'xkatv-series-updates') {
    try {
      const updatesRaw = localStorage.getItem('xkatv-series-updates')
      if (updatesRaw) {
        const parsed = JSON.parse(updatesRaw)
        if (parsed?.state?.entries && Object.keys(parsed.state.entries).length > 10) {
          const keys = Object.keys(parsed.state.entries).slice(0, 10)
          parsed.state.entries = Object.fromEntries(keys.map(k => [k, parsed.state.entries[k]]))
          localStorage.setItem('xkatv-series-updates', JSON.stringify(parsed))
          reclaimed = true
        }
      }
    } catch {
      // 忽略
    }
  }

  // 4. 压缩观看历史 (仅保留最新的 25 条)
  if (failingKey !== 'xkatv-viewing-history') {
    try {
      const historyRaw = localStorage.getItem('xkatv-viewing-history')
      if (historyRaw) {
        const parsed = JSON.parse(historyRaw)
        if (Array.isArray(parsed?.state?.viewingHistory) && parsed.state.viewingHistory.length > 25) {
          parsed.state.viewingHistory = parsed.state.viewingHistory.slice(0, 25)
          localStorage.setItem('xkatv-viewing-history', JSON.stringify(parsed))
          reclaimed = true
        }
      }
    } catch {
      // 忽略
    }
  }

  return reclaimed
}

/**
 * 具备防爆限配额保护与自愈特性的 LocalStorage 存储器
 */
export const safeLocalStorage: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null
      const current = localStorage.getItem(name)
      if (current !== null) return current

      // 兼容旧版前缀数据平滑迁移
      if (name.startsWith('xkatv-')) {
        const legacyKey = 'ouonnki-tv-' + name.slice(6)
        const legacyVal = localStorage.getItem(legacyKey)
        if (legacyVal !== null) {
          try {
            localStorage.setItem(name, legacyVal)
          } catch {
            // ignore
          }
          return legacyVal
        }
      }

      return null
    } catch (err) {
      console.warn(`[SafeStorage] 读取 "${name}" 失败:`, err)
      return null
    }
  },

  setItem: (name: string, value: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      localStorage.setItem(name, value)
    } catch (err) {
      if (isQuotaExceededError(err)) {
        console.warn(`[SafeStorage] LocalStorage 配额超限 ("${name}")，正在执行紧急缓存空间释放...`)
        const reclaimed = runEmergencyStorageCleanup(name)
        if (reclaimed) {
          try {
            localStorage.setItem(name, value)
            console.info(`[SafeStorage] 紧急空间释放成功，已保存 "${name}"。`)
            return
          } catch (retryErr) {
            console.error(`[SafeStorage] 空间释放后写入 "${name}" 仍超出限额:`, retryErr)
          }
        }
        return
      }
      console.error(`[SafeStorage] 写入 "${name}" 发生未知错误:`, err)
    }
  },

  removeItem: (name: string): void => {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return
      localStorage.removeItem(name)
    } catch (err) {
      console.warn(`[SafeStorage] 移除 "${name}" 失败:`, err)
    }
  },
}
