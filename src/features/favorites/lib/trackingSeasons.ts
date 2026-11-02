import type { FavoriteItem } from '../types/favorites'
import type { ViewingHistoryItem } from '@/shared/types/video'
import { matchingTrackingUpdate, trackingProgress, type SeriesUpdate } from './seriesTracking'

export interface TrackingSeason {
  number: number
  name: string
  airDate: string | null
  episodeCount: number
}

interface SeasonMetadata {
  season_number: number
  name?: string | null
  air_date?: string | null
  episode_count?: number
}

export function normalizeTrackingSeasons(metadata: readonly SeasonMetadata[]): TrackingSeason[] {
  const seasons = new Map<number, TrackingSeason>()
  for (const season of metadata) {
    if (!Number.isSafeInteger(season.season_number) || season.season_number <= 0) continue
    const episodeCount = season.episode_count ?? 0
    seasons.set(season.season_number, {
      number: season.season_number,
      name: season.name?.trim() || `第 ${season.season_number} 季`,
      airDate: season.air_date?.trim() || null,
      episodeCount: Number.isSafeInteger(episodeCount) && episodeCount > 0 ? episodeCount : 0,
    })
  }
  return [...seasons.values()].sort((a, b) => a.number - b.number)
}

export function nextAiredSeason(
  seasons: TrackingSeason[],
  currentSeason: number,
  now = Date.now(),
) {
  const date = new Date(now)
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  return seasons
    .filter(season => {
      if (
        !Number.isSafeInteger(season.number) ||
        season.number <= currentSeason ||
        season.number <= 0 ||
        !Number.isSafeInteger(season.episodeCount) ||
        season.episodeCount <= 0 ||
        !season.airDate ||
        !/^\d{4}-\d{2}-\d{2}$/.test(season.airDate) ||
        season.airDate > today
      )
        return false
      const timestamp = Date.parse(`${season.airDate}T00:00:00Z`)
      return (
        Number.isFinite(timestamp) &&
        new Date(timestamp).toISOString().slice(0, 10) === season.airDate
      )
    })
    .sort((a, b) => a.number - b.number)[0]
}

export function canDiscoverNextSeason(
  item: FavoriteItem,
  update: SeriesUpdate | undefined,
  history: ViewingHistoryItem[],
  enabledSourceIds: string[],
) {
  const current = matchingTrackingUpdate(item, update)
  return (
    item.sourceType === 'tmdb' &&
    item.media.mediaType === 'tv' &&
    !!item.tracking?.enabled &&
    !!current?.checkedAt &&
    !!current.episodes?.length &&
    !current.error &&
    enabledSourceIds.includes(current.sourceCode ?? '') &&
    trackingProgress(item, current, history).pendingCount === 0
  )
}
