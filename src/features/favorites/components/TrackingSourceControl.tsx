import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Link2 } from 'lucide-react'
import {
  createCmsClient,
  createDirectStrategy,
  createFetchAdapter,
  createUrlPrefixProxyStrategy,
  type CmsClient,
  type VideoItem,
} from '@xkatv/cms-core'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/components/ui/dialog'
import { normalizeProxyPrefix } from '@/shared/config/api.config'
import { useApiStore } from '@/shared/store/apiStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { useViewingHistoryStore } from '@/shared/store/viewingHistoryStore'
import { useFavoritesStore } from '../store/favoritesStore'
import { useSeriesUpdatesStore } from '../store/seriesUpdatesStore'
import {
  matchingTrackingUpdate,
  playableEpisodes,
  trackingBinding,
  trackingBindingKey,
  trackingKey,
  trackingProgress,
  trackingSeasonKey,
} from '../lib/seriesTracking'
import type { FavoriteItem, TrackingBinding } from '../types/favorites'

interface Editor {
  identity: string
  sourceCode: string
  query: string
  results: VideoItem[]
  selection?: { binding: TrackingBinding; episodes: number }
  phase: 'idle' | 'search' | 'preview'
  searched?: boolean
  error?: string
}

export function TrackingSourceControl({ item }: { item: FavoriteItem }) {
  const ownerId = useAuthStore(state => state.account?.id)
  const sources = useApiStore(state => state.videoAPIs)
  const network = useSettingStore(state => state.network)
  const setBinding = useFavoritesStore(state => state.setTrackingBinding)
  const binding = trackingBinding(item)
  const seasonKey = trackingSeasonKey(item)
  const enabledSources = sources.filter(source => source.isEnabled)
  const identity = JSON.stringify([
    ownerId,
    item.id,
    seasonKey,
    item.tracking?.enabled,
    trackingBindingKey(item),
    enabledSources,
    network,
  ])
  const currentIdentity = useRef(identity)
  currentIdentity.current = identity
  const request = useRef<AbortController | null>(null)
  const abortRequest = useCallback(() => request.current?.abort(), [])
  const [editor, setEditor] = useState<Editor | null>(null)
  const inputId = useId()
  const open = editor?.identity === identity && !!item.tracking?.enabled
  const title = item.sourceType === 'tmdb' ? item.media.title : item.media.vodName

  useEffect(() => {
    setEditor(null)
    return abortRequest
  }, [identity, abortRequest])

  const close = () => {
    request.current?.abort()
    setEditor(null)
  }
  async function runRequest<T>(
    operation: (client: CmsClient) => Promise<T>,
  ): Promise<T | undefined> {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    const adapter = createFetchAdapter()
    const client = createCmsClient({
      proxyStrategy: network.isProxyEnabled
        ? createUrlPrefixProxyStrategy(normalizeProxyPrefix(network.proxyUrl))
        : createDirectStrategy(),
      requestAdapter: {
        fetch: (url, options) => {
          controller.signal.throwIfAborted()
          return adapter.fetch(url, { ...options, signal: controller.signal })
        },
      },
    })
    try {
      const value = await operation(client)
      if (
        !controller.signal.aborted &&
        currentIdentity.current === identity &&
        useAuthStore.getState().account?.id === ownerId
      )
        return value
    } catch (error) {
      if (!controller.signal.aborted && currentIdentity.current === identity)
        setEditor(
          previous =>
            previous && {
              ...previous,
              phase: 'idle',
              error: error instanceof Error ? error.message : '请求失败，请重试',
            },
        )
    } finally {
      client.destroy()
    }
    return undefined
  }
  const selectedSource = enabledSources.find(source => source.id === editor?.sourceCode)
  const source = selectedSource && {
    ...selectedSource,
    retry: 0,
    timeout: Math.min(selectedSource.timeout || network.defaultTimeout, 10000),
  }
  const save = (selected: TrackingBinding | null) => {
    if (useAuthStore.getState().account?.id !== ownerId || currentIdentity.current !== identity)
      return
    const current = useFavoritesStore.getState().favorites.find(favorite => favorite.id === item.id)
    if (!current || trackingBindingKey(current) !== trackingBindingKey(item)) return
    const cache = useSeriesUpdatesStore.getState()
    const update =
      cache.ownerId === ownerId
        ? matchingTrackingUpdate(current, cache.entries[trackingKey(current)])
        : undefined
    const completed = trackingProgress(
      current,
      update,
      useViewingHistoryStore.getState().viewingHistory,
    ).completedThrough
    if (setBinding(item.id, selected, seasonKey, completed)) close()
    else
      setEditor(previous => previous && { ...previous, error: '追更状态已变化，请重新打开后再试' })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={nextOpen => {
        if (!nextOpen) {
          close()
          return
        }
        const preferred =
          binding?.sourceCode ?? (item.sourceType === 'cms' ? item.media.sourceCode : '')
        setEditor({
          identity,
          sourceCode:
            enabledSources.find(source => source.id === preferred)?.id ??
            enabledSources[0]?.id ??
            '',
          query: title,
          results: [],
          phase: 'idle',
        })
      }}
    >
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 gap-1 px-1.5 text-xs"
          aria-label={`绑定${title}追更源`}
          title={
            binding ? `固定源：${binding.sourceName} · ${binding.title}` : '选择固定检查的资源'
          }
        >
          <Link2 className="size-3" />
          {binding ? '更换追更源' : '绑定追更源'}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>绑定追更源</DialogTitle>
          <DialogDescription>
            {title}
            {item.sourceType === 'tmdb' ? ` · 第 ${seasonKey} 季` : ''}
            。请选择对应的剧集与季，绑定后固定检查该资源。换源会保留已看集数，并重新记录新集提醒。
          </DialogDescription>
        </DialogHeader>
        {binding && (
          <p className="text-muted-foreground text-sm">
            当前绑定：{binding.sourceName} · {binding.title}
          </p>
        )}
        <form
          className="space-y-3"
          onSubmit={async event => {
            event.preventDefault()
            if (!source || !editor?.query.trim()) return
            const query = editor.query.trim()
            setEditor(
              previous =>
                previous && {
                  ...previous,
                  phase: 'search',
                  results: [],
                  selection: undefined,
                  error: undefined,
                  searched: false,
                },
            )
            const result = await runRequest(client => client.search(query, source))
            if (!result) return
            setEditor(
              previous =>
                previous && {
                  ...previous,
                  phase: 'idle',
                  searched: true,
                  results: result.success ? result.items : [],
                  error: result.success ? undefined : result.error || '搜索失败，请重试',
                },
            )
          }}
        >
          <label className="block space-y-1 text-sm">
            视频源
            <select
              aria-label="搜索视频源"
              value={editor?.sourceCode ?? ''}
              className="bg-background border-border h-9 w-full rounded-md border px-2"
              onChange={event => {
                request.current?.abort()
                setEditor(
                  previous =>
                    previous && {
                      ...previous,
                      sourceCode: event.target.value,
                      results: [],
                      selection: undefined,
                      phase: 'idle',
                      error: undefined,
                      searched: false,
                    },
                )
              }}
            >
              {!enabledSources.length && <option value="">暂无启用的视频源</option>}
              {enabledSources.map(source => (
                <option key={source.id} value={source.id}>
                  {source.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1 space-y-1">
              <label htmlFor={inputId} className="text-sm">
                搜索关键词
              </label>
              <Input
                id={inputId}
                value={editor?.query ?? ''}
                onChange={event => {
                  request.current?.abort()
                  setEditor(
                    previous =>
                      previous && {
                        ...previous,
                        query: event.target.value,
                        results: [],
                        selection: undefined,
                        phase: 'idle',
                        error: undefined,
                        searched: false,
                      },
                  )
                }}
              />
            </div>
            <Button
              type="submit"
              disabled={!source || !editor?.query.trim() || editor.phase !== 'idle'}
            >
              {editor?.phase === 'search' ? '搜索中…' : '搜索资源'}
            </Button>
          </div>
        </form>
        {!enabledSources.length && (
          <p className="text-muted-foreground text-sm">请先在设置中启用视频源。</p>
        )}
        {editor?.error && (
          <p role="alert" className="text-destructive text-sm">
            {editor.error}
          </p>
        )}
        {editor?.searched && !editor.results.length && !editor.error && (
          <p className="text-muted-foreground text-sm">未找到资源，可修改关键词或切换视频源。</p>
        )}
        {!!editor?.results.length && (
          <div className="max-h-56 space-y-2 overflow-y-auto" aria-label="资源搜索结果">
            {editor.results.map(video => (
              <button
                key={video.vod_id}
                type="button"
                className="border-border hover:bg-accent w-full rounded-md border p-3 text-left text-sm disabled:opacity-50"
                aria-label={`选择资源：${video.vod_name}`}
                disabled={editor.phase !== 'idle'}
                onClick={async () => {
                  if (!source) return
                  setEditor(
                    previous =>
                      previous && {
                        ...previous,
                        phase: 'preview',
                        selection: undefined,
                        error: undefined,
                      },
                  )
                  const detail = await runRequest(client => client.getDetail(video.vod_id, source))
                  if (!detail) return
                  const episodes = playableEpisodes(detail)
                  setEditor(
                    previous =>
                      previous && {
                        ...previous,
                        phase: 'idle',
                        selection:
                          detail.success && episodes.length
                            ? {
                                binding: {
                                  sourceCode: source.id,
                                  sourceName: source.name,
                                  vodId: video.vod_id,
                                  title: detail.videoInfo?.title || video.vod_name,
                                },
                                episodes: episodes.length,
                              }
                            : undefined,
                        error: !detail.success
                          ? detail.error || '详情获取失败'
                          : !episodes.length
                            ? '该资源暂无可播放的正片剧集'
                            : undefined,
                      },
                  )
                }}
              >
                <span className="block font-medium">{video.vod_name}</span>
                <span className="text-muted-foreground">
                  {[video.vod_year, video.type_name, video.vod_remarks]
                    .filter(Boolean)
                    .join(' · ') || source?.name}
                </span>
              </button>
            ))}
          </div>
        )}
        {editor?.phase === 'preview' && (
          <p role="status" className="text-muted-foreground text-sm">
            正在核对可用集数…
          </p>
        )}
        {editor?.selection && (
          <p className="bg-muted rounded-md p-3 text-sm">
            已选：{editor.selection.binding.title} · {editor.selection.binding.sourceName} · 可看{' '}
            {editor.selection.episodes} 集
          </p>
        )}
        <DialogFooter>
          {binding && (
            <Button type="button" variant="ghost" onClick={() => save(null)}>
              {item.sourceType === 'cms' ? '恢复原源' : '恢复自动选源'}
            </Button>
          )}
          <Button type="button" variant="outline" onClick={close}>
            取消
          </Button>
          <Button
            type="button"
            disabled={!editor?.selection || editor.phase !== 'idle'}
            onClick={() => editor?.selection && save(editor.selection.binding)}
          >
            确认绑定
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
