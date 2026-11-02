import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { ArrowLeft } from 'lucide-react'
import AnnouncementAdmin from '@/features/announcements/AnnouncementAdmin'
import { Button } from '@/shared/components/ui/button'
import { UnderlineTabs } from '@/shared/components/common/UnderlineTabs'

import { adminModules as modules } from './admin-routes'

type AdminTab = (typeof modules)[number]['key']

export default function AdminView() {
  const navigate = useNavigate()
  const location = useLocation()
  const pathname = location.pathname.replace(/\/+$/, '')
  const activeTab: AdminTab =
    modules.find(module => module.path === pathname)?.key || 'announcements'
  const announcementActive = pathname === '/admin/announcements'
  const [announcementOpened, setAnnouncementOpened] = useState(announcementActive)

  useEffect(() => {
    if (announcementActive) setAnnouncementOpened(true)
  }, [announcementActive])

  function selectTab(nextTab: AdminTab) {
    if (nextTab === activeTab) return
    const params = new URLSearchParams(location.search)
    // Preserve account filters; module navigation resets pagination and details.
    for (const key of ['tab', 'view', 'id', 'listPage', 'page']) params.delete(key)
    navigate({ pathname: `/admin/${nextTab}`, search: params.toString() })
  }

  return (
    <div className="min-h-[90vh] pb-8">
      <header className="border-border/40 bg-background/80 sticky top-0 z-20 border-b backdrop-blur-xl">
        <div className="py-1.5 md:py-3">
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 px-2 text-xs md:h-9 md:px-3 md:text-sm"
              onClick={() => navigate('/')}
            >
              <ArrowLeft />
              返回
            </Button>
            <div className="min-w-0 flex-1 text-right md:flex-none md:text-left">
              <h1 className="truncate text-base font-bold md:text-xl">管理员中心</h1>
              <p className="text-muted-foreground hidden text-xs md:block">
                管理账号、站内公告与操作记录
              </p>
            </div>
            <nav
              aria-label="管理员功能"
              className="order-3 w-full md:order-none md:ml-auto md:flex md:w-[min(58vw,760px)] md:justify-end md:pr-3"
            >
              <UnderlineTabs
                options={modules.map(module => ({
                  key: module.key,
                  label: (
                    <>
                      <span className={`inline-block size-1.5 rounded-full ${module.color}`} />
                      <span>{module.name}</span>
                    </>
                  ),
                  indicatorClassName: module.color,
                }))}
                activeKey={activeTab}
                onChange={selectTab}
                layoutId="admin-tab-underline"
                listClassName="border-b border-transparent"
                leftEdgeClassName="from-sidebar via-sidebar/72 to-transparent"
                rightEdgeClassName="from-sidebar via-sidebar/72 to-transparent"
              />
            </nav>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-0 pt-2 md:px-4 md:pt-4">
        <Outlet />
        {(announcementOpened || announcementActive) && (
          <section aria-label="站内公告" hidden={!announcementActive}>
            <AnnouncementAdmin />
          </section>
        )}
      </main>
    </div>
  )
}
