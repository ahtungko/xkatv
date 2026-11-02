import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Check, ChevronDown, ImageOff, List, Play, Radio, RefreshCcw } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { Spinner } from '@/shared/components/ui/spinner'
import { Badge } from '@/shared/components/ui/badge'
import { Button } from '@/shared/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { buildTmdbPlayPath } from '@/shared/lib/routes'
import type { TmdbMediaType } from '@/shared/types/tmdb'
import type { PlaylistMatchItem, SeasonSourceMatches, SourceBestMatch } from './playlistMatcher'
import type { PlaylistMatchesProgress } from './usePlaylistMatches'
import { DetailStatePanel } from './DetailStatePanel'

interface DetailPlaylistTabProps {
  tmdbType: TmdbMediaType
  tmdbId: number
  loading: boolean
  error: string | null
  searched: boolean
  searchedKeyword: string
  progress: PlaylistMatchesProgress
  startedAt: number | null
  completedAt: number | null
  candidates: PlaylistMatchItem[]
  movieSourceMatches: SourceBestMatch[]
  seasonSourceMatches: SeasonSourceMatches[]
  onRetry: () => void
}

const buildPlayLink = (
  tmdbType: TmdbMediaType,
  tmdbId: number,
  entry: PlaylistMatchItem,
  seasonNumber?: number,
) => {
  if (!entry.item.source_code || !entry.item.vod_id) return null
  return buildTmdbPlayPath(tmdbType, tmdbId, {
    sourceCode: entry.item.source_code,
    vodId: entry.item.vod_id,
    seasonNumber: tmdbType === 'tv' ? seasonNumber : undefined,
  })
}

function MotionCollapse({
  open,
  children,
}: {
  open: boolean
  children: React.ReactNode
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="overflow-hidden"
        >
          <div className="pt-2">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function SlidingText({
  messages,
  intervalMs = 1600,
}: {
  messages: string[]
  intervalMs?: number
}) {
  const [index, setIndex] = useState(0)

  const messagesKey = messages.join('\u0001')

  useEffect(() => {
    setIndex(0)
  }, [messagesKey])

  useEffect(() => {
    if (messages.length <= 1) return
    const timer = window.setInterval(() => {
      setIndex(prev => (prev + 1) % messages.length)
    }, intervalMs)
    return () => window.clearInterval(timer)
  }, [intervalMs, messagesKey, messages.length])

  const active = messages[index] || messages[0] || '正在准备匹配任务...'

  return (
    <div className="relative h-5 min-w-[220px] max-w-[320px] overflow-hidden">
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={active}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -10, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="absolute inset-0 flex h-5 items-center"
        >
          <span className="block w-full truncate">{active}</span>
        </motion.p>
      </AnimatePresence>
    </div>
  )
}

function ProgressPill({
  tmdbType,
  loading,
  progress,
  showComplete,
  candidatesCount,
  startedAt,
  completedAt,
}: {
  tmdbType: TmdbMediaType
  loading: boolean
  progress: PlaylistMatchesProgress
  showComplete: boolean
  candidatesCount: number
  startedAt: number | null
  completedAt: number | null
}) {
  const containerClass =
    'inline-flex items-center gap-2 rounded-full border border-border/50 bg-card/70 px-3.5 py-1.5 text-xs text-foreground/85 backdrop-blur-md shadow-xs'

  if (loading) {
    const currentSearch =
      progress.currentSourceName
        ? `正在检索：${progress.currentSourceName}`
        : progress.lastEvent === 'start'
          ? '正在初始化检索任务...'
          : '正在等待源响应...'

    const searchProgress =
      progress.total > 0 ? `检索进度：${progress.completed}/${progress.total}` : '检索进度：0/0'

    const lastResult =
      progress.lastEvent === 'result' && progress.lastResultSourceName
        ? `收到 ${progress.lastResultSourceName} 返回 ${progress.lastResultCount} 条`
        : progress.lastResultSourceName
          ? `最近返回：${progress.lastResultSourceName}（${progress.lastResultCount} 条）`
          : ''

    const matchStep =
      progress.phase === 'match'
        ? tmdbType === 'tv'
          ? `正在按季计算匹配（候选 ${candidatesCount}）`
          : `正在计算匹配（候选 ${candidatesCount}）`
        : ''

    const messages = [currentSearch, searchProgress, lastResult, matchStep].filter(Boolean)

    return (
      <div className={containerClass}>
        <Spinner size="sm" />
        <SlidingText messages={messages} />
      </div>
    )
  }

  if (!showComplete) return null

  const durationMs = startedAt && completedAt ? Math.max(0, completedAt - startedAt) : 0
  const durationText = durationMs > 0 ? `（用时 ${(durationMs / 1000).toFixed(1)}s）` : ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-1.5 text-xs font-medium text-emerald-500 backdrop-blur-md shadow-xs"
    >
      <Check className="size-4" />
      <span>匹配完成{durationText}</span>
    </motion.div>
  )
}

function MatchRow({
  tmdbType,
  tmdbId,
  entry,
  density = 'default',
  seasonNumber,
}: {
  tmdbType: TmdbMediaType
  tmdbId: number
  entry: PlaylistMatchItem
  density?: 'default' | 'compact'
  seasonNumber?: number
}) {
  const playLink = buildPlayLink(tmdbType, tmdbId, entry, seasonNumber)
  const title = entry.item.vod_name || '未命名条目'
  const year = entry.item.vod_year || ''
  const remarks = entry.item.vod_remarks || ''
  const cover = entry.item.vod_pic || ''
  const rowClass =
    density === 'compact'
      ? 'flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3 group/match'
      : 'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4 group/match'

  return (
    <div className={rowClass}>
      <div className="flex min-w-0 w-full gap-3 sm:w-auto sm:flex-1 items-center">
        <div
          className={
            density === 'compact'
              ? 'size-12 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted/40 shadow-xs'
              : 'size-14 shrink-0 overflow-hidden rounded-xl border border-border/40 bg-muted/40 shadow-xs'
          }
        >
          {cover ? (
            <img
              src={cover}
              alt={title}
              className="h-full w-full object-cover transition-transform duration-300 group-hover/match:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="text-muted-foreground flex h-full w-full items-center justify-center">
              <ImageOff className="size-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1 space-y-1">
          <p className="line-clamp-1 text-xs sm:text-sm font-semibold text-foreground/95 group-hover/match:text-primary transition-colors">
            {title}
          </p>
          <div className="text-muted-foreground flex flex-wrap items-center gap-1.5 text-xs">
            {year && <span className="text-[11px] font-medium">{year}</span>}
            {remarks && (
              <Badge variant="outline" className="max-w-full rounded-full text-[10px] px-2 py-0 border-border/50 text-muted-foreground">
                {remarks}
              </Badge>
            )}
          </div>
        </div>
      </div>

      <div className="flex w-full shrink-0 items-center justify-between gap-2 sm:w-auto sm:justify-end">
        <Badge variant="outline" className="h-6 rounded-full px-2 py-0 text-[10px] font-medium border-border/50 bg-card/60">
          匹配度 {entry.score}
        </Badge>
        {playLink ? (
          <Button
            asChild
            size="xs"
            className="h-7.5 shrink-0 rounded-full px-3.5 bg-primary text-primary-foreground hover:bg-primary/90 font-medium text-xs shadow-xs shadow-primary/20 transition-all hover:scale-105 active:scale-95"
          >
            <Link to={playLink}>
              <Play className="size-3 fill-current" />
              立即播放
            </Link>
          </Button>
        ) : (
          <Button size="xs" variant="outline" className="h-7.5 shrink-0 rounded-full px-3 text-xs" disabled>
            不可播
          </Button>
        )}
      </div>
    </div>
  )
}

function SourceMatchBlock({
  tmdbType,
  tmdbId,
  sourceMatch,
  seasonNumber,
}: {
  tmdbType: TmdbMediaType
  tmdbId: number
  sourceMatch: SourceBestMatch
  seasonNumber?: number
}) {
  const totalMatches = (sourceMatch.bestMatch ? 1 : 0) + sourceMatch.alternatives.length
  const best = sourceMatch.bestMatch
  const isSingle = totalMatches === 1 && Boolean(best)
  const useScrollArea = totalMatches > 6

  return (
    <article className="group relative space-y-3 rounded-2xl border border-border/40 bg-card/35 backdrop-blur-md p-3.5 sm:p-4.5 transition-all duration-300 hover:border-primary/30 hover:bg-card/50 hover:shadow-lg hover:shadow-black/5 dark:hover:shadow-black/20">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="line-clamp-1 text-sm font-bold text-foreground">
              {sourceMatch.sourceName || sourceMatch.sourceCode}
            </p>
            <Badge variant={best ? 'secondary' : 'outline'} className="h-6 rounded-full px-2.5 py-0 text-[10px] font-medium">
              {best ? `最佳匹配 ${best.score}` : '无匹配'}
            </Badge>
          </div>
        </div>

        <Dialog>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="xs"
              className="h-7.5 gap-1 rounded-full px-3 text-xs bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border border-border/40 transition-colors"
              disabled={totalMatches === 0}
            >
              <List className="size-3.5" />
              <span>全部 ({totalMatches})</span>
            </Button>
          </DialogTrigger>
          <DialogContent
            className={
              isSingle
                ? 'h-fit gap-4 p-5 sm:max-w-xl sm:rounded-2xl border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl'
                : 'max-h-[85vh] flex flex-col sm:max-w-3xl sm:rounded-2xl border-border/50 bg-background/95 backdrop-blur-xl shadow-2xl'
            }
          >
            <DialogHeader>
              <DialogTitle className="text-base sm:text-lg font-bold">
                {sourceMatch.sourceName || sourceMatch.sourceCode}
              </DialogTitle>
              <DialogDescription className={isSingle ? 'sr-only' : 'text-xs text-muted-foreground'}>
                {isSingle ? '源匹配详情' : `共 ${totalMatches} 条匹配源，按综合分从高到低排序`}
              </DialogDescription>
            </DialogHeader>

            {isSingle && best ? (
              <div className="rounded-xl border border-border/40 bg-card/40 p-3.5">
                <MatchRow
                  tmdbType={tmdbType}
                  tmdbId={tmdbId}
                  entry={best}
                  seasonNumber={seasonNumber}
                />
              </div>
            ) : useScrollArea ? (
              <ScrollArea className="max-h-[65vh] pr-3">
                <div className="space-y-4">
                  {best && (
                    <section className="space-y-2">
                      <p className="text-muted-foreground text-xs font-medium">最佳匹配</p>
                      <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5">
                        <MatchRow
                          tmdbType={tmdbType}
                          tmdbId={tmdbId}
                          entry={best}
                          seasonNumber={seasonNumber}
                        />
                      </div>
                    </section>
                  )}

                  {sourceMatch.alternatives.length > 0 && (
                    <section className="space-y-2">
                      <p className="text-muted-foreground text-xs font-medium">其他匹配项</p>
                      <ul className="divide-border/30 border-border/40 divide-y rounded-xl border bg-card/30">
                        {sourceMatch.alternatives.map(entry => (
                          <li key={`${sourceMatch.sourceCode}-${entry.item.vod_id}-alt-all`} className="p-3">
                            <MatchRow
                              tmdbType={tmdbType}
                              tmdbId={tmdbId}
                              entry={entry}
                              density="compact"
                              seasonNumber={seasonNumber}
                            />
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="space-y-4">
                {best && (
                  <section className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium">最佳匹配</p>
                    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3.5">
                      <MatchRow
                        tmdbType={tmdbType}
                        tmdbId={tmdbId}
                        entry={best}
                        seasonNumber={seasonNumber}
                      />
                    </div>
                  </section>
                )}

                {sourceMatch.alternatives.length > 0 && (
                  <section className="space-y-2">
                    <p className="text-muted-foreground text-xs font-medium">其他匹配项</p>
                    <ul className="divide-border/30 border-border/40 divide-y rounded-xl border bg-card/30">
                      {sourceMatch.alternatives.map(entry => (
                        <li key={`${sourceMatch.sourceCode}-${entry.item.vod_id}-alt-all`} className="p-3">
                          <MatchRow
                            tmdbType={tmdbType}
                            tmdbId={tmdbId}
                            entry={entry}
                            density="compact"
                            seasonNumber={seasonNumber}
                          />
                        </li>
                      ))}
                    </ul>
                  </section>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>

      {best ? (
        <div className="rounded-xl border border-border/35 bg-card/25 p-3.5">
          <MatchRow
            tmdbType={tmdbType}
            tmdbId={tmdbId}
            entry={best}
            seasonNumber={seasonNumber}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border/55 p-3.5 text-center">
          <p className="text-muted-foreground text-xs sm:text-sm">该源暂未筛选到可播放条目</p>
        </div>
      )}
    </article>
  )
}

function TvSeasonBlock({
  tmdbType,
  tmdbId,
  seasonMatch,
  expanded,
  onToggle,
}: {
  tmdbType: TmdbMediaType
  tmdbId: number
  seasonMatch: SeasonSourceMatches
  expanded: boolean
  onToggle: () => void
}) {
  const matchedCount = seasonMatch.sourceMatches.filter(match => Boolean(match.bestMatch)).length
  const matchedSources = seasonMatch.sourceMatches.filter(match => Boolean(match.bestMatch))

  return (
    <section className="space-y-2.5">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-border/40 bg-card/35 backdrop-blur-md px-4 py-3 text-left transition-all hover:bg-card/60 hover:border-border/70"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <ChevronDown
            className={
              expanded
                ? 'text-primary size-4.5 rotate-180 transition-transform duration-200'
                : 'text-muted-foreground size-4.5 transition-transform duration-200'
            }
          />
          <p className="line-clamp-1 text-sm font-bold text-foreground">
            S{seasonMatch.season.season_number} · {seasonMatch.season.name}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge variant={matchedCount > 0 ? 'secondary' : 'outline'} className="h-6 rounded-full px-2.5 py-0 text-[11px] font-medium">
            {matchedCount > 0 ? `已匹配 ${matchedCount} 个源` : '暂无匹配'}
          </Badge>
        </div>
      </button>

      <MotionCollapse open={expanded}>
        {matchedSources.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2">
            {matchedSources.map(sourceMatch => (
              <SourceMatchBlock
                key={`season-${seasonMatch.season.id}-${sourceMatch.sourceCode}`}
                tmdbType={tmdbType}
                tmdbId={tmdbId}
                sourceMatch={sourceMatch}
                seasonNumber={seasonMatch.season.season_number}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-xs sm:text-sm px-2">这一季没有匹配到可播放条目</p>
        )}
      </MotionCollapse>
    </section>
  )
}

export function DetailPlaylistTab({
  tmdbType,
  tmdbId,
  loading,
  error,
  searched,
  searchedKeyword,
  progress,
  startedAt,
  completedAt,
  candidates,
  movieSourceMatches,
  seasonSourceMatches,
  onRetry,
}: DetailPlaylistTabProps) {
  const movieMatchedSources = movieSourceMatches.filter(match => Boolean(match.bestMatch))
  const hasTvMatchedSources = seasonSourceMatches.some(seasonMatch =>
    seasonMatch.sourceMatches.some(sourceMatch => Boolean(sourceMatch.bestMatch)),
  )

  const firstSeasonId = seasonSourceMatches.find(seasonMatch => seasonMatch.season.season_number === 1)?.season.id ?? null
  const [expandedSeasonId, setExpandedSeasonId] = useState<number | null>(firstSeasonId)
  const [showComplete, setShowComplete] = useState(false)

  useEffect(() => {
    if (!completedAt) return
    setShowComplete(true)
    const timer = window.setTimeout(() => setShowComplete(false), 1600)
    return () => window.clearTimeout(timer)
  }, [completedAt])

  const showPillInActionSlot = loading || showComplete
  const shouldShowNoMatchState =
    !error &&
    searched &&
    !loading &&
    (tmdbType === 'movie' ? movieMatchedSources.length === 0 : !hasTvMatchedSources)

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Radio className="size-4 text-primary" />
            <h2 className="text-base sm:text-lg font-bold tracking-tight text-foreground">源匹配结果</h2>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed max-w-xl">
            基于剧名在已启用的视频源中检索，并按相似度与年份智能评分。结果会增量展示。
            {searchedKeyword ? (
              <span className="text-foreground/85 font-medium"> 当前关键词：“{searchedKeyword}”。</span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-col items-end gap-2">
          <AnimatePresence mode="wait" initial={false}>
            {showPillInActionSlot ? (
              <motion.div
                key="playlist-progress"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <ProgressPill
                  tmdbType={tmdbType}
                  loading={loading}
                  progress={progress}
                  showComplete={showComplete}
                  candidatesCount={candidates.length}
                  startedAt={startedAt}
                  completedAt={completedAt}
                />
              </motion.div>
            ) : (
              <motion.div
                key="playlist-retry-button"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
              >
                <Button
                  variant="secondary"
                  size="sm"
                  className="h-8.5 rounded-full px-4 text-xs font-medium border border-border/40 bg-card/60 backdrop-blur-md hover:bg-accent shadow-xs active:scale-95 transition-all"
                  onClick={onRetry}
                >
                  <RefreshCcw className="size-3.5 mr-1" />
                  重新匹配
                </Button>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            className="h-0"
            initial={false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.01 }}
          />
        </div>
      </div>

      {!loading && error && (
        <DetailStatePanel
          mode="error"
          compact
          tag="匹配失败"
          title="找不到匹配结果"
          description={error}
          primaryAction={{
            label: '重新匹配',
            onClick: onRetry,
          }}
          secondaryAction={{
            label: '视频源设置',
            to: '/settings/source',
          }}
        />
      )}

      {!error && searched && tmdbType === 'movie' && (
        <div className="space-y-3">
          {movieMatchedSources.length > 0 && (
            <motion.div layout className="grid gap-3 md:grid-cols-2">
              <AnimatePresence initial={false}>
                {movieMatchedSources.map(sourceMatch => (
                  <motion.div
                    key={`movie-${sourceMatch.sourceCode}`}
                    layout
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                  >
                    <SourceMatchBlock
                      tmdbType={tmdbType}
                      tmdbId={tmdbId}
                      sourceMatch={sourceMatch}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      )}

      {!error && searched && tmdbType === 'tv' && (
        <div className="space-y-3">
          {seasonSourceMatches.length > 0 && !shouldShowNoMatchState ? (
            <div className="space-y-3">
              {seasonSourceMatches.map(seasonMatch => (
                <TvSeasonBlock
                  key={seasonMatch.season.id}
                  tmdbType={tmdbType}
                  tmdbId={tmdbId}
                  seasonMatch={seasonMatch}
                  expanded={expandedSeasonId === seasonMatch.season.id}
                  onToggle={() =>
                    setExpandedSeasonId(prev => (prev === seasonMatch.season.id ? null : seasonMatch.season.id))
                  }
                />
              ))}
            </div>
          ) : (
            !loading &&
            !shouldShowNoMatchState && (
              <p className="text-muted-foreground text-xs sm:text-sm">当前剧集没有可匹配的季信息</p>
            )
          )}
        </div>
      )}

      {shouldShowNoMatchState && (
        <DetailStatePanel
          mode="empty"
          compact
          tag="暂无可用播放项"
          title="找不到匹配结果"
          description="当前已启用视频源中没有可播放条目。你可以重新匹配，或调整视频源后再试。"
          primaryAction={{
            label: '重新匹配',
            onClick: onRetry,
          }}
          secondaryAction={{
            label: '视频源设置',
            to: '/settings/source',
          }}
        />
      )}
    </section>
  )
}
