import { NavLink, useLocation } from 'react-router'
import { Home, Compass, Bookmark, History } from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '@/shared/lib'
import { usePrivateModeStore } from '@/shared/store'

const tabs = [
  { title: '首页', path: '/', icon: Home },
  { title: '探索', path: '/search', icon: Compass },
  { title: '追剧', path: '/favorites', icon: Bookmark },
  { title: '历史', path: '/history', icon: History },
]

export default function MobileTabBar() {
  const location = useLocation()
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)

  // Hide mobile tab bar on player page to maximize screen space
  if (location.pathname.startsWith('/play/')) {
    return null
  }

  const visibleTabs = isPrivateMode ? tabs.filter(tab => tab.path !== '/history' && tab.path !== '/favorites') : tabs

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-border/40 bg-background/85 backdrop-blur-2xl md:hidden">
      <div className={cn("grid h-full items-center", visibleTabs.length === 2 ? "grid-cols-2" : "grid-cols-4")}>
        {visibleTabs.map(tab => {
          const isActive =
            tab.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(tab.path)
          const Icon = tab.icon

          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={cn(
                'relative flex flex-col items-center justify-center gap-1 py-1 text-xs transition-colors',
                isActive
                  ? 'text-foreground font-semibold'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon
                className={cn(
                  'size-5 transition-transform duration-200',
                  isActive ? 'scale-110 text-red-500' : 'text-muted-foreground',
                )}
              />
              <span className="text-[11px]">{tab.title}</span>
              {isActive && (
                <motion.span
                  layoutId="mobile-tab-indicator"
                  className="absolute bottom-1 size-1 rounded-full bg-red-500"
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
