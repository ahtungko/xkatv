import { useLocation } from 'react-router'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroupLabel,
  SidebarHeader,
  useSidebar,
} from '@/shared/components/ui/sidebar'
import { NavLink } from 'react-router'
import { motion } from 'framer-motion'
import { Home, Search, Star, History, Settings, UserRound, Users, EyeOff, Tv } from 'lucide-react'
import { toast } from 'sonner'
import { XkaLogo } from '@/shared/components/icons'
import { useVersionStore, usePrivateModeStore } from '../store'
import { useAuthStore } from '@/shared/store/authStore'
import { useSettingStore } from '@/shared/store/settingStore'
import { cn } from '@/shared/lib'
import { PROJECT } from '@/shared/config/project'

interface SideBarProps {
  className?: string
  collapsibleMode?: 'icon' | 'offcanvas'
  hidden?: boolean
  enableScrollAnimation?: boolean
}

export default function SideBar({
  className,
  collapsibleMode = 'icon',
  hidden = false,
  enableScrollAnimation = false,
}: SideBarProps) {
  const location = useLocation()
  const { isMobile, setOpenMobile } = useSidebar()
  const isAdmin = useAuthStore(state => state.account?.role === 'admin')
  const isLiveStreamEnabled = useSettingStore(state => state.system.isLiveStreamEnabled)
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  const togglePrivateMode = usePrivateModeStore(state => state.togglePrivateMode)

  const handleNavLinkClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  // Menu items.
  const items = {
    header: [],
    content: [
      {
        title: '主页',
        url: '/',
        icon: Home,
      },
      {
        title: '搜索中心',
        url: '/search',
        icon: Search,
      },
      {
        title: '电视直播',
        url: '/live',
        icon: Tv,
      },
      {
        title: '收藏夹',
        url: '/favorites',
        icon: Star,
      },
      {
        title: '观看记录',
        url: '/history',
        icon: History,
      },
    ],
    footer: isAdmin
      ? [
          {
            title: '设置',
            url: '/settings',
            icon: Settings,
          },
        ]
      : [{ title: '播放设置', url: '/settings/playback', icon: Settings }],
  }
  // 获取版本信息
  const { currentVersion } = useVersionStore()
  return (
    <Sidebar
      className={cn(
        enableScrollAnimation
          ? '[&_[data-slot=sidebar-gap]]:transition-[width] [&_[data-slot=sidebar-gap]]:duration-220 [&_[data-slot=sidebar-gap]]:ease-out'
          : '[&_[data-slot=sidebar-gap]]:transition-none',
        '[&_[data-slot=sidebar-container]]:translate-x-0 [&_[data-slot=sidebar-container]]:transform-gpu [&_[data-slot=sidebar-container]]:opacity-100 [&_[data-slot=sidebar-container]]:will-change-[transform,opacity,top]',
        hidden && 'pointer-events-none [&_[data-slot=sidebar-container]]:-translate-x-full [&_[data-slot=sidebar-container]]:opacity-0 [&_[data-slot=sidebar-gap]]:w-0 [&_[data-slot=sidebar-inner]]:opacity-0',
        className,
      )}
      inert={hidden ? true : undefined}
      collapsible={collapsibleMode}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <NavLink to="/" onClick={handleNavLinkClick}>
                <XkaLogo />
                <div className="flex flex-col gap-0.5 leading-none">
                  <span className="font-semibold">{PROJECT.name}</span>
                  <span className="text-muted-foreground text-xs">v{currentVersion}</span>
                </div>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>导航</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.content
                .filter(item => {
                  if (isPrivateMode && (item.url === '/history' || item.url === '/favorites')) return false
                  if (item.url === '/live' && !isLiveStreamEnabled && !isAdmin) return false
                  return true
                })
                .map(item => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <NavLink
                      to={item.url}
                      onClick={handleNavLinkClick}
                      className="group data-[mactive=true]:text-sidebar-primary-foreground relative h-10 overflow-visible"
                      data-mactive={location.pathname === item.url}
                    >
                      {location.pathname === item.url && (
                        <motion.div
                          layoutId="sidebar-selected-item"
                          className="bg-sidebar-primary absolute top-0 left-0 h-full w-full rounded-md"
                          transition={{
                            type: 'spring',
                            stiffness: 300,
                            damping: 30,
                          }}
                        />
                      )}
                      <item.icon className="z-1" />
                      <span className="z-1">{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={location.pathname === '/account'}
              tooltip="我的账号"
            >
              <NavLink to="/account" onClick={handleNavLinkClick}>
                <UserRound />
                <span>我的账号</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={location.pathname === '/admin'}
                tooltip="管理员中心"
              >
                <NavLink to="/admin" onClick={handleNavLinkClick}>
                  <Users />
                  <span>管理员中心</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => {
                const next = togglePrivateMode()
                if (next) {
                  toast.info('已开启无痕模式：不保存站内记录；浏览器和视频源仍可能记录访问')
                } else {
                  toast.info('已退出无痕模式，恢复正常记录')
                }
              }}
              tooltip={isPrivateMode ? '退出无痕模式' : '开启无痕模式'}
              className={cn(
                isPrivateMode && 'text-purple-400 font-medium hover:text-purple-300',
              )}
            >
              <EyeOff className={cn(isPrivateMode && 'text-purple-400')} />
              <span className="flex w-full items-center justify-between">
                <span>无痕模式</span>
                <span
                  className={cn(
                    'text-xs',
                    isPrivateMode ? 'text-purple-400 font-semibold' : 'text-muted-foreground',
                  )}
                >
                  {isPrivateMode ? '已开启' : '已关闭'}
                </span>
              </span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          {items.footer.map(item => (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton asChild>
                <NavLink to={item.url} onClick={handleNavLinkClick}>
                  <item.icon />
                  <span className="flex w-full items-center justify-between">
                    <span>{item.title}</span>
                    <span className="text-muted-foreground text-xs">v{currentVersion}</span>
                  </span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
