import { useState } from 'react'
import { toast } from 'sonner'
import { Tv, RefreshCw, Trash2, Plus, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Badge } from '@/shared/components/ui/badge'
import { Input } from '@/shared/components/ui/input'
import { Label } from '@/shared/components/ui/label'
import { Switch } from '@/shared/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { SettingsSection } from '../common'
import { ConfirmModal } from '@/shared/components/common/ConfirmModal'
import { useLiveStore } from '@/shared/store/liveStore'
import type { LiveSubscription } from '@/shared/types/live'
import { cn } from '@/shared/lib'
import dayjs from 'dayjs'

function AddLiveSubscriptionModal({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const addSubscription = useLiveStore(state => state.addSubscription)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const trimmedUrl = url.trim()
    if (!trimmedUrl) {
      toast.error('请输入有效的播放列表 URL')
      return
    }

    setIsSubmitting(true)
    try {
      await addSubscription({
        name: name.trim() || '新建直播源',
        url: trimmedUrl,
        isEnabled: true,
      })
      toast.success('直播源添加成功并已抓取频道')
      setName('')
      setUrl('')
      onOpenChange(false)
    } catch {
      toast.error('添加直播源失败，请检查网络或源地址')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>添加电视直播源 (M3U / TXT)</DialogTitle>
          <DialogDescription>
            支持标准 M3U/M3U8 播放列表链接或 TVBox TXT 格式的直播源地址。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="live-sub-name">订阅名称（可选）</Label>
            <Input
              id="live-sub-name"
              placeholder="例如：央视卫视精选"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="live-sub-url">直播源地址 (URL)</Label>
            <Input
              id="live-sub-url"
              placeholder="https://example.com/live.m3u"
              value={url}
              onChange={e => setUrl(e.target.value)}
              required
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              取消
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-2">
              {isSubmitting && <Loader2 className="size-4 animate-spin" />}
              {isSubmitting ? '解析中...' : '添加并解析'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function LiveSubscriptionCard({ subscription }: { subscription: LiveSubscription }) {
  const { updateSubscription, deleteSubscription, refreshSubscription } = useLiveStore()
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)

  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refreshSubscription(subscription.id)
      toast.success(`「${subscription.name}」刷新成功`)
    } catch {
      toast.error(`「${subscription.name}」刷新失败`)
    } finally {
      setIsRefreshing(false)
    }
  }

  return (
    <div className="flex flex-col justify-between gap-3 rounded-lg border border-border/50 bg-card p-4 transition-colors md:flex-row md:items-center">
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-center gap-2">
          <Tv className="size-4 text-red-500" />
          <h4 className="truncate text-sm font-semibold">{subscription.name}</h4>
          <Badge variant="outline" className="text-[10px]">
            {subscription.channelCount ? `${subscription.channelCount} 个频道` : '未解析'}
          </Badge>
          {!subscription.isEnabled && (
            <Badge variant="secondary" className="text-[10px]">
              已停用
            </Badge>
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">{subscription.url}</p>
        {subscription.updatedAt && (
          <p className="text-[10px] text-muted-foreground">
            更新时间：{dayjs(subscription.updatedAt).format('YYYY-MM-DD HH:mm')}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 self-end md:self-auto">
        <Switch
          checked={subscription.isEnabled}
          onCheckedChange={checked => updateSubscription(subscription.id, { isEnabled: checked })}
          aria-label="启用/停用直播源"
        />

        <Button
          variant="ghost"
          size="icon"
          className="size-8"
          onClick={handleRefresh}
          disabled={isRefreshing}
          title="刷新此源"
        >
          <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin')} />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="size-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setIsDeleteOpen(true)}
          title="删除"
        >
          <Trash2 className="size-3.5" />
        </Button>

        <ConfirmModal
          isOpen={isDeleteOpen}
          onClose={() => setIsDeleteOpen(false)}
          onConfirm={() => deleteSubscription(subscription.id)}
          title="删除直播源"
          description={`确定要删除「${subscription.name}」吗？已缓存的相关频道将一同移除。`}
          confirmText="删除"
          isDestructive
        />
      </div>
    </div>
  )
}

export default function LiveSourceManager() {
  const { subscriptions, refreshAllSubscriptions, isLoading } = useLiveStore()
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [isRefreshingAll, setIsRefreshingAll] = useState(false)

  const handleRefreshAll = async () => {
    setIsRefreshingAll(true)
    try {
      await refreshAllSubscriptions()
      toast.success('所有已启用的直播源已刷新')
    } catch {
      toast.error('批量刷新直播源失败')
    } finally {
      setIsRefreshingAll(false)
    }
  }

  return (
    <>
      <SettingsSection
        title="电视直播源 (IPTV M3U)"
        description="配置 M3U/M3U8 直播源订阅，频道将自动归纳至主站「电视直播」专区。"
        action={
          <div className="flex items-center gap-2">
            {subscriptions.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-8 px-3 text-xs"
                onClick={handleRefreshAll}
                disabled={isRefreshingAll || isLoading}
              >
                <RefreshCw
                  className={cn('mr-1 size-3.5', (isRefreshingAll || isLoading) && 'animate-spin')}
                />
                全部刷新
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs gap-1"
              onClick={() => setAddModalOpen(true)}
            >
              <Plus className="size-3.5" />
              添加直播源
            </Button>
          </div>
        }
      >
        {subscriptions.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border/60 py-8 text-center">
            <AlertCircle className="mb-2 size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-muted-foreground">暂无电视直播源订阅</p>
            <p className="text-xs text-muted-foreground/75 mt-0.5 max-w-sm">
              点击右上角「添加直播源」填入在线 M3U/TXT 订阅地址，即可在大屏与网页端观看电视直播。
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {subscriptions.map(sub => (
              <LiveSubscriptionCard key={sub.id} subscription={sub} />
            ))}
          </div>
        )}
      </SettingsSection>

      <AddLiveSubscriptionModal open={addModalOpen} onOpenChange={setAddModalOpen} />
    </>
  )
}
