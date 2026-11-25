import { toast } from 'sonner'

const DEFAULT_UPDATE_INTERVAL_MS = 30 * 60 * 1000
const UPDATE_TOAST_ID = 'pwa-update-available'

export interface PwaUpdateNotifier {
  showUpdatePrompt: (onConfirm: () => void) => void
}

export interface RegisterPwaOptions {
  swUrl?: string
  enabled?: boolean
  updateIntervalMs?: number
  notifier?: PwaUpdateNotifier
  reloadFn?: () => void
  onError?: (error: unknown) => void
}

const defaultNotifier: PwaUpdateNotifier = {
  showUpdatePrompt: onConfirm => {
    toast('发现新版本', {
      id: UPDATE_TOAST_ID,
      description: '新版本已准备就绪，刷新页面即可应用更新。',
      duration: Infinity,
      action: {
        label: '立即刷新',
        onClick: onConfirm,
      },
    })
  },
}

/**
 * 注册 PWA Service Worker 并在检测到新版本等待激活时弹出刷新提示。
 */
export function registerPwa(options: RegisterPwaOptions = {}): () => void {
  const {
    swUrl = '/sw.js',
    enabled = import.meta.env.PROD,
    updateIntervalMs = DEFAULT_UPDATE_INTERVAL_MS,
    notifier = defaultNotifier,
    reloadFn = () => window.location.reload(),
    onError,
  } = options

  if (
    !enabled ||
    typeof window === 'undefined' ||
    typeof navigator === 'undefined' ||
    !('serviceWorker' in navigator)
  ) {
    return () => {}
  }

  let disposed = false
  let reloading = false
  let registrationRef: ServiceWorkerRegistration | null = null
  let activePromptWorker: ServiceWorker | null = null
  let controllerActivatedExternally = false
  const promptedWorkers = new WeakSet<ServiceWorker>()
  const observedWorkers = new WeakSet<ServiceWorker>()
  const workerCleanups: Array<() => void> = []

  const container = navigator.serviceWorker

  const promptForWorker = (worker: ServiceWorker | null | undefined) => {
    if (!worker || disposed || promptedWorkers.has(worker)) return
    promptedWorkers.add(worker)
    activePromptWorker = worker
    controllerActivatedExternally = false

    notifier.showUpdatePrompt(() => {
      if (disposed || reloading) return

      const alreadyActivated =
        worker.state === 'activated' ||
        container.controller === worker ||
        (controllerActivatedExternally && activePromptWorker === worker)

      if (alreadyActivated) {
        reloading = true
        reloadFn()
        return
      }

      reloading = true
      worker.postMessage({ type: 'SKIP_WAITING' })
    })
  }

  const handleControllerChange = () => {
    if (disposed) return
    if (reloading) {
      reloading = false
      reloadFn()
      return
    }
    if (activePromptWorker) {
      controllerActivatedExternally = true
    }
  }

  const observeInstallingWorker = (worker: ServiceWorker | null | undefined) => {
    if (!worker || disposed || observedWorkers.has(worker)) return
    observedWorkers.add(worker)

    if (worker.state === 'installed' && container.controller) {
      promptForWorker(registrationRef?.waiting ?? worker)
      return
    }

    const handleStateChange = () => {
      if (disposed) {
        worker.removeEventListener('statechange', handleStateChange)
        return
      }

      if (worker.state === 'installed' && container.controller) {
        promptForWorker(registrationRef?.waiting ?? worker)
      }

      if (worker.state === 'activated' || worker.state === 'redundant') {
        worker.removeEventListener('statechange', handleStateChange)
      }
    }

    worker.addEventListener('statechange', handleStateChange)
    workerCleanups.push(() => {
      worker.removeEventListener('statechange', handleStateChange)
    })
  }

  const handleUpdateFound = () => {
    observeInstallingWorker(registrationRef?.installing)
  }

  const checkForUpdates = () => {
    if (disposed || !registrationRef) return
    void registrationRef.update().catch(() => {
      /* 离线或网络波动时忽略轮询检查错误 */
    })
  }

  const handleVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      checkForUpdates()
    }
  }

  container.addEventListener('controllerchange', handleControllerChange)
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  const intervalId =
    updateIntervalMs > 0 ? window.setInterval(checkForUpdates, updateIntervalMs) : null

  void container
    .register(swUrl, { updateViaCache: 'none' })
    .then(registration => {
      if (disposed) return
      registrationRef = registration

      registration.addEventListener('updatefound', handleUpdateFound)

      if (registration.waiting && container.controller) {
        promptForWorker(registration.waiting)
      }

      if (registration.installing) {
        observeInstallingWorker(registration.installing)
      }
    })
    .catch(error => {
      onError?.(error)
    })

  return () => {
    disposed = true
    container.removeEventListener('controllerchange', handleControllerChange)
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
    if (registrationRef) {
      registrationRef.removeEventListener('updatefound', handleUpdateFound)
    }
    for (const cleanupWorker of workerCleanups) {
      cleanupWorker()
    }
    workerCleanups.length = 0
    if (intervalId !== null) {
      window.clearInterval(intervalId)
    }
  }
}
