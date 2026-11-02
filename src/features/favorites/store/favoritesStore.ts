import { create } from 'zustand'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'
import { devtools, persist, createJSONStorage } from 'zustand/middleware'
import { safeLocalStorage } from '@/shared/lib/safeStorage'
import { immer } from 'zustand/middleware/immer'
import { normalizeVodId } from '@xkatv/cms-core'
import type { FavoriteItem, FavoriteList, FavoriteFilterOptions, FavoriteStats } from '../types/favorites'
import { FavoriteWatchStatus } from '../types/favorites'
import type { TmdbFavoriteItem, CmsFavoriteItem, SeriesTracking, TrackingBinding } from '../types/favorites'
import type { TmdbMediaItem } from '@/shared/types/tmdb'
import type { VideoItem } from '@/shared/types/video'
import { canTrackFavorite, trackingSeasonKey } from '../lib/seriesTracking'

interface FavoritesState {
  /** 收藏列表 */
  favorites: FavoriteList
  /** 当前筛选器 */
  filterOptions: FavoriteFilterOptions
  /** 筛选后的列表 */
  filteredFavorites: FavoriteList
  /** 已选中的收藏项 ID 集合 */
  selectedIds: Set<string>
}

interface FavoritesActions {
  /** 设置追更开关与季数 */
  setTracking: (id: string, tracking: Pick<SeriesTracking, 'enabled' | 'seasonNumber'>) => void
  /** null 恢复当前季的自动进度，0 表示从头开始。 */
  setTrackingProgress: (id: string, completedEpisode: number | null, expectedSeasonKey: string) => boolean
  /** null 恢复默认选源；切换前保存当前季已看集数。 */
  setTrackingBinding: (
    id: string,
    binding: TrackingBinding | null,
    expectedSeasonKey: string,
    completedEpisode: number,
  ) => boolean
  // === 基础 CRUD ===

  /** 添加 TMDB 媒体到收藏 */
  addTmdbFavorite: (media: TmdbMediaItem, watchStatus?: FavoriteWatchStatus) => void

  /** 添加 CMS 视频到收藏 */
  addCmsFavorite: (video: VideoItem, watchStatus?: FavoriteWatchStatus) => void

  /** 批量添加收藏 (去重) */
  addFavorites: (items: (TmdbMediaItem | VideoItem)[]) => void

  /** 删除收藏项 */
  removeFavorite: (id: string) => void

  /** 批量删除收藏项 */
  removeFavorites: (ids: string[]) => void

  /** 清空所有收藏 */
  clearFavorites: () => void

  // === 状态管理 ===

  /** 更新观看状态 */
  updateWatchStatus: (id: string, status: FavoriteWatchStatus) => void

  /** 批量更新观看状态 */
  updateWatchStatusBulk: (ids: string[], status: FavoriteWatchStatus) => void

  /** 设置评分 */
  setRating: (id: string, rating: number) => void

  /** 设置备注 */
  setNotes: (id: string, notes: string) => void

  /** 添加标签 */
  addTag: (id: string, tag: string) => void

  /** 移除标签 */
  removeTag: (id: string, tag: string) => void

  // === 查询 ===

  /** 检查是否已收藏 (TMDB) */
  isTmdbFavorited: (tmdbId: number, mediaType: 'movie' | 'tv') => boolean

  /** 检查是否已收藏 (CMS) */
  isCmsFavorited: (vodId: string, sourceCode: string) => boolean

  /** 获取收藏项 (TMDB) */
  getTmdbFavorite: (tmdbId: number, mediaType: 'movie' | 'tv') => TmdbFavoriteItem | undefined

  /** 获取收藏项 (CMS) */
  getCmsFavorite: (vodId: string, sourceCode: string) => CmsFavoriteItem | undefined

  /** 切换收藏状态 (有则删除，无则添加) */
  toggleTmdbFavorite: (media: TmdbMediaItem) => void

  /** 切换收藏状态 (CMS) */
  toggleCmsFavorite: (video: VideoItem) => void

  // === 筛选 ===

  /** 设置筛选器 */
  setFilter: (options: Partial<FavoriteFilterOptions>) => void

  /** 清除筛选器 */
  clearFilter: () => void

  /** 应用筛选 (内部方法) */
  _applyFilters: () => void

  // === 批量操作 ===

  /** 全选当前筛选后的收藏项 */
  selectAllFiltered: () => void

  /** 取消全选 */
  deselectAll: () => void

  /** 设置选中 ID 集合 */
  setSelectedIds: (ids: Set<string>) => void

  // === 统计 ===

  /** 获取统计信息 */
  getStats: () => FavoriteStats

  /** 获取所有标签 (去重) */
  getAllTags: () => string[]
}

type FavoritesStore = FavoritesState & FavoritesActions

/**
 * 生成 TMDB 收藏项的唯一标识
 */
function generateTmdbFavoriteId(tmdbId: number, mediaType: 'movie' | 'tv'): string {
  return `tmdb_${mediaType}_${tmdbId}`
}

/**
 * 生成 CMS 收藏项的唯一标识
 */
function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }

  return btoa(binary)
}

function generateCmsFavoriteId(vodId: string, sourceCode: string): string {
  const combined = `${sourceCode}::${vodId}`
  return `cms_${utf8ToBase64(combined)}`
}

/**
 * 从 TmdbMediaItem 创建轻量化媒体快照
 */
function createTmdbMediaSnapshot(media: TmdbMediaItem | TmdbFavoriteItem['media']): TmdbFavoriteItem['media'] {
  return {
    id: media.id,
    mediaType: media.mediaType,
    title: media.title,
    originalTitle: media.originalTitle ?? '',
    posterPath: media.posterPath ?? null,
    backdropPath: media.backdropPath ?? null,
    releaseDate: media.releaseDate ?? '',
    voteAverage: media.voteAverage ?? 0,
  }
}

/**
 * 从 VideoItem 创建轻量化媒体快照
 */
function createCmsMediaSnapshot(video: VideoItem | CmsFavoriteItem['media']): CmsFavoriteItem['media'] {
  if ('vod_id' in video) {
    return {
      vodId: video.vod_id,
      vodName: video.vod_name,
      vodPic: video.vod_pic,
      typeName: video.type_name,
      vodYear: video.vod_year,
      vodArea: video.vod_area,
      sourceCode: video.source_code || '',
      sourceName: video.source_name || '',
    }
  }
  return {
    vodId: video.vodId,
    vodName: video.vodName,
    vodPic: video.vodPic,
    typeName: video.typeName,
    vodYear: video.vodYear,
    vodArea: video.vodArea,
    sourceCode: video.sourceCode || '',
    sourceName: video.sourceName || '',
  }
}

/**
 * 深度精简收藏项，剔除任何可能导致 LocalStorage 配额爆满的冗余播放列表与剧集详情
 */
function sanitizeFavoriteItem(item: FavoriteItem): FavoriteItem {
  if (item.sourceType === 'tmdb') {
    return {
      id: item.id,
      sourceType: 'tmdb',
      addedAt: item.addedAt,
      updatedAt: item.updatedAt,
      watchStatus: item.watchStatus,
      rating: item.rating,
      notes: item.notes,
      tags: Array.isArray(item.tags) ? item.tags : [],
      tracking: item.tracking
        ? {
            enabled: item.tracking.enabled,
            seasonNumber: item.tracking.seasonNumber,
            bindings: item.tracking.bindings,
            progress: item.tracking.progress,
          }
        : undefined,
      media: createTmdbMediaSnapshot(item.media),
    }
  }

  return {
    id: item.id,
    sourceType: 'cms',
    addedAt: item.addedAt,
    updatedAt: item.updatedAt,
    watchStatus: item.watchStatus,
    rating: item.rating,
    notes: item.notes,
    tags: Array.isArray(item.tags) ? item.tags : [],
    tracking: item.tracking
      ? {
          enabled: item.tracking.enabled,
          seasonNumber: item.tracking.seasonNumber,
          bindings: item.tracking.bindings,
          progress: item.tracking.progress,
        }
      : undefined,
    media: createCmsMediaSnapshot(item.media),
  }
}

/** 获取收藏项标题（用于名称排序） */
function getFavoriteTitle(item: FavoriteItem): string {
  return item.sourceType === 'tmdb' ? item.media.title : item.media.vodName
}

/** 获取收藏项评分（排序值） */
function getFavoriteRatingValue(item: FavoriteItem): number {
  if (item.rating !== undefined) return item.rating
  if (item.sourceType === 'tmdb') return item.media.voteAverage ?? 0
  return 0
}

/** 获取收藏项上映日期时间戳（排序值） */
function getFavoriteReleaseDateValue(item: FavoriteItem): number {
  if (item.sourceType !== 'tmdb' || !item.media.releaseDate) return 0
  const timestamp = new Date(item.media.releaseDate).getTime()
  return Number.isNaN(timestamp) ? 0 : timestamp
}

export const useFavoritesStore = create<FavoritesStore>()(
  devtools(
    persist(
      immer<FavoritesStore>((set, get) => ({
        // 初始状态
        favorites: [],
        filterOptions: {
          sourceType: 'all',
          watchStatus: 'all',
          sortBy: 'addedAt',
          sortOrder: 'desc',
        },
        filteredFavorites: [],
        selectedIds: new Set<string>(),

        setTracking: (id, tracking) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          if (
            tracking.seasonNumber !== undefined &&
            (!Number.isSafeInteger(tracking.seasonNumber) || tracking.seasonNumber < 1)
          ) return
          set(state => {
            const item = state.favorites.find(favorite => favorite.id === id)
            if (!item || (item.sourceType === 'tmdb' && item.media.mediaType !== 'tv')) return
            item.tracking = {
              ...item.tracking,
              enabled: tracking.enabled,
              seasonNumber: tracking.seasonNumber ?? item.tracking?.seasonNumber,
            }
            item.updatedAt = Date.now()
          })
          get()._applyFilters()
        },

        setTrackingProgress: (id, completedEpisode, expectedSeasonKey) => {
          if (usePrivateModeStore.getState().isPrivateMode) return false
          if (
            completedEpisode !== null &&
            (!Number.isSafeInteger(completedEpisode) || completedEpisode < 0)
          ) return false
          let saved = false
          set(state => {
            const item = state.favorites.find(favorite => favorite.id === id)
            if (
              !item?.tracking?.enabled || !canTrackFavorite(item) ||
              trackingSeasonKey(item) !== expectedSeasonKey
            ) return
            if (completedEpisode === null) {
              if (item.tracking.progress) {
                delete item.tracking.progress[expectedSeasonKey]
                if (!Object.keys(item.tracking.progress).length) delete item.tracking.progress
              }
            } else {
              item.tracking.progress ??= {}
              item.tracking.progress[expectedSeasonKey] = { completedEpisode, calibratedAt: Date.now() }
            }
            item.updatedAt = Date.now()
            saved = true
          })
          if (saved) get()._applyFilters()
          return saved
        },

        setTrackingBinding: (id, binding, expectedSeasonKey, completedEpisode) => {
          if (usePrivateModeStore.getState().isPrivateMode) return false
          const vodId = binding ? normalizeVodId(binding.vodId) : null
          if (
            !Number.isSafeInteger(completedEpisode) ||
            completedEpisode < 0 ||
            (binding &&
              (!binding.sourceCode.trim() ||
                !binding.sourceName.trim() ||
                !binding.title.trim() ||
                vodId === null))
          ) return false
          let saved = false
          set(state => {
            const item = state.favorites.find(favorite => favorite.id === id)
            if (
              !item?.tracking?.enabled ||
              !canTrackFavorite(item) ||
              trackingSeasonKey(item) !== expectedSeasonKey
            ) return
            if (binding && vodId !== null) {
              item.tracking.bindings ??= {}
              item.tracking.bindings[expectedSeasonKey] = {
                sourceCode: binding.sourceCode,
                sourceName: binding.sourceName,
                vodId,
                title: binding.title,
              }
            } else if (item.tracking.bindings) {
              delete item.tracking.bindings[expectedSeasonKey]
              if (!Object.keys(item.tracking.bindings).length) delete item.tracking.bindings
            }
            // 在切换资源前保存已看集数，后续只合并新播放记录。
            item.tracking.progress ??= {}
            item.tracking.progress[expectedSeasonKey] = { completedEpisode, calibratedAt: Date.now() }
            item.updatedAt = Date.now()
            saved = true
          })
          if (saved) get()._applyFilters()
          return saved
        },

        // === 基础 CRUD 实现 ===

        addTmdbFavorite: (media: TmdbMediaItem, watchStatus?: FavoriteWatchStatus) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            const existingId = generateTmdbFavoriteId(media.id, media.mediaType)
            const existingIndex = state.favorites.findIndex(f => f.id === existingId)

            const newFavorite: TmdbFavoriteItem = {
              id: existingId,
              addedAt: Date.now(),
              updatedAt: Date.now(),
              sourceType: 'tmdb',
              watchStatus: watchStatus ?? FavoriteWatchStatus.NOT_WATCHED,
              tags: [],
              media: createTmdbMediaSnapshot(media),
            }

            if (existingIndex !== -1) {
              // 更新现有收藏（保留用户数据）
              const existing = state.favorites[existingIndex] as TmdbFavoriteItem
              state.favorites[existingIndex] = {
                ...existing,
                updatedAt: Date.now(),
                media: createTmdbMediaSnapshot(media), // 更新媒体数据
              }
            } else {
              // 添加到列表开头
              state.favorites.unshift(newFavorite)
            }
          })
          // 在 set 外部调用 _applyFilters
          get()._applyFilters()
        },

        addCmsFavorite: (video: VideoItem, watchStatus?: FavoriteWatchStatus) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            const sourceCode = video.source_code || ''
            const existingId = generateCmsFavoriteId(video.vod_id, sourceCode)
            const existingIndex = state.favorites.findIndex(f => f.id === existingId)

            const newFavorite: CmsFavoriteItem = {
              id: existingId,
              addedAt: Date.now(),
              updatedAt: Date.now(),
              sourceType: 'cms',
              watchStatus: watchStatus ?? FavoriteWatchStatus.NOT_WATCHED,
              tags: [],
              media: createCmsMediaSnapshot(video),
            }

            if (existingIndex !== -1) {
              // 更新现有收藏
              const existing = state.favorites[existingIndex] as CmsFavoriteItem
              state.favorites[existingIndex] = {
                ...existing,
                updatedAt: Date.now(),
                media: createCmsMediaSnapshot(video),
              }
            } else {
              state.favorites.unshift(newFavorite)
            }
          })
          // 在 set 外部调用 _applyFilters
          get()._applyFilters()
        },

        addFavorites: (items: (TmdbMediaItem | VideoItem)[]) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            items.forEach(item => {
              if ('mediaType' in item) {
                // TMDB item
                const existingId = generateTmdbFavoriteId(item.id, item.mediaType)
                if (!state.favorites.find(f => f.id === existingId)) {
                  const newFavorite: TmdbFavoriteItem = {
                    id: existingId,
                    addedAt: Date.now(),
                    updatedAt: Date.now(),
                    sourceType: 'tmdb',
                    watchStatus: FavoriteWatchStatus.NOT_WATCHED,
                    tags: [],
                    media: createTmdbMediaSnapshot(item),
                  }
                  state.favorites.push(newFavorite)
                }
              } else {
                // CMS item
                const sourceCode = item.source_code || ''
                const existingId = generateCmsFavoriteId(item.vod_id, sourceCode)
                if (!state.favorites.find(f => f.id === existingId)) {
                  const newFavorite: CmsFavoriteItem = {
                    id: existingId,
                    addedAt: Date.now(),
                    updatedAt: Date.now(),
                    sourceType: 'cms',
                    watchStatus: FavoriteWatchStatus.NOT_WATCHED,
                    tags: [],
                    media: createCmsMediaSnapshot(item),
                  }
                  state.favorites.push(newFavorite)
                }
              }
            })

            // 按 addedAt 降序排序
            state.favorites.sort((a, b) => b.addedAt - a.addedAt)
          })
          // 在 set 外部调用 _applyFilters
          get()._applyFilters()
        },

        removeFavorite: (id: string) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            state.favorites = state.favorites.filter(f => f.id !== id)
          })
          get()._applyFilters()
        },

        removeFavorites: (ids: string[]) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            const idSet = new Set(ids)
            state.favorites = state.favorites.filter(f => !idSet.has(f.id))
          })
          get()._applyFilters()
        },

        clearFavorites: () => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            state.favorites = []
          })
          get()._applyFilters()
        },

        // === 状态管理实现 ===

        updateWatchStatus: (id: string, status: FavoriteWatchStatus) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            const item = state.favorites.find(f => f.id === id)
            if (item) {
              item.watchStatus = status
              item.updatedAt = Date.now()
            }
          })
          get()._applyFilters()
        },

        updateWatchStatusBulk: (ids: string[], status: FavoriteWatchStatus) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            const idSet = new Set(ids)
            state.favorites.forEach(f => {
              if (idSet.has(f.id)) {
                f.watchStatus = status
                f.updatedAt = Date.now()
              }
            })
          })
          get()._applyFilters()
        },

        setRating: (id: string, rating: number) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            const item = state.favorites.find(f => f.id === id)
            if (item) {
              item.rating = Math.max(1, Math.min(5, rating))
              item.updatedAt = Date.now()
            }
          })
          get()._applyFilters()
        },

        setNotes: (id: string, notes: string) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            const item = state.favorites.find(f => f.id === id)
            if (item) {
              item.notes = notes
              item.updatedAt = Date.now()
            }
          })
          get()._applyFilters()
        },

        addTag: (id: string, tag: string) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            const item = state.favorites.find(f => f.id === id)
            if (item && !item.tags.includes(tag)) {
              item.tags.push(tag)
              item.updatedAt = Date.now()
            }
          })
          get()._applyFilters()
        },

        removeTag: (id: string, tag: string) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          set(state => {
            const item = state.favorites.find(f => f.id === id)
            if (item) {
              item.tags = item.tags.filter(t => t !== tag)
              item.updatedAt = Date.now()
            }
          })
          get()._applyFilters()
        },

        // === 查询实现 ===

        isTmdbFavorited: (tmdbId: number, mediaType: 'movie' | 'tv') => {
          const id = generateTmdbFavoriteId(tmdbId, mediaType)
          return get().favorites.some(f => f.id === id)
        },

        isCmsFavorited: (vodId: string, sourceCode: string) => {
          const id = generateCmsFavoriteId(vodId, sourceCode)
          return get().favorites.some(f => f.id === id)
        },

        getTmdbFavorite: (tmdbId: number, mediaType: 'movie' | 'tv') => {
          const id = generateTmdbFavoriteId(tmdbId, mediaType)
          return get().favorites.find(f => f.id === id) as TmdbFavoriteItem
        },

        getCmsFavorite: (vodId: string, sourceCode: string) => {
          const id = generateCmsFavoriteId(vodId, sourceCode)
          return get().favorites.find(f => f.id === id) as CmsFavoriteItem
        },

        toggleTmdbFavorite: (media: TmdbMediaItem) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          const existingId = generateTmdbFavoriteId(media.id, media.mediaType)
          const exists = get().isTmdbFavorited(media.id, media.mediaType)

          if (exists) {
            get().removeFavorite(existingId)
          } else {
            get().addTmdbFavorite(media)
          }
        },

        toggleCmsFavorite: (video: VideoItem) => {
          if (usePrivateModeStore.getState().isPrivateMode) return
          const sourceCode = video.source_code || ''
          const exists = get().isCmsFavorited(video.vod_id, sourceCode)

          if (exists) {
            const id = generateCmsFavoriteId(video.vod_id, sourceCode)
            get().removeFavorite(id)
          } else {
            get().addCmsFavorite(video)
          }
        },

        // === 筛选实现 ===

        setFilter: (options: Partial<FavoriteFilterOptions>) => {
          set(state => {
            state.filterOptions = { ...state.filterOptions, ...options }
          })
          get()._applyFilters()
        },

        clearFilter: () => {
          set(state => {
            state.filterOptions = {
              sourceType: 'all',
              watchStatus: 'all',
              sortBy: 'addedAt',
              sortOrder: 'desc',
            }
          })
          get()._applyFilters()
        },

        _applyFilters: () => {
          // 在 immer 的 set 中调用，直接修改 state
          const state = get()
          let filtered = [...state.favorites]
          const { sourceType, watchStatus, tags, minRating, sortBy, sortOrder } =
            state.filterOptions

          // 来源筛选
          if (sourceType && sourceType !== 'all') {
            filtered = filtered.filter(f => f.sourceType === sourceType)
          }

          // 状态筛选
          if (watchStatus && watchStatus !== 'all') {
            filtered = filtered.filter(f => f.watchStatus === watchStatus)
          }

          // 标签筛选 (OR 逻辑)
          if (tags && tags.length > 0) {
            filtered = filtered.filter(f => tags.some(tag => f.tags.includes(tag)))
          }

          // 评分筛选
          if (minRating !== undefined && minRating > 0) {
            filtered = filtered.filter(f => f.rating !== undefined && f.rating >= minRating)
          }

          // 排序
          if (sortBy) {
            filtered.sort((a, b) => {
              // title 排序单独处理，因为返回的是字符串
              if (sortBy === 'title') {
                const titleA = getFavoriteTitle(a)
                const titleB = getFavoriteTitle(b)
                return (sortOrder === 'asc' ? 1 : -1) * titleA.localeCompare(titleB, 'zh-CN')
              }

              // 其他排序都是数字比较
              let valA: number
              let valB: number

              switch (sortBy) {
                case 'addedAt':
                  valA = a.addedAt
                  valB = b.addedAt
                  break
                case 'updatedAt':
                  valA = a.updatedAt
                  valB = b.updatedAt
                  break
                case 'rating':
                  // 优先用户评分，未评分时回退到 TMDB 站点评分
                  valA = getFavoriteRatingValue(a)
                  valB = getFavoriteRatingValue(b)
                  break
                case 'releaseDate':
                  valA = getFavoriteReleaseDateValue(a)
                  valB = getFavoriteReleaseDateValue(b)
                  break
                default:
                  valA = a.addedAt
                  valB = b.addedAt
              }

              if (sortOrder === 'asc') {
                return valA > valB ? 1 : valA < valB ? -1 : 0
              } else {
                return valA < valB ? 1 : valA > valB ? -1 : 0
              }
            })
          }

          // 使用 set 更新 filteredFavorites
          set({ filteredFavorites: filtered })
        },

        // === 统计实现 ===

        getStats: () => {
          const favorites = get().favorites
          const stats: FavoriteStats = {
            total: favorites.length,
            tmdbCount: 0,
            cmsCount: 0,
            notWatchedCount: 0,
            watchingCount: 0,
            completedCount: 0,
          }

          favorites.forEach(f => {
            if (f.sourceType === 'tmdb') stats.tmdbCount++
            else stats.cmsCount++

            switch (f.watchStatus) {
              case FavoriteWatchStatus.NOT_WATCHED:
                stats.notWatchedCount++
                break
              case FavoriteWatchStatus.WATCHING:
                stats.watchingCount++
                break
              case FavoriteWatchStatus.COMPLETED:
                stats.completedCount++
                break
            }
          })

          return stats
        },

        getAllTags: () => {
          const favorites = get().favorites
          const tagSet = new Set<string>()
          favorites.forEach(f => {
            f.tags.forEach(tag => tagSet.add(tag))
          })
          return Array.from(tagSet).sort()
        },

        // === 批量操作实现 ===

        /** 全选当前筛选后的收藏项 */
        selectAllFiltered: () => {
          set(state => {
            state.filteredFavorites.forEach(f => {
              // 只更新不在已选中集合中的项
              if (!state.selectedIds?.has(f.id)) {
                state.selectedIds?.add(f.id)
              }
            })
          })
        },

        /** 取消全选 */
        deselectAll: () => {
          set(state => {
            state.selectedIds?.clear()
          })
        },

        /** 设置选中 ID 集合 */
        setSelectedIds: (ids: Set<string>) => {
          set(state => {
            state.selectedIds = ids
          })
        },
      })),
      {
        name: 'xkatv-favorites-store',
        version: 2,
        storage: createJSONStorage(() => safeLocalStorage),
        partialize: state => ({
          favorites: (state.favorites || []).map(sanitizeFavoriteItem),
        }),
        migrate: persistedState => {
          const state = persistedState as Partial<FavoritesState> | undefined
          const raw = Array.isArray(state?.favorites) ? state.favorites : []
          return {
            favorites: raw.map(sanitizeFavoriteItem),
          }
        },
        onRehydrateStorage: () => state => {
          state?._applyFilters()
        },
      },
    ),
    {
      name: 'FavoritesStore',
    },
  ),
)
