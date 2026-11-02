import { mainLayoutRouteKey } from '@/shared/lib/routes'
import Navigation from '@/shared/components/Navigation'
import { SidebarProvider, SidebarInset } from '@/shared/components/ui/sidebar'
import SideBar from '@/shared/components/SideBar'
import MobileTabBar from '@/shared/components/MobileTabBar'
import { ScrollArea } from '@/shared/components/ui/scroll-area'
import { CustomAnimatedOutlet } from '@/shared/components/AnimatedOutlet'
import BackToTopButton from '@/shared/components/BackToTopButton'
import { useEffect, useState } from 'react'
import UpdateModalHost from '@/shared/components/UpdateModalHost'
import { useVersionStore } from '@/shared/store/versionStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { useApiStore } from '@/shared/store/apiStore'
import { useSubscriptionStore } from '@/shared/store/subscriptionStore'
import { useSubscriptionAutoRefresh } from '@/shared/hooks/useSubscriptionAutoRefresh'
import { useEnvSourcesAutoRefresh } from '@/shared/hooks/useEnvSourcesAutoRefresh'
import { useScrollChromeVisibility } from '@/shared/hooks'
import { useLocation } from 'react-router'
import { getInitialContentConfigId } from '@/shared/config/runtimeEnv'
import { useSeriesUpdateChecker } from '@/features/favorites/hooks/useSeriesUpdateChecker'
import { GlobalWatchPartyPill } from '@/features/player/components'
import { useWatchPartyStore } from '@/features/player/store/watchPartyStore'

export default function MainLayout() {
  const hasNewVersion = useVersionStore(state => state.hasNewVersion)
  const setShowUpdateModal = useVersionStore(state => state.setShowUpdateModal)
  const isUpdateLogEnabled = useSettingStore(state => state.system.isUpdateLogEnabled)
  const isScrollChromeAnimationEnabled = useSettingStore(
    state => state.system.isScrollChromeAnimationEnabled,
  )
  const initializeEnvSources = useApiStore(state => state.initializeEnvSources)
  const initializeEnvSubscriptions = useSubscriptionStore(state => state.initializeEnvSubscriptions)
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isChromeVisible = useScrollChromeVisibility({
    enabled: isScrollChromeAnimationEnabled,
    scrollRootSelector: '[data-main-scroll-area]',
    resetKey: location.pathname,
  })

  // 视频源与订阅源自动更新
  useSubscriptionAutoRefresh()
  useEnvSourcesAutoRefresh()
  useSeriesUpdateChecker()

  const restoreHostSessionIfNeeded = useWatchPartyStore(
    state => state.restoreHostSessionIfNeeded,
  )

  useEffect(() => {
    void restoreHostSessionIfNeeded()
  }, [restoreHostSessionIfNeeded])

  // 初始化逻辑 (从 MyRouter 迁移)
  useEffect(() => {
    const initialContentConfigId = getInitialContentConfigId()
    const needsInitialization =
      localStorage.getItem('initialContentConfigId') !== initialContentConfigId
    const initialize = async () => {
      await initializeEnvSources()
      if (needsInitialization) {
        await initializeEnvSubscriptions()
        localStorage.setItem('initialContentConfigId', initialContentConfigId)
      }
    }
    void initialize()
  }, [initializeEnvSources, initializeEnvSubscriptions])

  // 版本更新检查
  useEffect(() => {
    if (hasNewVersion() && isUpdateLogEnabled) {
      setShowUpdateModal(true)
    }
  }, [hasNewVersion, setShowUpdateModal, isUpdateLogEnabled])

  return (
    <SidebarProvider
      open={sidebarOpen}
      onOpenChange={setSidebarOpen}
      style={
        {
          '--sidebar-top': isChromeVisible ? '4rem' : '0rem',
        } as React.CSSProperties
      }
      className="flex h-dvh flex-col overflow-hidden bg-background text-foreground"
    >
      <Navigation
        hidden={!isChromeVisible}
        enableScrollAnimation={isScrollChromeAnimationEnabled}
      />
      <div className="flex flex-1 overflow-hidden">
        <SideBar
          collapsibleMode="offcanvas"
          hidden={!isChromeVisible}
          enableScrollAnimation={isScrollChromeAnimationEnabled}
        />
        <SidebarInset className="relative flex h-full flex-1 flex-col overflow-hidden bg-background">
          <ScrollArea data-main-scroll-area className="h-full w-full">
            <div className="mx-auto min-h-full max-w-[1920px] px-3 py-3 sm:px-6 sm:py-5 lg:px-8 pb-24 md:pb-8">
              <CustomAnimatedOutlet routeKey={mainLayoutRouteKey} />
              <UpdateModalHost />
            </div>
          </ScrollArea>
          <BackToTopButton scrollRootSelector="[data-main-scroll-area]" />
        </SidebarInset>
      </div>
      <MobileTabBar />
      <GlobalWatchPartyPill />
    </SidebarProvider>
  )
}
