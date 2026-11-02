import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { VideoSource, SourceStore } from '@xkatv/cms-core'
import {
  addSource,
  removeSource,
  setSourceEnabled,
  selectAllSources,
  deselectAllSources,
  getEnabledSources,
  importSources,
} from '@xkatv/cms-core/source'
import { getAuthorizedNsfwVideoSources, getInitialVideoSources } from '@/shared/config/api.config'
import { DEFAULT_SETTINGS } from '@/shared/config/settings.config'
import { v4 as uuidv4 } from 'uuid'
import { useSettingStore } from './settingStore'
import { INITIAL_CONFIG } from '@/shared/config/initialConfig'

// 保持向后兼容的类型别名
export type VideoApi = VideoSource

interface ApiState {
  // 视频源列表
  videoAPIs: VideoSource[]
  // 广告过滤开关
  adFilteringEnabled: boolean
  // 上次同步环境变量视频源的日期 (YYYY-MM-DD)，每天仅在跨日首次访问时拉取一次
  lastEnvSourcesCheckedDate: string | null
}

interface ApiActions {
  // 设置 API 启用状态
  setApiEnabled: (apiId: string, enabled: boolean) => void
  // 添加视频 API
  addAndUpdateVideoAPI: (api: VideoSource) => void
  // 删除视频 API
  removeVideoAPI: (apiId: string) => void
  // 设置广告过滤
  setAdFilteringEnabled: (enabled: boolean) => void
  // 全选 API
  selectAllAPIs: () => void
  // 取消全选
  deselectAllAPIs: () => void
  // 初始化环境变量中的视频源
  initializeEnvSources: (force?: boolean) => Promise<void>
  clearRestrictedSources: () => void
  // 批量导入视频源
  importVideoAPIs: (apis: VideoSource[]) => void
  // 获取选中的视频源
  getSelectedAPIs: () => VideoSource[]
  // 重置视频源
  resetVideoSources: () => Promise<void>
  // 替换指定订阅的所有视频源（保留用户之前的 isEnabled 设置）
  replaceSubscriptionSources: (subscriptionId: string, sources: VideoSource[]) => void
  // 移除指定订阅的所有视频源
  removeSubscriptionSources: (subscriptionId: string) => void
  // 按 ID 数组顺序重排视频源（拖拽排序 / 一键按延迟排序）
  reorderVideoAPIs: (orderedIds: string[]) => void
}

type ApiStore = ApiState & ApiActions

/**
 * 将ApiState转换为SourceStore格式以便使用cms-core纯函数
 */
function toSourceStore(state: ApiState): SourceStore {
  return {
    sources: state.videoAPIs,
    version: 1,
  }
}

/**
 * 从SourceStore提取sources到videoAPIs
 */
function fromSourceStore(store: SourceStore): VideoSource[] {
  return store.sources
}

export const useApiStore = create<ApiStore>()(
  devtools(
    persist(
      immer<ApiStore>((set, get) => ({
        videoAPIs: [],
        adFilteringEnabled: true,
        lastEnvSourcesCheckedDate: null,

        

        // Actions - 使用cms-core纯函数
        setApiEnabled: (apiId: string, enabled: boolean) => {
          set(state => {
            const store = toSourceStore(state)
            const newStore = setSourceEnabled(store, apiId, enabled)
            state.videoAPIs = fromSourceStore(newStore)
          })
        },

        addAndUpdateVideoAPI: (api: VideoSource) => {
          set(state => {
            const store = toSourceStore(state)
            const isExisting = store.sources.some(
              s => s.id === api.id || (s.name === api.name && s.url === api.url),
            )
            // addSource会自动处理添加或更新
            const newStore = addSource(store, {
              ...api,
              updatedAt: new Date(),
            })
            const nextSources = fromSourceStore(newStore)

            // 新增源默认置顶；更新源保持原有顺序
            if (!isExisting) {
              const inserted = nextSources.find(source => source.id === api.id)
              state.videoAPIs = inserted
                ? [inserted, ...nextSources.filter(source => source.id !== inserted.id)]
                : nextSources
            } else {
              state.videoAPIs = nextSources
            }
          })
        },

        removeVideoAPI: (apiId: string) => {
          set(state => {
            const store = toSourceStore(state)
            const newStore = removeSource(store, apiId)
            state.videoAPIs = fromSourceStore(newStore)
          })
        },

        setAdFilteringEnabled: (enabled: boolean) => {
          set(state => {
            state.adFilteringEnabled = enabled
          })
        },

        selectAllAPIs: () => {
          set(state => {
            const store = toSourceStore(state)
            const newStore = selectAllSources(store)
            state.videoAPIs = fromSourceStore(newStore)
          })
        },

        deselectAllAPIs: () => {
          set(state => {
            const store = toSourceStore(state)
            const newStore = deselectAllSources(store)
            state.videoAPIs = fromSourceStore(newStore)
          })
        },

        initializeEnvSources: async (force = false) => {
          const today = new Date().toISOString().slice(0, 10)
          const state = get()

          // 每天仅拉取一次：如果今天已经对齐过且本地已有源，且非强制，则直接跳过，零网络请求
          if (!force && state.lastEnvSourcesCheckedDate === today && state.videoAPIs.length > 0) {
            return
          }

          try {
            const [envSources, nsfwSources] = await Promise.all([
              getInitialVideoSources(),
              getAuthorizedNsfwVideoSources(),
            ])
            set(draft => {
              if (typeof INITIAL_CONFIG?.adFilteringEnabled === 'boolean') {
                draft.adFilteringEnabled = INITIAL_CONFIG.adFilteringEnabled
              }

              // 如果因离线或断网未拉取到任何源，保留现有数据不破坏
              if (envSources.length === 0 && nsfwSources.length === 0) {
                return
              }

              draft.lastEnvSourcesCheckedDate = today

              const oldEnabledMap = new Map<string, boolean>()
              for (const s of draft.videoAPIs) {
                oldEnabledMap.set(s.id, s.isEnabled)
                oldEnabledMap.set(s.name, s.isEnabled)
              }

              const incomingEnvIds = new Set(envSources.map(s => s.id))
              const incomingNsfwIds = new Set(nsfwSources.map(s => s.id))

              const preservedManualSources = draft.videoAPIs.filter(s => {
                if (s.id.startsWith('sub:')) return false
                if (s.id.startsWith('nsfw_env_') || s.isNsfw) return false
                if (s.isEnv || s.id.startsWith('env_source_')) return false
                if (incomingEnvIds.has(s.id) || incomingNsfwIds.has(s.id)) return false
                return true
              })
              const preservedSubSources = draft.videoAPIs.filter(s => s.id.startsWith('sub:'))

              const networkSettings = useSettingStore.getState().network

              const updatedEnvSources: VideoSource[] = envSources.map(s => {
                const prevEnabled = oldEnabledMap.get(s.id) ?? oldEnabledMap.get(s.name)
                return {
                  ...s,
                  timeout: s.timeout ?? networkSettings.defaultTimeout,
                  retry: s.retry ?? networkSettings.defaultRetry,
                  isEnv: true,
                  isEnabled: prevEnabled !== undefined ? prevEnabled : (s.isEnabled ?? true),
                  updatedAt: new Date(),
                }
              })

              const updatedNsfwSources: VideoSource[] = nsfwSources.map(s => {
                const prevEnabled = oldEnabledMap.get(s.id) ?? oldEnabledMap.get(s.name)
                return {
                  ...s,
                  timeout: s.timeout ?? networkSettings.defaultTimeout,
                  retry: s.retry ?? networkSettings.defaultRetry,
                  isEnv: true,
                  isNsfw: true,
                  isEnabled: prevEnabled !== undefined ? prevEnabled : (s.isEnabled ?? true),
                  updatedAt: new Date(),
                }
              })

              draft.videoAPIs = [
                ...preservedManualSources,
                ...updatedEnvSources,
                ...updatedNsfwSources,
                ...preservedSubSources,
              ]
            })
          } catch (error) {
            console.error('初始化视频源失败:', error)
          }
        },

        clearRestrictedSources: () => {
          set(state => {
            state.videoAPIs = state.videoAPIs.filter(
              source => !source.id.startsWith('nsfw_env_') && !source.isNsfw,
            )
          })
        },

        importVideoAPIs: (apis: VideoSource[]) => {
          set(state => {
            const store = toSourceStore(state)
            // 为没有ID的源生成UUID
            const apisWithIds = apis.map(api => ({
              ...api,
              id: api.id || uuidv4(),
            }))
            const { store: newStore } = importSources(store, apisWithIds, {
              defaultTimeout: useSettingStore.getState().network.defaultTimeout,
              defaultRetry: useSettingStore.getState().network.defaultRetry,
              skipInvalid: true,
            })
            state.videoAPIs = fromSourceStore(newStore)
          })
        },

        getSelectedAPIs: () => {
          const store = toSourceStore(get())
          return getEnabledSources(store)
        },

        resetVideoSources: async () => {
          set(state => {
            state.videoAPIs = []
            state.lastEnvSourcesCheckedDate = null
            state.adFilteringEnabled = INITIAL_CONFIG?.adFilteringEnabled ?? true
          })
          await get().initializeEnvSources(true)
        },

        replaceSubscriptionSources: (subscriptionId: string, sources: VideoSource[]) => {
          set(state => {
            const prefix = `sub:${subscriptionId}:`
            // 记录旧源的 isEnabled 状态（按 name+url 匹配，因为 index 可能变化）
            const oldEnabledMap = new Map<string, boolean>()
            state.videoAPIs
              .filter(s => s.id.startsWith(prefix))
              .forEach(s => {
                oldEnabledMap.set(`${s.name}||${s.url}`, s.isEnabled)
              })

            // 移除旧的订阅源
            const nonSubscriptionSources = state.videoAPIs.filter(s => !s.id.startsWith(prefix))

            // 对新源应用之前的 isEnabled 设置
            const newSources = sources.map(s => {
              const key = `${s.name}||${s.url}`
              const prevEnabled = oldEnabledMap.get(key)
              return {
                ...s,
                isEnabled: prevEnabled !== undefined ? prevEnabled : s.isEnabled,
              }
            })

            // 手动源在前，订阅源追加到末尾
            state.videoAPIs = [...nonSubscriptionSources, ...newSources]
          })
        },

        removeSubscriptionSources: (subscriptionId: string) => {
          set(state => {
            const prefix = `sub:${subscriptionId}:`
            state.videoAPIs = state.videoAPIs.filter(s => !s.id.startsWith(prefix))
          })
        },

        reorderVideoAPIs: (orderedIds: string[]) => {
          set(state => {
            const idIndexMap = new Map(orderedIds.map((id, index) => [id, index]))
            state.videoAPIs = [...state.videoAPIs].sort((a, b) => {
              const indexA = idIndexMap.get(a.id)
              const indexB = idIndexMap.get(b.id)
              if (indexA !== undefined && indexB !== undefined) return indexA - indexB
              if (indexA !== undefined) return -1
              if (indexB !== undefined) return 1
              return 0
            })
          })
        },
      })),
      {
        name: 'xkatv-api-store',
        version: 7,
        migrate: (persistedState: unknown, version: number) => {
          const state = persistedState as Partial<ApiState>

          if (version < 4) {
            state.videoAPIs = []
          }

          if (version < 5) {
            state.videoAPIs =
              state.videoAPIs?.map(api => ({
                ...api,
                timeout: DEFAULT_SETTINGS.network.defaultTimeout,
                retry: DEFAULT_SETTINGS.network.defaultRetry,
                updatedAt: new Date(),
              })) || []
          }

          if (version < 7) {
            state.videoAPIs =
              state.videoAPIs?.map(api => {
                const isSub = api.id.startsWith('sub:')
                const isManualUuid =
                  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
                    api.id,
                  )
                return {
                  ...api,
                  isEnv: !isSub && !isManualUuid,
                }
              }) || []
          }

          return state
        },
      },
    ),
    {
      name: 'ApiStore', // DevTools 中显示的名称
    },
  ),
)
