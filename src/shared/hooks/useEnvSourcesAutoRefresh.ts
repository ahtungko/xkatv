import { useEffect, useRef } from 'react'
import { useApiStore } from '@/shared/store/apiStore'

/**
 * 环境变量视频源每日自动对齐 Hook
 * 专为长期不关机的设备（如 TV 盒子或常开标签页）设计：
 * 每天仅在跨过午夜（00:00）时单次定时触发一次，无高频轮询，无唤醒监听。
 */
export function useEnvSourcesAutoRefresh() {
  const initializeEnvSources = useApiStore(state => state.initializeEnvSources)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const scheduleNextMidnightCheck = () => {
      const now = new Date()
      // 计算距离明天凌晨 00:00:10 的毫秒数
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 10)
      const delay = Math.max(1000, tomorrow.getTime() - now.getTime())

      timerRef.current = setTimeout(() => {
        void initializeEnvSources()
        scheduleNextMidnightCheck()
      }, delay)
    }

    scheduleNextMidnightCheck()

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [initializeEnvSources])
}
