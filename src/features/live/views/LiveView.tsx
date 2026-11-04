import { useState, useMemo, useEffect } from 'react'
import { Link } from 'react-router'
import { Tv, Search, RefreshCw, Radio, ExternalLink, ShieldCheck, AlertTriangle } from 'lucide-react'
import { Input } from '@/shared/components/ui/input'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Switch } from '@/shared/components/ui/switch'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { useLiveStore } from '@/shared/store/liveStore'
import { useAuthStore } from '@/shared/store/authStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { setGlobalLiveStreamEnabled } from '../services/liveSettingService'
import { LivePlayer } from '../components/LivePlayer'
import { cn } from '@/shared/lib'
import { toast } from 'sonner'

export default function LiveView() {
  const {
    cachedChannels,
    activeChannel,
    setActiveChannel,
    refreshAllSubscriptions,
    isLoading,
  } = useLiveStore()

  const isAdmin = useAuthStore(state => state.account?.role === 'admin')
  const isLiveStreamEnabled = useSettingStore(state => state.system.isLiveStreamEnabled)
  const [selectedGroup, setSelectedGroup] = useState<string>('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [isTogglingGlobal, setIsTogglingGlobal] = useState(false)

  // Dynamically extract categories from cached channels
  const groups = useMemo(() => {
    const map = new Map<string, number>()
    cachedChannels.forEach(ch => {
      const g = ch.group || '其他'
      map.set(g, (map.get(g) || 0) + 1)
    })
    return Array.from(map.entries()).map(([name, count]) => ({ name, count }))
  }, [cachedChannels])

  // Filter channels by group and search keyword
  const filteredChannels = useMemo(() => {
    return cachedChannels.filter(channel => {
      const matchGroup = selectedGroup === 'all' || channel.group === selectedGroup
      const matchSearch =
        !searchTerm.trim() ||
        channel.name.toLowerCase().includes(searchTerm.toLowerCase().trim())
      return matchGroup && matchSearch
    })
  }, [cachedChannels, selectedGroup, searchTerm])

  // Auto select first channel if none active
  useEffect(() => {
    if (!activeChannel && cachedChannels.length > 0) {
      setActiveChannel(cachedChannels[0])
    }
  }, [activeChannel, cachedChannels, setActiveChannel])

  // 首次进入页面若没有可用频道，自动拉取环境变量中的订阅并加载频道
  useEffect(() => {
    const state = useLiveStore.getState()
    if (state.cachedChannels.length === 0 && !state.isLoading) {
      if (state.subscriptions.length === 0) {
        void state.initializeEnvSubscriptions()
      } else if (state.subscriptions.some(s => s.isEnabled)) {
        void refreshAllSubscriptions()
      }
    }
  }, [refreshAllSubscriptions])

  const handleRefresh = async () => {
    toast.info('正在刷新直播频道列表...')
    try {
      await refreshAllSubscriptions()
      toast.success('直播频道列表已更新')
    } catch {
      toast.error('刷新直播频道列表失败')
    }
  }

  const isHttps = typeof window !== 'undefined' && window.location.protocol === 'https:'
  const isChannelHttp = activeChannel?.url.startsWith('http://')

  const handleToggleGlobal = async (checked: boolean) => {
    setIsTogglingGlobal(true)
    try {
      await setGlobalLiveStreamEnabled(checked)
      toast.success(checked ? '已开启全站电视直播' : '已关闭全站电视直播（普通用户不可见）')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : '更新状态失败')
    } finally {
      setIsTogglingGlobal(false)
    }
  }

  // 非管理员在直播关闭时显示友好提示
  if (!isLiveStreamEnabled && !isAdmin) {
    return (
      <div className="flex h-[calc(100vh-4rem)] flex-col items-center justify-center p-8 text-center bg-background">
        <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
          <Tv className="size-8" />
        </div>
        <h2 className="text-xl font-semibold">电视直播暂未开放</h2>
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">
          全站电视直播功能已由管理员暂时关闭，请稍后再来。
        </p>
        <Button asChild className="mt-6" variant="default">
          <Link to="/">返回首页</Link>
        </Button>
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col overflow-hidden bg-background">
      {/* Admin Closed Banner */}
      {!isLiveStreamEnabled && isAdmin && (
        <div className="flex shrink-0 items-center justify-between border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-500">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>全站电视直播当前已对普通用户关闭（仅管理员可见预览）。</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={isTogglingGlobal}
            className="h-6 border-amber-500/30 px-2 text-xs text-amber-500 hover:bg-amber-500/20"
            onClick={() => handleToggleGlobal(true)}
          >
            一键对全员开放
          </Button>
        </div>
      )}

      {/* Top Bar */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-border/40 px-4 lg:px-6">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-red-500/10 text-red-500">
            <Tv className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base font-semibold leading-none tracking-tight">电视直播</h1>
              {!isLiveStreamEnabled && isAdmin && (
                <Badge variant="secondary" className="text-[10px] text-amber-500 border-amber-500/30">
                  仅管理员可见
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-0.5 text-xs">
              共 {cachedChannels.length} 个可用频道
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <div className="flex items-center gap-1.5 rounded-lg border border-border/40 bg-muted/30 px-2 py-1 text-xs mr-1">
              <span className="text-muted-foreground hidden sm:inline">全站开关</span>
              <Switch
                checked={isLiveStreamEnabled}
                disabled={isTogglingGlobal}
                onCheckedChange={handleToggleGlobal}
                aria-label="全站电视直播开关"
              />
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
            className="h-8 gap-1.5 text-xs"
          >
            <RefreshCw className={cn('size-3.5', isLoading && 'animate-spin')} />
            <span className="hidden sm:inline">刷新频道</span>
          </Button>

          {isAdmin && (
            <Button asChild variant="ghost" size="sm" className="h-8 gap-1.5 text-xs">
              <Link to="/settings/source">
                <span className="hidden sm:inline">源设置</span>
                <ExternalLink className="size-3.5" />
              </Link>
            </Button>
          )}
        </div>
      </header>

      {/* Main Content Layout */}
      {isLoading && cachedChannels.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-red-500/10 text-red-500">
            <RefreshCw className="size-8 animate-spin" />
          </div>
          <h2 className="text-lg font-semibold">正在同步直播频道...</h2>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            正在从直播源获取最新的节目单与频道列表，请稍候。
          </p>
        </div>
      ) : cachedChannels.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
            <Tv className="size-8" />
          </div>
          <h2 className="text-lg font-semibold">暂无可用直播频道</h2>
          <p className="text-muted-foreground mt-1 max-w-sm text-sm">
            {isAdmin
              ? '尚未添加 M3U 直播源或频道为空。您可以在设置中导入直播源订阅。'
              : '暂未加载到可用直播频道，请点击右上角「刷新频道」重试。'}
          </p>
          {isAdmin && (
            <Button asChild className="mt-5 gap-2">
              <Link to="/settings/source">
                前往「源管理」配置直播源
                <ExternalLink className="size-4" />
              </Link>
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Main Player Area */}
          <div className="flex flex-1 flex-col bg-black">
            <div className="relative flex-1">
              <LivePlayer
                channel={activeChannel}
                className="absolute inset-0 size-full"
              />
            </div>

            {/* Current Playing Channel Bar */}
            {activeChannel && (
              <div className="flex shrink-0 items-center justify-between border-t border-zinc-800 bg-zinc-950 px-4 py-2.5 text-zinc-200">
                <div className="flex items-center gap-3">
                  <div className="flex size-7 items-center justify-center rounded-full bg-red-500/20 text-red-500">
                    <Radio className="size-3.5 animate-pulse" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{activeChannel.name}</span>
                      {activeChannel.group && (
                        <Badge
                          variant="secondary"
                          className="border-zinc-700 bg-zinc-800 text-[10px] text-zinc-300"
                        >
                          {activeChannel.group}
                        </Badge>
                      )}
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      {isHttps && isChannelHttp ? (
                        <span className="flex items-center gap-1 text-emerald-400">
                          <ShieldCheck className="size-3" />
                          Worker 代理池加速中 (HTTP 兼容)
                        </span>
                      ) : (
                        <span className="text-zinc-500">直连播放</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Channels Sidebar */}
          <div className="flex w-full flex-col border-t border-border/40 bg-background lg:w-80 lg:border-l lg:border-t-0 xl:w-96">
            {/* Search and Filters */}
            <div className="space-y-2.5 border-b border-border/40 p-3">
              <div className="relative">
                <Search className="text-muted-foreground absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2" />
                <Input
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="搜索频道名称..."
                  className="h-8 pl-8 text-xs"
                />
              </div>

              {/* Category Pills */}
              <ScrollArea className="w-full whitespace-nowrap">
                <div className="flex gap-1.5 pb-1">
                  <Button
                    size="sm"
                    variant={selectedGroup === 'all' ? 'default' : 'outline'}
                    onClick={() => setSelectedGroup('all')}
                    className="h-7 rounded-full px-3 text-xs"
                  >
                    全部 ({cachedChannels.length})
                  </Button>
                  {groups.map(g => (
                    <Button
                      key={g.name}
                      size="sm"
                      variant={selectedGroup === g.name ? 'default' : 'outline'}
                      onClick={() => setSelectedGroup(g.name)}
                      className="h-7 rounded-full px-3 text-xs"
                    >
                      {g.name} ({g.count})
                    </Button>
                  ))}
                </div>
              </ScrollArea>
            </div>

            {/* Channels List */}
            <ScrollArea className="flex-1">
              <div className="space-y-1 p-2">
                {filteredChannels.length === 0 ? (
                  <div className="text-muted-foreground flex h-32 flex-col items-center justify-center text-xs">
                    未找到匹配频道
                  </div>
                ) : (
                  filteredChannels.map(channel => {
                    const isSelected = activeChannel?.id === channel.id
                    return (
                      <button
                        key={channel.id}
                        type="button"
                        onClick={() => setActiveChannel(channel)}
                        className={cn(
                          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-xs transition-colors',
                          isSelected
                            ? 'bg-red-500/10 font-semibold text-red-500'
                            : 'hover:bg-muted/60 text-foreground',
                        )}
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          {isSelected ? (
                            <Radio className="size-3.5 shrink-0 text-red-500" />
                          ) : (
                            <Tv className="text-muted-foreground size-3.5 shrink-0 opacity-70" />
                          )}
                          <span className="truncate">{channel.name}</span>
                        </div>
                        <span className="text-muted-foreground shrink-0 text-[10px]">
                          {channel.group}
                        </span>
                      </button>
                    )
                  })
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  )
}
