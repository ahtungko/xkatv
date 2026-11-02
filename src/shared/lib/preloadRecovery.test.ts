import { describe, expect, it, vi } from 'vitest'
import {
  handlePreloadError,
  isDynamicImportError,
  registerPreloadRecovery,
} from './preloadRecovery'

describe('isDynamicImportError', () => {
  it.each([
    new TypeError('Failed to fetch dynamically imported module: https://tv.vyxolabs.com/assets/HomeView-B0vPL-0X.js'),
    new Error('Importing a module script failed.'),
    new Error('error loading dynamically imported module'),
    new Error('Failed to load module script: /assets/index.js'),
    Object.assign(new Error('loading chunk failed'), { name: 'ChunkLoadError' }),
    'Failed to fetch dynamically imported module',
    Object.assign(new Error('Wrapper error'), {
      cause: new TypeError('Failed to fetch dynamically imported module'),
    }),
  ])('识别各类浏览器动态分块导入失败：%s', err => {
    expect(isDynamicImportError(err)).toBe(true)
  })

  it.each([
    new Error('Network request failed'),
    new TypeError('Cannot read properties of undefined'),
    null,
    undefined,
    123,
    {},
  ])('忽略常规业务与渲染错误：%s', err => {
    expect(isDynamicImportError(err)).toBe(false)
  })
})

describe('handlePreloadError', () => {
  function createMockStorage(): Storage {
    const data = new Map<string, string>()
    return {
      getItem: (key: string) => data.get(key) ?? null,
      setItem: (key: string, value: string) => data.set(key, value),
      removeItem: (key: string) => data.delete(key),
      clear: () => data.clear(),
      key: () => null,
      length: 0,
    }
  }

  it('触发分块加载失败时刷新页面，并写入重载时间戳', () => {
    const reload = vi.fn()
    const storage = createMockStorage()
    const event = new Event('vite:preloadError')
    const preventDefault = vi.spyOn(event, 'preventDefault')

    const reloaded = handlePreloadError(event, reload, storage)
    expect(reloaded).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(storage.getItem('xkatv_vite_preload_reloaded_at')).not.toBeNull()
  })

  it('冷却时间内不触发重载，且绝不调用 preventDefault，让异常正常抛出', () => {
    const reload = vi.fn()
    const storage = createMockStorage()
    storage.setItem('xkatv_vite_preload_reloaded_at', String(Date.now() - 2000))
    const event = new Event('vite:preloadError')
    const preventDefault = vi.spyOn(event, 'preventDefault')

    const reloaded = handlePreloadError(event, reload, storage)
    expect(reloaded).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('存储不可用 (null) 时，不触发刷新且不阻止默认事件，交由错误边界处理', () => {
    const reload = vi.fn()
    const event = new Event('vite:preloadError')
    const preventDefault = vi.spyOn(event, 'preventDefault')

    const reloaded = handlePreloadError(event, reload, null)
    expect(reloaded).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('存储读取抛出异常（如受限沙箱）时，捕获异常并不触发刷新', () => {
    const reload = vi.fn()
    const storage = {
      getItem: () => {
        throw new Error('Access denied to storage')
      },
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    }
    const event = new Event('vite:preloadError')
    const preventDefault = vi.spyOn(event, 'preventDefault')

    const reloaded = handlePreloadError(event, reload, storage)
    expect(reloaded).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('存储写入抛出异常（如 QuotaExceeded）时，不触发刷新以防死循环', () => {
    const reload = vi.fn()
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('Quota exceeded')
      },
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0,
    }
    const event = new Event('vite:preloadError')
    const preventDefault = vi.spyOn(event, 'preventDefault')

    const reloaded = handlePreloadError(event, reload, storage)
    expect(reloaded).toBe(false)
    expect(reload).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })

  it('冷却时间过后可再次触发重载', () => {
    const reload = vi.fn()
    const storage = createMockStorage()
    storage.setItem('xkatv_vite_preload_reloaded_at', String(Date.now() - 20_000))
    const event = new Event('vite:preloadError')
    const preventDefault = vi.spyOn(event, 'preventDefault')

    const reloaded = handlePreloadError(event, reload, storage)
    expect(reloaded).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })
})

describe('registerPreloadRecovery', () => {
  it('正确注册并在清理时注销事件监听', () => {
    const addEventListener = vi.fn()
    const removeEventListener = vi.fn()
    const mockWindow = { addEventListener, removeEventListener } as unknown as Window

    const unregister = registerPreloadRecovery(mockWindow)
    expect(addEventListener).toHaveBeenCalledWith('vite:preloadError', expect.any(Function))

    unregister()
    expect(removeEventListener).toHaveBeenCalledWith('vite:preloadError', expect.any(Function))
  })
})
