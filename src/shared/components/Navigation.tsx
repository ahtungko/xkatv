import { Navbar, NavbarBrand, NavbarContent } from '@/shared/components/ui/navbar'
import { PROJECT } from '@/shared/config/project'
import { XkaLogo } from '@/shared/components/icons'
import { NavLink, useLocation } from 'react-router'
import { useState } from 'react'
import { Moon, Sun, Laptop } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { Button } from '@/shared/components/ui/button'
import { ThemeToggle, useThemeState } from './theme'
import SearchBox from './SearchBox'
import AccountMenu from './AccountMenu'
import { PrivateModeToggle } from './PrivateModeToggle'
import { usePrivateModeStore } from '@/shared/store'
import { cn } from '@/shared/lib'
import { AnnouncementCenter } from '@/features/announcements/AnnouncementCenter'
import { useVersionStore } from '@/shared/store/versionStore'

interface NavigationProps {
  hidden?: boolean
  enableScrollAnimation?: boolean
}

const navLinks = [
  { title: '首页', path: '/' },
  { title: '探索', path: '/search' },
  { title: '追剧', path: '/favorites' },
  { title: '历史', path: '/history' },
]

export default function Navigation({
  hidden = false,
  enableScrollAnimation = false,
}: NavigationProps) {
  const { mode } = useThemeState()
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false)
  const location = useLocation()
  const showUpdateModal = useVersionStore(state => state.showUpdateModal)

  // 在搜索页面隐藏导航栏搜索框
  const isSearchPage = location.pathname === '/search'
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  const visibleNavLinks = isPrivateMode ? navLinks.filter(link => link.path !== '/history' && link.path !== '/favorites') : navLinks

  return (
    <div
      className={cn(
        'sticky top-0 z-50 w-full overflow-hidden',
        enableScrollAnimation
          ? 'transition-[height] duration-220 ease-out motion-reduce:transition-none'
          : 'transition-none',
      )}
      style={{ height: hidden ? '0rem' : '4rem' }}
    >
      <div
        className={cn(
          'flex w-full justify-center',
          enableScrollAnimation
            ? 'transform-gpu transition-[opacity,transform] duration-220 ease-out will-change-[transform,opacity] motion-reduce:transition-none'
            : 'transition-none',
          hidden ? 'pointer-events-none -translate-y-2 opacity-0' : 'translate-y-0 opacity-100',
        )}
      >
        <Navbar
          className={cn(
            enableScrollAnimation && 'transition-[backdrop-filter,box-shadow] duration-200',
            enableScrollAnimation && hidden && 'shadow-none backdrop-blur-none',
          )}
        >
          {/* Logo 和主导航 - 移动端搜索模式下隐藏 */}
          <NavbarBrand
            className={cn(
              '!flex-none items-center gap-2 sm:gap-4',
              enableScrollAnimation
                ? 'transition-[opacity,transform] duration-220 ease-out'
                : 'transition-none',
              isMobileSearchOpen
                ? 'pointer-events-none -translate-x-4 opacity-0 sm:pointer-events-auto sm:translate-x-0 sm:opacity-100'
                : '',
            )}
          >
            <NavLink to="/" className="flex items-center gap-2">
              <XkaLogo />
              <p className="text-foreground text-lg font-bold tracking-tight">{PROJECT.name}</p>
            </NavLink>

            {/* Desktop Apple-style floating nav pills */}
            <nav className="hidden md:flex items-center gap-1 ml-3 lg:ml-6">
              {visibleNavLinks.map(link => {
                const isActive =
                  link.path === '/'
                    ? location.pathname === '/'
                    : location.pathname.startsWith(link.path)

                return (
                  <NavLink
                    key={link.path}
                    to={link.path}
                    className={cn(
                      'relative px-3.5 py-1.5 text-sm font-medium transition-colors rounded-full',
                      isActive
                        ? 'text-foreground font-semibold'
                        : 'text-muted-foreground hover:text-foreground hover:bg-accent/40',
                    )}
                  >
                    {isActive && (
                      <motion.span
                        layoutId="nav-active-pill"
                        className="absolute inset-0 rounded-full bg-accent/80 border border-border/50 shadow-xs"
                        transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                      />
                    )}
                    <span className="relative z-10">{link.title}</span>
                  </NavLink>
                )
              })}
            </nav>
          </NavbarBrand>

          <NavbarContent justify="center" className="gap-2">
            <div className="flex-1" />

            {/* 搜索框组件 - 搜索页面时隐藏 */}
            <AnimatePresence mode="wait">
              {!isSearchPage && (
                <motion.div
                  key="navbar-search"
                  layoutId="main-search-box"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="flex flex-auto items-center"
                >
                  <SearchBox onMobileSearchChange={setIsMobileSearchOpen} />
                </motion.div>
              )}
            </AnimatePresence>

            <div
              className={cn(
                'flex flex-1 justify-end gap-2 sm:gap-1.5 items-center',
                enableScrollAnimation
                  ? 'transition-[opacity,transform] duration-220 ease-out'
                  : 'transition-none',
                isMobileSearchOpen
                  ? 'pointer-events-none translate-x-4 opacity-0 sm:pointer-events-auto sm:translate-x-0 sm:opacity-100'
                  : '',
              )}
            >
              <AnnouncementCenter
                deferred={location.pathname.startsWith('/play/') || showUpdateModal}
              />
              <PrivateModeToggle />
              <ThemeToggle>
                <Button size="icon" variant="ghost" className="size-8 rounded-full">
                  {mode === 'dark' && <Moon className="size-4" />}
                  {mode === 'light' && <Sun className="size-4" />}
                  {mode === 'system' && <Laptop className="size-4" />}
                </Button>
              </ThemeToggle>
              <AccountMenu />
            </div>
          </NavbarContent>
        </Navbar>
      </div>
    </div>
  )
}
