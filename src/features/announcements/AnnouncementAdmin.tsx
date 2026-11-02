import { useState } from 'react'
import { Eye, Megaphone } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { Textarea } from '@/shared/components/ui/textarea'
import { Dialog, DialogTrigger } from '@/shared/components/ui/dialog'
import { SettingsSection } from '@/features/settings/components/common'
import { useAuthStore } from '@/shared/store/authStore'
import { saveAnnouncement, type Announcement } from './service'
import { useAnnouncement } from './useAnnouncement'
import { AnnouncementDialogContent } from './AnnouncementDialogContent'

function localDateTime(value: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function isoDateTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function AnnouncementEditor({
  initial,
  ownerId,
  reload,
}: {
  initial: Announcement
  ownerId: string
  reload: () => void
}) {
  const [saved, setSaved] = useState(initial)
  const [title, setTitle] = useState(initial.title)
  const [content, setContent] = useState(initial.content)
  const [kind, setKind] = useState(initial.kind)
  const [versionLabel, setVersionLabel] = useState(initial.version_label || '')
  const [maintenanceStart, setMaintenanceStart] = useState(localDateTime(initial.maintenance_start))
  const [maintenanceEnd, setMaintenanceEnd] = useState(localDateTime(initial.maintenance_end))
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const draft = {
    title: kind === 'maintenance' ? '系统维护' : title.trim(),
    content: content.trim(),
    kind,
    version_label: kind === 'version_update' ? versionLabel.trim() || null : null,
    maintenance_start: kind === 'maintenance' ? isoDateTime(maintenanceStart) : null,
    maintenance_end: kind === 'maintenance' ? isoDateTime(maintenanceEnd) : null,
  }

  const canPreview = kind === 'maintenance' || !!draft.title
  const canPublish =
    canPreview &&
    (kind !== 'maintenance' ||
      (!!draft.maintenance_start &&
        !!draft.maintenance_end &&
        Date.parse(draft.maintenance_end) > Date.parse(draft.maintenance_start)))

  async function save(published: boolean, unpublish = false) {
    if (busy) return
    setBusy(true)
    setMessage('')
    setError('')
    try {
      const result = await saveAnnouncement(ownerId, {
        ...saved,
        ...(unpublish ? {} : draft),
        published,
      })
      setSaved(result)
      setMessage(
        published
          ? kind === 'maintenance'
            ? '维护公告已发布，将按起止时间自动维护；管理员不受影响，下架可提前恢复访问。'
            : '公告已发布，用户下次刷新或一分钟内收到弹窗；播放中会延后展示。'
          : unpublish
            ? '公告已下架，未保存的编辑仍保留在表单中。'
            : '草稿已保存，用户暂时看不到。',
      )
    } catch (error) {
      setError(error instanceof Error ? error.message : '保存失败，请重试')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={event => {
        event.preventDefault()
        void save(true)
      }}
    >
      <p className="text-muted-foreground text-xs" role="status">
        {saved.published ? '已发布' : '未发布'} · 版本 {saved.revision}
      </p>
      <fieldset disabled={busy} className="space-y-4">
        <label className="block space-y-2 text-sm">
          <span>公告类型</span>
          <select
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={kind}
            onChange={event => setKind(event.target.value as Announcement['kind'])}
          >
            <option value="notice">普通公告</option>
            <option value="maintenance">维护通知</option>
            <option value="version_update">版本更新</option>
          </select>
        </label>
        {kind === 'version_update' && (
          <label className="block space-y-2 text-sm">
            <span>版本号（可选）</span>
            <Input
              value={versionLabel}
              maxLength={40}
              placeholder="例如：v2.1.0"
              onChange={event => setVersionLabel(event.target.value)}
            />
          </label>
        )}
        {kind === 'maintenance' && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs">快捷设置</span>
              {[
                { minutes: 30, label: '现在起 30 分钟' },
                { minutes: 60, label: '现在起 1 小时' },
                { minutes: 120, label: '现在起 2 小时' },
              ].map(({ minutes, label }) => (
                <Button
                  key={minutes}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const now = Date.now()
                    setMaintenanceStart(localDateTime(new Date(now).toISOString()))
                    setMaintenanceEnd(localDateTime(new Date(now + minutes * 60_000).toISOString()))
                  }}
                >
                  {label}
                </Button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-2 text-sm">
                <span>维护开始时间</span>
                <Input
                  type="datetime-local"
                  required
                  value={maintenanceStart}
                  onChange={event => setMaintenanceStart(event.target.value)}
                />
              </label>
              <label className="block space-y-2 text-sm">
                <span>维护结束时间</span>
                <Input
                  type="datetime-local"
                  required
                  value={maintenanceEnd}
                  min={maintenanceStart || undefined}
                  onChange={event => setMaintenanceEnd(event.target.value)}
                />
              </label>
            </div>
            <p className="text-muted-foreground text-xs">
              按当前设备时区填写，快捷设置会同时更新日期和时间。发布后按服务器时间自动进入和结束维护，期间普通用户无法访问；管理员不受限制。下架可提前恢复访问。
            </p>
          </div>
        )}
        {kind !== 'maintenance' && (
          <label className="block space-y-2 text-sm">
            <span>公告标题</span>
            <Input
              value={title}
              maxLength={100}
              placeholder="例如：本周维护通知"
              onChange={event => setTitle(event.target.value)}
            />
          </label>
        )}
        <label className="block space-y-2 text-sm">
          <span>{kind === 'maintenance' ? '维护说明（可选）' : '公告正文（可选）'}</span>
          <Textarea
            value={content}
            maxLength={10000}
            className="max-h-80 min-h-40 overflow-y-auto"
            placeholder={
              kind === 'maintenance'
                ? '可补充维护原因或注意事项，留空仅展示维护时间和倒计时。'
                : '可补充公告内容，支持换行；也可以留空。'
            }
            onChange={event => setContent(event.target.value)}
          />
          <span className="text-muted-foreground block text-xs">{content.length} / 10000</span>
        </label>
        <div className="flex flex-wrap gap-2">
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" variant="outline" disabled={!canPreview}>
                <Eye className="size-4" />
                预览公告
              </Button>
            </DialogTrigger>
            <AnnouncementDialogContent announcement={{ ...saved, ...draft }} preview />
          </Dialog>
          <Button type="submit" disabled={busy || !canPublish}>
            {busy ? '正在保存…' : saved.published ? '发布更新' : '发布公告'}
          </Button>
          {saved.published ? (
            <Button type="button" variant="outline" onClick={() => void save(false, true)}>
              下架公告
            </Button>
          ) : (
            <Button type="button" variant="outline" onClick={() => void save(false)}>
              保存草稿
            </Button>
          )}
        </div>
      </fieldset>
      {message && (
        <p className="text-sm" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={busy}
        onClick={() => {
          setTitle(saved.title)
          setContent(saved.content)
          setKind(saved.kind)
          setVersionLabel(saved.version_label || '')
          setMaintenanceStart(localDateTime(saved.maintenance_start))
          setMaintenanceEnd(localDateTime(saved.maintenance_end))
          setMessage('')
          setError('')
          reload()
        }}
      >
        重新加载（放弃未保存修改）
      </Button>
    </form>
  )
}

function AnnouncementManagement({ ownerId }: { ownerId: string }) {
  const { announcement, error, loading, reload } = useAnnouncement(false)
  return (
    <SettingsSection
      title="站内公告"
      description="维护通知按起止时间限制普通用户访问，管理员豁免；其他公告自动弹窗提醒。下架可提前结束维护。"
      icon={<Megaphone className="size-4" />}
      tone="amber"
    >
      {loading ? (
        <p className="text-muted-foreground text-sm">正在加载公告…</p>
      ) : error ? (
        <div className="space-y-3">
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
          <Button variant="outline" onClick={reload}>
            重试
          </Button>
        </div>
      ) : announcement ? (
        <AnnouncementEditor
          key={announcement.revision}
          initial={announcement}
          ownerId={ownerId}
          reload={reload}
        />
      ) : (
        <p className="text-muted-foreground text-sm">无法读取公告，请重新登录管理员账号。</p>
      )}
    </SettingsSection>
  )
}

export default function AnnouncementAdmin() {
  const account = useAuthStore(state => state.account)
  return account?.role === 'admin' ? (
    <AnnouncementManagement key={account.id} ownerId={account.id} />
  ) : null
}
