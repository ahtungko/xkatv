import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { PROJECT } from '@/shared/config/project'

export interface VersionLink {
  label: string
  href: string
}

export interface VersionUpdate {
  version: string
  title: string
  date: string
  features: string[]
  fixes?: string[]
  breaking?: string[]
  links?: VersionLink[]
}

interface VersionState {
  // 当前版本
  currentVersion: string
  // 最后查看的版本
  lastViewedVersion: string
  // 是否显示更新弹窗
  showUpdateModal: boolean
  // 更新历史
  updateHistory: VersionUpdate[]
}

interface VersionActions {
  // 设置当前版本
  setCurrentVersion: (version: string) => void
  // 标记版本已查看
  markVersionAsViewed: (version: string) => void
  // 显示/隐藏更新弹窗
  setShowUpdateModal: (show: boolean) => void
  // 检查是否有新版本
  hasNewVersion: () => boolean
  // 获取最新的更新信息
  getLatestUpdate: () => VersionUpdate | null
}

type VersionStore = VersionState & VersionActions

// 格式化日期
const formatDate = (dateStr: string) => {
  const date = new Date(dateStr)
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }
  return date.toLocaleDateString('zh-CN', options)
}

// 与当前构建一起打包，不在浏览器请求 GitHub 或重复维护版本说明。
const isFix = (subject: string) => /^fix(?:\([^)]*\))?!?:/i.test(subject)
const summary = (subject: string) => subject.replace(/^[a-z]+(?:\([^)]*\))?!?:\s*/i, '')
const VERSION_UPDATES: VersionUpdate[] = [
  {
    version: PROJECT.version,
    title: PROJECT.changes[0] ? summary(PROJECT.changes[0].subject) : PROJECT.name + ' 构建信息',
    date: formatDate(PROJECT.updatedAt || PROJECT.builtAt),
    features: PROJECT.changes
      .filter(change => !isFix(change.subject))
      .map(change => summary(change.subject)),
    fixes: PROJECT.changes
      .filter(change => isFix(change.subject))
      .map(change => summary(change.subject)),
    links: [
      ...(PROJECT.commit && PROJECT.repository
        ? [{ label: '当前提交', href: PROJECT.repository + '/commit/' + PROJECT.commit }]
        : []),
      ...(PROJECT.repository ? [{ label: '项目仓库', href: PROJECT.repository }] : []),
      ...(PROJECT.issues ? [{ label: '问题反馈', href: PROJECT.issues }] : []),
    ],
  },
]

// 获取最新版本号
const LATEST_VERSION = VERSION_UPDATES[0]?.version || '1.0.0'

export const useVersionStore = create<VersionStore>()(
  devtools(
    persist(
      immer<VersionStore>((set, get) => ({
        // 初始状态
        currentVersion: LATEST_VERSION,
        lastViewedVersion: '1.0.0',
        showUpdateModal: false,
        updateHistory: VERSION_UPDATES,

        // Actions
        setCurrentVersion: (version: string) => {
          set(state => {
            state.currentVersion = version
          })
        },

        markVersionAsViewed: (version: string) => {
          set(state => {
            state.lastViewedVersion = version
            state.showUpdateModal = false
          })
        },

        setShowUpdateModal: (show: boolean) => {
          set(state => {
            state.showUpdateModal = show
          })
        },

        hasNewVersion: () => {
          const state = get()
          return state.currentVersion !== state.lastViewedVersion
        },

        getLatestUpdate: () => {
          const state = get()
          // 找到当前版本对应的更新信息
          return state.updateHistory.find(update => update.version === state.currentVersion) || null
        },
      })),
      {
        name: 'xkatv-version-store',
        version: 1,
        partialize: state => ({
          lastViewedVersion: state.lastViewedVersion,
        }),
      },
    ),
    {
      name: 'VersionStore',
    },
  ),
)
