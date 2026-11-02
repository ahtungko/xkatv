import { XkaLogo } from '@/shared/components/icons'
import { Badge } from '@/shared/components/ui/badge'
import { Github, History, MessageSquare, Sparkles } from 'lucide-react'
import { useVersionStore } from '@/shared/store/versionStore'
import { PROJECT } from '@/shared/config/project'
import { SettingsPageShell, SettingsSection } from '../common'

export default function AboutProject() {
  const currentYear = new Date().getFullYear()
  const { setShowUpdateModal, currentVersion, updateHistory } = useVersionStore()
  const latestUpdate = updateHistory[0]

  return (
    <SettingsPageShell
      title="关于项目"
      description="项目概览、版本信息与资源入口。"
      showHeader={false}
    >
      <section className="border-border/70 bg-card/70 relative overflow-hidden rounded-2xl border p-5 md:p-6">
        <div className="bg-primary/10 pointer-events-none absolute -top-16 -right-16 size-44 rounded-full blur-3xl" />

        <div className="relative space-y-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-4">
              <div className="bg-background ring-border/60 flex size-18 shrink-0 items-center justify-center rounded-2xl ring-1">
                <XkaLogo size={56} className="drop-shadow-sm" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{PROJECT.name}</h2>
                <p className="text-muted-foreground text-sm">
                  {PROJECT.description}，由 {PROJECT.owner} 持续维护。
                </p>
              </div>
            </div>

            <div className="hidden flex-wrap gap-2 md:flex">
              <Badge variant="outline">当前版本 v{currentVersion}</Badge>
              <Badge variant="outline">近期更新 {PROJECT.changes.length} 条</Badge>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="bg-muted/35 rounded-xl px-4 py-3">
              <p className="text-muted-foreground text-xs">最近版本</p>
              <p className="mt-1 truncate text-sm font-semibold">
                {latestUpdate ? `v${currentVersion} · ${latestUpdate.title}` : `v${currentVersion}`}
              </p>
            </div>
            <div className="bg-muted/35 rounded-xl px-4 py-3">
              <p className="text-muted-foreground text-xs">近期更新条目</p>
              <p className="mt-1 text-base font-semibold">
                {PROJECT.changes.length ? `${PROJECT.changes.length} 条` : '未提供记录'}
              </p>
            </div>
            <div className="bg-muted/35 rounded-xl px-4 py-3">
              <p className="text-muted-foreground text-xs">
                {PROJECT.updatedAt ? '代码更新日期' : '构建日期'}
              </p>
              <p className="mt-1 text-base font-semibold">{latestUpdate?.date ?? '-'}</p>
            </div>
          </div>
        </div>
      </section>

      <SettingsSection title="项目资源" description="查看仓库代码与版本更新记录。" tone="violet">
        <div className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: '项目仓库',
              description: '查看本站源码',
              href: PROJECT.repository,
              icon: Github,
            },
            {
              title: '问题反馈',
              description: '提交问题与功能建议',
              href: PROJECT.issues,
              icon: MessageSquare,
            },
          ].map(({ title, description, href, icon: Icon }) => (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="border-border/70 bg-muted/35 hover:bg-muted/55 rounded-xl border px-4 py-4 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="bg-background flex size-10 items-center justify-center rounded-lg">
                  <Icon className="size-5" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="text-muted-foreground text-xs">{description}</p>
                </div>
              </div>
            </a>
          ))}
          <button
            type="button"
            onClick={() => setShowUpdateModal(true)}
            className="border-border/70 bg-muted/35 hover:bg-muted/55 rounded-xl border px-4 py-4 text-left transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="bg-background flex size-10 items-center justify-center rounded-lg">
                <History className="size-5" />
              </div>
              <div className="space-y-0.5">
                <p className="text-sm font-semibold">版本日志</p>
                <p className="text-muted-foreground text-xs">自动汇总最近 20 条提交</p>
              </div>
            </div>
          </button>
        </div>
      </SettingsSection>

      <SettingsSection
        title="项目理念"
        description="高效交互、美观界面与稳定播放并重。"
        tone="cyan"
      >
        <div className="bg-muted/30 rounded-xl p-4">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="text-muted-foreground size-4" />
            <p className="text-sm font-medium">设计方向</p>
          </div>
          <p className="text-muted-foreground text-sm leading-6">
            项目持续围绕高效的 UX 交互、美观一致的 UI
            设计与稳定流畅的播放体验迭代，确保功能扩展时依然保持易用、清晰和可靠。
          </p>
        </div>
      </SettingsSection>

      <p className="text-muted-foreground text-center text-xs leading-6">
        遵循{' '}
        <a
          href={`${PROJECT.repository}/blob/main/LICENSE`}
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-4"
        >
          Apache License 2.0
        </a>{' '}
        开源协议。
      </p>

      <footer className="border-border/70 text-muted-foreground mt-1 border-t pt-4 text-center text-sm">
        © {currentYear} {PROJECT.name} · {PROJECT.owner}
      </footer>
    </SettingsPageShell>
  )
}
