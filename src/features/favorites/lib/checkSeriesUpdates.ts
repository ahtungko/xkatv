import { normalizeVodId, type CmsClient, type VideoSource } from '@xkatv/cms-core'
import type { FavoriteItem } from '../types/favorites'
import type { ViewingHistoryItem } from '@/shared/types/video'
import { buildPlaylistMatches } from '@/features/media/components/tmdb-detail/playlistMatcher'
import {
  favoriteHistory,
  playableEpisodes,
  trackingBinding,
  type SeriesUpdate,
} from './seriesTracking'

const normalizeTitle = (title: string) =>
  title
    .toLowerCase()
    .replace(/第\s*[\d一二三四五六七八九十两]+\s*[季部篇]|\b(?:season|s)\s*\d+\b/gi, '')
    .replace(/[\s\p{P}\p{S}]/gu, '')

/** 每次检查使用独立客户端，避免后台搜索事件串入用户的搜索页。 */
export async function checkSeriesUpdates(
  item: FavoriteItem,
  client: Pick<CmsClient, 'search' | 'getDetail'>,
  sources: VideoSource[],
  history: ViewingHistoryItem[],
  signal: AbortSignal,
): Promise<SeriesUpdate> {
  const read = async (source: VideoSource, rawVodId: string): Promise<SeriesUpdate> => {
    const vodId = normalizeVodId(rawVodId)
    if (vodId === null) throw new Error('无效的视频ID格式')
    signal.throwIfAborted()
    const detail = await client.getDetail(vodId, source)
    signal.throwIfAborted()
    if (!detail.success) throw new Error(detail.error || '视频源检查失败')
    const episodes = playableEpisodes(detail)
    if (!episodes.length) throw new Error('视频源暂未提供可播放的正片剧集')
    return {
      checkedAt: Date.now(),
      attemptedAt: Date.now(),
      sourceCode: source.id,
      sourceName: source.name,
      vodId,
      episodes,
    }
  }

  const binding = trackingBinding(item)
  if (binding) {
    const source = sources.find(source => source.id === binding.sourceCode)
    if (!source) throw new Error('绑定的视频源未启用，请启用该源、重新绑定或恢复默认选源')
    return read(source, binding.vodId)
  }
  if (item.sourceType === 'cms') {
    const source = sources.find(source => source.id === item.media.sourceCode)
    if (!source) throw new Error('收藏的视频源未启用，请到设置中启用后刷新')
    return read(source, item.media.vodId)
  }

  if (!sources.length) throw new Error('请先启用视频源，再检查剧集更新')
  // 优先沿用该季实际播放过的资源，避免相似标题或不同版本误匹配。
  const previous = favoriteHistory(item, history).sort((a, b) => b.timestamp - a.timestamp)
  for (const record of previous) {
    const source = sources.find(source => source.id === record.sourceCode)
    if (!source || !record.vodId) continue
    try {
      return await read(source, record.vodId)
    } catch {
      signal.throwIfAborted()
    }
    break
  }

  const seasonNumber = item.tracking?.seasonNumber ?? 1
  let best: SeriesUpdate | undefined
  let sourceFailed = false
  for (const source of sources) {
    signal.throwIfAborted()
    const result = await client.search(item.media.title, source)
    signal.throwIfAborted()
    if (!result.success) {
      sourceFailed = true
      continue
    }
    const { candidates } = buildPlaylistMatches({
      mediaType: 'tv',
      items: result.items,
      title: item.media.title,
      originalTitle: item.media.originalTitle,
      sources: [source],
      seasons: [],
    })
    const match = candidates.find(candidate => {
      const title = normalizeTitle(candidate.item.vod_name)
      const sameTitle = [item.media.title, item.media.originalTitle].some(
        value => value && normalizeTitle(value) === title,
      )
      const correctSeason = candidate.seasonHints.length
        ? candidate.seasonHints.includes(seasonNumber)
        : seasonNumber === 1
      const correctYear =
        seasonNumber !== 1 ||
        !candidate.item.vod_year ||
        !item.media.releaseDate ||
        candidate.item.vod_year === item.media.releaseDate.slice(0, 4)
      return (
        sameTitle &&
        correctSeason &&
        correctYear &&
        !/预告|花絮|解说|电影|trailer|movie/i.test(
          `${candidate.item.vod_name} ${candidate.item.type_name || ''}`,
        )
      )
    })
    if (!match) continue
    try {
      const update = await read(source, match.item.vod_id)
      if (!best || (update.episodes?.length ?? 0) > (best.episodes?.length ?? 0)) best = update
    } catch {
      signal.throwIfAborted()
      sourceFailed = true
    }
  }
  if (best) return best
  throw new Error(
    sourceFailed
      ? '部分视频源检查失败，暂时无法确认更新，请稍后刷新'
      : `未找到可确认的第 ${seasonNumber} 季资源；可手动绑定资源，或播放一次该季后沿用播放源`,
  )
}
