import { normalizeVodId, type DetailResult } from '@xkatv/cms-core'
import type { FavoriteItem } from '../types/favorites'
import type { ViewingHistoryItem } from '@/shared/types/video'
import { buildCmsPlayPath, buildTmdbPlayPath } from '@/shared/lib/routes'

export interface TrackedEpisode {
  index: number
  number: number
}

export interface SeriesUpdate {
  configuration?: string
  resourceSignature?: string
  bindingKey?: string
  checkedAt?: number
  attemptedAt: number
  sourceCode?: string
  sourceName?: string
  vodId?: string
  episodes?: TrackedEpisode[]
  error?: string
  notification?: { knownEpisodes: number[]; unreadEpisodes: number[] }
}

/** 仅显示当前播放列表中仍可用的新集提醒。 */
export function unreadEpisodeNumbers(update: SeriesUpdate | undefined): number[] {
  const available = new Set(update?.episodes?.map(episode => episode.number) ?? [])
  return (update?.notification?.unreadEpisodes ?? []).filter(number => available.has(number))
}

export function mergeSeriesUpdate(
  previous: SeriesUpdate | undefined,
  result: SeriesUpdate,
): SeriesUpdate {
  // 用提交时的最新状态保留已读操作，避免请求开始时的旧快照恢复提醒。
  if (result.error)
    return {
      ...((previous?.bindingKey ?? 'auto') === (result.bindingKey ?? 'auto') ? previous : {}),
      attemptedAt: result.attemptedAt,
      error: result.error,
      bindingKey: result.bindingKey,
    }
  if (!result.checkedAt || !result.episodes) return result
  const current = [...new Set(result.episodes.map(episode => episode.number))]
  const sameResource =
    !!previous?.checkedAt &&
    !!result.sourceCode &&
    !!result.vodId &&
    previous.sourceCode === result.sourceCode &&
    previous.vodId === result.vodId &&
    (previous.bindingKey ?? 'auto') === (result.bindingKey ?? 'auto') &&
    previous.resourceSignature === result.resourceSignature
  if (!sameResource)
    return { ...result, notification: { knownEpisodes: current, unreadEpisodes: [] } }
  const known = new Set(
    previous.notification?.knownEpisodes ?? previous.episodes?.map(episode => episode.number) ?? [],
  )
  const unread = new Set(previous.notification?.unreadEpisodes ?? [])
  for (const number of current) {
    if (!known.has(number)) unread.add(number)
    known.add(number)
  }
  return {
    ...result,
    notification: {
      knownEpisodes: [...known].sort((a, b) => a - b),
      unreadEpisodes: [...unread].sort((a, b) => a - b),
    },
  }
}

export function canTrackFavorite(item: FavoriteItem): boolean {
  // CMS 类型并不统一，允许用户主动追踪剧集、动漫或综艺。
  return item.sourceType === 'cms' || item.media.mediaType === 'tv'
}

export function trackingSeasonKey(item: FavoriteItem): string {
  return item.sourceType === 'tmdb' ? String(item.tracking?.seasonNumber ?? 1) : 'cms'
}

export function trackingKey(item: FavoriteItem): string {
  return `${item.id}::${trackingSeasonKey(item)}`
}

export function trackingBinding(item: FavoriteItem) {
  return item.tracking?.bindings?.[trackingSeasonKey(item)]
}

export function trackingBindingKey(item: FavoriteItem): string {
  const binding = trackingBinding(item)
  return binding
    ? JSON.stringify([binding.sourceCode, normalizeVodId(binding.vodId) ?? binding.vodId])
    : 'auto'
}

export function matchingTrackingUpdate(item: FavoriteItem, update: SeriesUpdate | undefined) {
  return (update?.bindingKey ?? 'auto') === trackingBindingKey(item) ? update : undefined
}

export function episodeNumber(name: string | undefined): number | null {
  if (!name || /预告|花絮|特辑|特典|彩蛋|解说|片段|trailer|special|preview/i.test(name)) return null
  const match =
    name.trim().match(/^(?:第\s*)?0*(\d+)\s*(?:集|话|話|期|$)/i) ||
    name.trim().match(/^(?:EP?|Episode)\s*0*(\d+)(?:\b|$)/i)
  const number = match ? Number(match[1]) : 0
  return number > 0 && number < 10000 ? number : null
}

/** 只统计详情中带播放地址的正片，不使用 TMDB 计划集数或“更新至”文案。 */
export function playableEpisodes(detail: DetailResult): TrackedEpisode[] {
  const episodes: TrackedEpisode[] = []
  const seen = new Set<number>()
  detail.episodes.forEach((url, index) => {
    if (!/^https?:\/\//i.test(url)) return
    const name = detail.videoInfo?.episodes_names?.[index]
    if (name && /预告|花絮|特辑|特典|彩蛋|解说|片段|trailer|special|preview/i.test(name)) return
    const number = episodeNumber(name) ?? episodes.length + 1
    if (seen.has(number)) return
    seen.add(number)
    episodes.push({ index, number })
  })
  return episodes.sort((a, b) => a.number - b.number)
}

export function favoriteHistory(item: FavoriteItem, history: ViewingHistoryItem[]) {
  return history.filter(record => {
    if (item.sourceType === 'cms') {
      const binding = trackingBinding(item)
      return (
        (record.sourceCode === item.media.sourceCode && record.vodId === item.media.vodId) ||
        (!!binding && record.sourceCode === binding.sourceCode && record.vodId === binding.vodId)
      )
    }
    return (
      record.recordType === 'tmdb' &&
      record.tmdbMediaType === 'tv' &&
      record.tmdbId === item.media.id &&
      (record.tmdbSeasonNumber ?? 1) === (item.tracking?.seasonNumber ?? 1)
    )
  })
}

export function trackingProgress(
  item: FavoriteItem,
  update: SeriesUpdate | undefined,
  history: ViewingHistoryItem[],
) {
  const episodes = update?.episodes ?? []
  const calibration = item.tracking?.progress?.[trackingSeasonKey(item)]
  let completedThrough = calibration?.completedEpisode ?? 0
  let currentEpisode = completedThrough
  for (const record of favoriteHistory(item, history)) {
    if (calibration && record.timestamp <= calibration.calibratedAt) continue
    if (record.playbackPosition <= 0 || record.duration <= 0) continue
    const samePlaylist = record.sourceCode === update?.sourceCode && record.vodId === update?.vodId
    const number =
      episodeNumber(record.episodeName) ??
      (samePlaylist ? episodes.find(ep => ep.index === record.episodeIndex)?.number : undefined)
    if (!number) continue
    currentEpisode = Math.max(currentEpisode, number)
    // 正在播放的一集仍计入待看，避免自动跳到下一集后提前消除提醒。
    const completed = record.playbackPosition / record.duration >= 0.9
    completedThrough = Math.max(completedThrough, completed ? number : number - 1)
  }
  const pending = episodes.filter(ep => ep.number > completedThrough)
  return {
    currentEpisode,
    completedThrough,
    calibrated: !!calibration,
    pendingCount: pending.length,
    nextEpisode: pending[0],
    latestEpisode: episodes[episodes.length - 1]?.number ?? 0,
  }
}

export function trackingPlayPath(
  item: FavoriteItem,
  update: SeriesUpdate,
  index: number,
): string | null {
  if (!update.sourceCode || !update.vodId) return null
  return item.sourceType === 'cms'
    ? buildCmsPlayPath(update.sourceCode, update.vodId, index)
    : buildTmdbPlayPath('tv', item.media.id, {
        sourceCode: update.sourceCode,
        vodId: update.vodId,
        episodeIndex: index,
        seasonNumber: item.tracking?.seasonNumber ?? 1,
      })
}
