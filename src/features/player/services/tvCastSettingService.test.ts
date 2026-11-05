import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSettingStore } from '@/shared/store/settingStore'
import { useAuthStore } from '@/shared/store/authStore'
import {
  parseSettingValue,
  fetchRemoteTvCastSetting,
  setGlobalTvCastEnabled,
  initTvCastSettingSync,
  resetTvCastSettingSyncForTest,
} from './tvCastSettingService'
import * as syncClientModule from '@/shared/sync/client'

describe('tvCastSettingService', () => {
  const originalSystemSettings = useSettingStore.getState().system

  beforeEach(() => {
    useSettingStore.setState({
      system: {
        ...originalSystemSettings,
        isTvCastEnabled: true,
      },
    })
    useAuthStore.setState({
      account: null,
      session: null,
      initialized: true,
      error: null,
    })
  })

  afterEach(() => {
    resetTvCastSettingSyncForTest()
    useSettingStore.setState({ system: originalSystemSettings })
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  describe('parseSettingValue', () => {
    it('正确解析布尔值和不同格式的对象', () => {
      expect(parseSettingValue(true)).toBe(true)
      expect(parseSettingValue(false)).toBe(false)
      expect(parseSettingValue({ enabled: true })).toBe(true)
      expect(parseSettingValue({ enabled: false })).toBe(false)
      expect(parseSettingValue('true')).toBe(true)
      expect(parseSettingValue('false')).toBe(false)
      expect(parseSettingValue('1')).toBe(true)
      expect(parseSettingValue('0')).toBe(false)
      expect(parseSettingValue(null)).toBeNull()
      expect(parseSettingValue(undefined)).toBeNull()
      expect(parseSettingValue('invalid')).toBeNull()
    })
  })

  describe('fetchRemoteTvCastSetting', () => {
    it('当 syncClient 为空时直接返回 null 且不修改 store', async () => {
      vi.spyOn(syncClientModule, 'syncClient', 'get').mockReturnValue(null)

      const result = await fetchRemoteTvCastSetting()
      expect(result).toBeNull()
      expect(useSettingStore.getState().system.isTvCastEnabled).toBe(true)
    })

    it('当 RPC 调用成功且返回 false 时，更新 store 并返回 false', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: false, error: null })
      vi.spyOn(syncClientModule, 'syncClient', 'get').mockReturnValue({
        rpc: mockRpc,
      } as unknown as typeof syncClientModule.syncClient)

      const result = await fetchRemoteTvCastSetting()
      expect(result).toBe(false)
      expect(useSettingStore.getState().system.isTvCastEnabled).toBe(false)
      expect(mockRpc).toHaveBeenCalledWith('get_site_setting', { p_key: 'is_tv_cast_enabled' })
    })

    it('当 RPC 报错时，回退到普通表查询', async () => {
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'no rpc' } })
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { value: false },
        error: null,
      })
      const mockEq = vi.fn().mockReturnValue({
        maybeSingle: mockMaybeSingle,
      })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })

      vi.spyOn(syncClientModule, 'syncClient', 'get').mockReturnValue({
        rpc: mockRpc,
        from: mockFrom,
      } as unknown as typeof syncClientModule.syncClient)

      const result = await fetchRemoteTvCastSetting()
      expect(result).toBe(false)
      expect(useSettingStore.getState().system.isTvCastEnabled).toBe(false)
    })

    it('当远程数据库无记录 (返回 null) 时，保留当前客户端环境配置不被覆盖', async () => {
      useSettingStore.setState({
        system: {
          ...originalSystemSettings,
          isTvCastEnabled: false,
        },
      })
      const mockRpc = vi.fn().mockResolvedValue({ data: null, error: null })
      vi.spyOn(syncClientModule, 'syncClient', 'get').mockReturnValue({
        rpc: mockRpc,
      } as unknown as typeof syncClientModule.syncClient)

      const result = await fetchRemoteTvCastSetting()
      expect(result).toBeNull()
      expect(useSettingStore.getState().system.isTvCastEnabled).toBe(false)
    })
  })

  describe('setGlobalTvCastEnabled', () => {
    it('非管理员尝试修改时直接拒绝并抛出异常', async () => {
      await expect(setGlobalTvCastEnabled(false)).rejects.toThrow('仅管理员可以修改全站大屏投屏状态')
      expect(useSettingStore.getState().system.isTvCastEnabled).toBe(true)
    })

    it('当远程写入均失败时保持本地状态不变', async () => {
      useAuthStore.setState({
        account: { role: 'admin', enabled: true } as NonNullable<
          ReturnType<typeof useAuthStore.getState>['account']
        >,
        session: { access_token: 'token' } as NonNullable<
          ReturnType<typeof useAuthStore.getState>['session']
        >,
      })
      const query = { setHeader: vi.fn().mockResolvedValue({ error: { message: 'network down' } }) }
      vi.spyOn(syncClientModule, 'syncClient', 'get').mockReturnValue({
        rpc: () => query,
        from: () => ({ upsert: () => query }),
      } as unknown as typeof syncClientModule.syncClient)

      await expect(setGlobalTvCastEnabled(false)).rejects.toThrow('network down')
      expect(useSettingStore.getState().system.isTvCastEnabled).toBe(true)
    })

    it('本地与跨标签页同步：更新 local settingStore 并广播消息', async () => {
      useAuthStore.setState({
        account: { role: 'admin', enabled: true } as NonNullable<
          ReturnType<typeof useAuthStore.getState>['account']
        >,
      })
      vi.spyOn(syncClientModule, 'syncClient', 'get').mockReturnValue(null)
      const postMessageSpy = vi.fn()
      class MockBroadcastChannel {
        postMessage = postMessageSpy
        addEventListener = vi.fn()
        removeEventListener = vi.fn()
        close = vi.fn()
      }
      vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
      resetTvCastSettingSyncForTest()

      await setGlobalTvCastEnabled(false)

      expect(useSettingStore.getState().system.isTvCastEnabled).toBe(false)
      expect(postMessageSpy).toHaveBeenCalledWith({
        type: 'TV_CAST_SETTING_CHANGED',
        enabled: false,
      })
    })

    it('当管理员登录并配置了 syncClient 时，同步持久化到数据库', async () => {
      const mockSetHeader = vi.fn().mockResolvedValue({ error: null })
      const mockRpc = vi.fn().mockReturnValue({
        setHeader: mockSetHeader,
      })
      vi.spyOn(syncClientModule, 'syncClient', 'get').mockReturnValue({
        rpc: mockRpc,
      } as unknown as typeof syncClientModule.syncClient)

      useAuthStore.setState({
        account: {
          id: 'admin-id',
          username: 'admin',
          role: 'admin',
          enabled: true,
          allow_nsfw: true,
          devices: [],
          created_at: new Date().toISOString(),
        },
        session: {
          access_token: 'fake-admin-token',
        } as unknown as ReturnType<typeof useAuthStore.getState>['session'],
      })

      await setGlobalTvCastEnabled(false)

      expect(useSettingStore.getState().system.isTvCastEnabled).toBe(false)
      expect(mockRpc).toHaveBeenCalledWith('set_site_setting', {
        p_key: 'is_tv_cast_enabled',
        p_value: false,
      })
      expect(mockSetHeader).toHaveBeenCalledWith('Authorization', 'Bearer fake-admin-token')
    })
  })

  describe('initTvCastSettingSync', () => {
    it('监听 BroadcastChannel 消息并更新本地状态', () => {
      let messageHandler: ((event: MessageEvent) => void) | null = null
      class MockBroadcastChannel {
        postMessage = vi.fn()
        addEventListener = vi.fn((event, handler) => {
          if (event === 'message') messageHandler = handler
        })
        removeEventListener = vi.fn()
        close = vi.fn()
      }
      vi.stubGlobal('BroadcastChannel', MockBroadcastChannel)
      resetTvCastSettingSyncForTest()

      const cleanup = initTvCastSettingSync()

      expect(useSettingStore.getState().system.isTvCastEnabled).toBe(true)

      // 模拟跨标签页消息广播
      if (messageHandler) {
        ;(messageHandler as (event: MessageEvent) => void)({
          data: { type: 'TV_CAST_SETTING_CHANGED', enabled: false },
        } as MessageEvent)
      }

      expect(useSettingStore.getState().system.isTvCastEnabled).toBe(false)

      cleanup()
    })
  })
})
