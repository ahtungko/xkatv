import { useEffect, useRef, useState, type RefObject } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/shared/lib/utils'
import type { DetailTab } from './types'

interface TabIndicator {
  x: number
  width: number
  ready: boolean
}

interface DetailTabNavProps {
  tabListRef: RefObject<HTMLDivElement | null>
  tabItems: Array<{ key: DetailTab; label: string }>
  activeTab: DetailTab
  onTabChange: (tab: DetailTab) => void
  tabIndicator: TabIndicator
}

export function DetailTabNav({
  tabListRef,
  tabItems,
  activeTab,
  onTabChange,
}: DetailTabNavProps) {
  const navScrollRef = useRef<HTMLDivElement | null>(null)
  const [edgeHint, setEdgeHint] = useState({ left: false, right: false })

  useEffect(() => {
    const scrollEl = navScrollRef.current
    const listEl = tabListRef.current
    if (!scrollEl || !listEl) return

    const updateEdgeHint = () => {
      const overflow = scrollEl.scrollWidth > scrollEl.clientWidth + 1
      if (!overflow) {
        setEdgeHint(prev => (prev.left || prev.right ? { left: false, right: false } : prev))
        return
      }

      const maxScrollLeft = scrollEl.scrollWidth - scrollEl.clientWidth
      const nextLeft = scrollEl.scrollLeft > 2
      const nextRight = scrollEl.scrollLeft < maxScrollLeft - 2

      setEdgeHint(prev =>
        prev.left === nextLeft && prev.right === nextRight
          ? prev
          : { left: nextLeft, right: nextRight },
      )
    }

    updateEdgeHint()
    scrollEl.addEventListener('scroll', updateEdgeHint, { passive: true })
    window.addEventListener('resize', updateEdgeHint)

    const resizeObserver = new ResizeObserver(updateEdgeHint)
    resizeObserver.observe(scrollEl)
    resizeObserver.observe(listEl)

    return () => {
      scrollEl.removeEventListener('scroll', updateEdgeHint)
      window.removeEventListener('resize', updateEdgeHint)
      resizeObserver.disconnect()
    }
  }, [tabItems.length, tabListRef])

  return (
    <section className="relative mt-4 flex items-center justify-start px-2 sm:justify-center md:px-0">
      <div
        ref={navScrollRef}
        className="scrollbar-hide max-w-full overflow-x-auto rounded-full bg-card/60 p-1.5 backdrop-blur-xl border border-border/45 shadow-xs"
      >
        <div ref={tabListRef} className="relative flex min-w-max items-center gap-1">
          {tabItems.map(tab => {
            const isActive = activeTab === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                data-tab={tab.key}
                className={cn(
                  'relative z-10 shrink-0 whitespace-nowrap rounded-full px-4 py-1.5 text-xs sm:text-sm font-medium transition-colors duration-200 select-none',
                  isActive
                    ? 'text-primary-foreground font-semibold'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                )}
                onClick={() => onTabChange(tab.key)}
              >
                {isActive && (
                  <motion.div
                    layoutId="detail-tab-active-capsule"
                    className="absolute inset-0 -z-10 rounded-full bg-primary shadow-xs"
                    transition={{ type: 'spring', stiffness: 460, damping: 36 }}
                  />
                )}
                <span>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 移动端滚动边缘提示 */}
      <div
        className={`pointer-events-none absolute top-1 bottom-1 left-0 z-10 w-6 rounded-l-full bg-gradient-to-r from-background via-background/60 to-transparent transition-opacity duration-300 ease-out sm:hidden ${
          edgeHint.left ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        className={`pointer-events-none absolute top-1 bottom-1 right-0 z-10 w-6 rounded-r-full bg-gradient-to-l from-background via-background/60 to-transparent transition-opacity duration-300 ease-out sm:hidden ${
          edgeHint.right ? 'opacity-100' : 'opacity-0'
        }`}
      />
    </section>
  )
}
