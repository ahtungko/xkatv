// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerPwa } from './pwa'

type Listener = (...args: unknown[]) => void

function createEventTargetMock() {
  const listeners = new Map<string, Set<Listener>>()
  return {
    addEventListener: vi.fn((event: string, fn: Listener) => {
      if (!listeners.has(event)) listeners.set(event, new Set())
      listeners.get(event)!.add(fn)
    }),
    removeEventListener: vi.fn((event: string, fn: Listener) => {
      listeners.get(event)?.delete(fn)
    }),
    dispatch(event: string, ...args: unknown[]) {
      listeners.get(event)?.forEach(fn => fn(...args))
    },
  }
}

describe('registerPwa', () => {
  const originalServiceWorker = navigator.serviceWorker

  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: originalServiceWorker,
    })
  })

  it('does nothing when disabled', () => {
    const register = vi.fn()
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, addEventListener: vi.fn(), removeEventListener: vi.fn() },
    })

    const cleanup = registerPwa({ enabled: false })
    expect(register).not.toHaveBeenCalled()
    cleanup()
  })

  it('prompts once when a waiting worker already exists and reloads on confirm', async () => {
    const waitingWorker = {
      state: 'installed',
      postMessage: vi.fn(),
    } as unknown as ServiceWorker

    const regTarget = createEventTargetMock()
    const registration = {
      waiting: waitingWorker,
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
      addEventListener: regTarget.addEventListener,
      removeEventListener: regTarget.removeEventListener,
    } as unknown as ServiceWorkerRegistration

    const containerTarget = createEventTargetMock()
    const container = {
      controller: {} as ServiceWorker,
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: containerTarget.addEventListener,
      removeEventListener: containerTarget.removeEventListener,
    }

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: container,
    })

    const showUpdatePrompt = vi.fn()
    const reloadFn = vi.fn()

    const cleanup = registerPwa({
      enabled: true,
      notifier: { showUpdatePrompt },
      reloadFn,
    })

    await vi.waitFor(() => {
      expect(showUpdatePrompt).toHaveBeenCalledTimes(1)
    })

    const onConfirm = showUpdatePrompt.mock.calls[0][0] as () => void
    onConfirm()

    expect(waitingWorker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(reloadFn).not.toHaveBeenCalled()

    containerTarget.dispatch('controllerchange')
    expect(reloadFn).toHaveBeenCalledTimes(1)

    cleanup()
  })

  it('prompts when updatefound finishes installing under an active controller', async () => {
    const installingTarget = createEventTargetMock()
    const installingWorker = {
      state: 'installing',
      postMessage: vi.fn(),
      addEventListener: installingTarget.addEventListener,
      removeEventListener: installingTarget.removeEventListener,
    } as unknown as ServiceWorker

    const regTarget = createEventTargetMock()
    const registration = {
      waiting: null as ServiceWorker | null,
      installing: null as ServiceWorker | null,
      update: vi.fn().mockResolvedValue(undefined),
      addEventListener: regTarget.addEventListener,
      removeEventListener: regTarget.removeEventListener,
    }

    const containerTarget = createEventTargetMock()
    const container = {
      controller: {} as ServiceWorker,
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: containerTarget.addEventListener,
      removeEventListener: containerTarget.removeEventListener,
    }

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: container,
    })

    const showUpdatePrompt = vi.fn()
    const cleanup = registerPwa({
      enabled: true,
      notifier: { showUpdatePrompt },
      reloadFn: vi.fn(),
    })

    await vi.waitFor(() => {
      expect(container.register).toHaveBeenCalledWith('/sw.js', { updateViaCache: 'none' })
    })

    registration.installing = installingWorker
    regTarget.dispatch('updatefound')

    ;(installingWorker as { state: string }).state = 'installed'
    registration.waiting = installingWorker
    installingTarget.dispatch('statechange')

    expect(showUpdatePrompt).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('observes a worker that is already installing when register() resolves', async () => {
    const installingTarget = createEventTargetMock()
    const installingWorker = {
      state: 'installing',
      postMessage: vi.fn(),
      addEventListener: installingTarget.addEventListener,
      removeEventListener: installingTarget.removeEventListener,
    } as unknown as ServiceWorker

    const regTarget = createEventTargetMock()
    const registration = {
      waiting: null as ServiceWorker | null,
      installing: installingWorker,
      update: vi.fn().mockResolvedValue(undefined),
      addEventListener: regTarget.addEventListener,
      removeEventListener: regTarget.removeEventListener,
    }

    const containerTarget = createEventTargetMock()
    const container = {
      controller: {} as ServiceWorker,
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: containerTarget.addEventListener,
      removeEventListener: containerTarget.removeEventListener,
    }

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: container,
    })

    const showUpdatePrompt = vi.fn()
    const cleanup = registerPwa({
      enabled: true,
      notifier: { showUpdatePrompt },
      reloadFn: vi.fn(),
    })

    await vi.waitFor(() => {
      expect(installingTarget.addEventListener).toHaveBeenCalledWith(
        'statechange',
        expect.any(Function),
      )
    })

    ;(installingWorker as { state: string }).state = 'installed'
    registration.waiting = installingWorker
    installingTarget.dispatch('statechange')

    expect(showUpdatePrompt).toHaveBeenCalledTimes(1)
    cleanup()
  })

  it('reloads directly on confirm when another tab already activated the update', async () => {
    const waitingWorker = {
      state: 'installed',
      postMessage: vi.fn(),
    } as unknown as ServiceWorker

    const regTarget = createEventTargetMock()
    const registration = {
      waiting: waitingWorker,
      installing: null,
      update: vi.fn().mockResolvedValue(undefined),
      addEventListener: regTarget.addEventListener,
      removeEventListener: regTarget.removeEventListener,
    } as unknown as ServiceWorkerRegistration

    const containerTarget = createEventTargetMock()
    const container = {
      controller: {} as ServiceWorker,
      register: vi.fn().mockResolvedValue(registration),
      addEventListener: containerTarget.addEventListener,
      removeEventListener: containerTarget.removeEventListener,
    }

    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: container,
    })

    const showUpdatePrompt = vi.fn()
    const reloadFn = vi.fn()

    const cleanup = registerPwa({
      enabled: true,
      notifier: { showUpdatePrompt },
      reloadFn,
    })

    await vi.waitFor(() => {
      expect(showUpdatePrompt).toHaveBeenCalledTimes(1)
    })

    // Another tab confirms first: worker activates and controllerchange fires here.
    ;(waitingWorker as { state: string }).state = 'activated'
    container.controller = waitingWorker
    containerTarget.dispatch('controllerchange')

    // This tab does not force-reload unexpectedly before the user clicks confirm.
    expect(reloadFn).not.toHaveBeenCalled()

    // User clicks confirm on the still-visible prompt -> reloads immediately without SKIP_WAITING.
    const onConfirm = showUpdatePrompt.mock.calls[0][0] as () => void
    onConfirm()

    expect(waitingWorker.postMessage).not.toHaveBeenCalled()
    expect(reloadFn).toHaveBeenCalledTimes(1)

    cleanup()
  })
})
