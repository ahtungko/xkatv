const RELOAD_KEY = 'xkatv_vite_preload_reloaded_at'
const COOLDOWN_MS = 10_000

export function isDynamicImportError(error: unknown): boolean {
  if (!error) return false
  const err = error as { message?: unknown; name?: unknown; cause?: unknown }
  const message =
    typeof error === 'string'
      ? error
      : typeof err.message === 'string'
        ? err.message
        : ''
  const causeMessage =
    err.cause && typeof (err.cause as { message?: unknown }).message === 'string'
      ? (err.cause as { message: string }).message
      : ''
  const combined = `${message} ${causeMessage}`
  return (
    combined.includes('dynamically imported module') ||
    combined.includes('Failed to fetch dynamically imported module') ||
    combined.includes('Importing a module script failed') ||
    combined.includes('error loading dynamically imported module') ||
    combined.includes('Failed to load module script') ||
    err.name === 'ChunkLoadError'
  )
}

export function handlePreloadError(
  event?: Event,
  reloadFn: () => void = () => window.location.reload(),
  storage?: Storage | null,
): boolean {
  try {
    const store =
      storage !== undefined
        ? storage
        : typeof window !== 'undefined'
          ? window.sessionStorage
          : null

    if (!store) {
      return false
    }

    const lastReload = Number(store.getItem(RELOAD_KEY) || 0)
    const now = Date.now()

    if (!lastReload || now - lastReload > COOLDOWN_MS) {
      store.setItem(RELOAD_KEY, String(now))
      event?.preventDefault()
      reloadFn()
      return true
    }
  } catch {
    // 存储不可用或写入失败时不触发自动刷新，避免失去冷却保护导致死循环
    return false
  }

  return false
}

export function registerPreloadRecovery(target?: Window): () => void {
  if (typeof window === 'undefined') return () => {}
  const win = target ?? window
  const listener = (event: Event) => {
    handlePreloadError(event)
  }
  win.addEventListener('vite:preloadError', listener)
  return () => {
    win.removeEventListener('vite:preloadError', listener)
  }
}
