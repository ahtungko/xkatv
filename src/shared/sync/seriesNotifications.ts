import { z } from 'zod'
import { syncClient } from './client'
import { useAuthStore } from '@/shared/store/authStore'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'
import { useSeriesUpdatesStore } from '@/features/favorites/store/seriesUpdatesStore'
import {
  useSeriesNotificationsStore,
  syncedNotificationView,
} from '@/features/favorites/store/seriesNotificationsStore'
import {
  notificationIdentity,
  notificationNeedsSync,
  remoteNotificationSchema,
  validNotificationIdentity,
} from '@/features/favorites/lib/seriesNotificationSync'

let generation = 0
let busy = false
let applying = false
let timer: ReturnType<typeof setTimeout> | undefined
let lastNotificationsSyncAt = 0
const NOTIFICATIONS_COOLDOWN_MS = 5 * 60 * 1000

const identity = () => {
  if (usePrivateModeStore.getState().isPrivateMode) return null
  const { account, session } = useAuthStore.getState()
  return account && session?.user.id === account.id
    ? { id: account.id, token: session.access_token }
    : null
}

function applyViews(owner: string) {
  const refresh = new Map<string, string>()
  useSeriesUpdatesStore.setState(state => {
    if (state.ownerId !== owner) return state
    let changed = false
    const entries = Object.fromEntries(
      Object.entries(state.entries).map(([key, update]) => {
        const notification = syncedNotificationView(owner, key, update)
        if (JSON.stringify(notification) === JSON.stringify(update.notification))
          return [key, update]
        changed = true
        if (
          notification?.unreadEpisodes.some(
            number => !update.episodes?.some(episode => episode.number === number),
          )
        )
          refresh.set(key, update.bindingKey ?? 'auto')
        return [key, { ...update, notification }]
      }),
    )
    return changed ? { entries } : state
  })
  // A remote observation can be newer than this device's 30-minute cache.
  // Refresh only the affected resource, once per changed reminder.
  if (navigator.onLine)
    for (const [key, binding] of refresh)
      useSeriesUpdatesStore.getState().refreshOne(owner, key, binding)
}

export async function syncSeriesNotificationsNow() {
  const client = syncClient
  const session = identity()
  if (!client || !session || busy) return
  if (!navigator.onLine) {
    useSeriesNotificationsStore.setState({
      syncOwner: session.id,
      status: '离线 · 提醒已保存在本机',
      error: null,
    })
    return
  }
  const run = generation
  const current = () => run === generation && identity()?.id === session.id
  busy = true
  try {
    applying = true
    try {
      await useSeriesNotificationsStore.persist.rehydrate()
    } finally {
      applying = false
    }
    if (!current()) return
    const cache = useSeriesUpdatesStore.getState()
    applying = true
    try {
      if (cache.ownerId === session.id)
        for (const key of cache.activeKeys) {
          const update = cache.entries[key]
          if (update)
            useSeriesNotificationsStore
              .getState()
              .observe(session.id, key, { ...update, error: undefined })
        }
      applyViews(session.id)
    } finally {
      applying = false
    }
    const records = useSeriesNotificationsStore.getState().accounts[session.id] ?? {}
    const keys = new Set(
      Object.values(records)
        .filter(notificationNeedsSync)
        .map(row => row.resourceKey),
    )
    if (cache.ownerId === session.id)
      for (const key of cache.activeKeys) {
        const update = cache.entries[key]
        if (!update) continue
        const resource = notificationIdentity(key, update)
        if (resource) keys.add(resource.resourceKey)
      }
    if (!keys.size) {
      useSeriesNotificationsStore.setState({
        syncOwner: session.id,
        status: '等待追更检查结果',
        error: null,
      })
      return
    }
    useSeriesNotificationsStore.setState({
      syncOwner: session.id,
      status: '提醒同步中…',
      error: null,
    })
    const resources = [...keys]
    for (let offset = 0; offset < resources.length; offset += 25) {
      const batch = resources.slice(offset, offset + 25)
      const changes = batch
        .map(key => records[key])
        .filter(row => row && notificationNeedsSync(row))
        .map(row => ({
          resourceKey: row.resourceKey,
          trackingKey: row.trackingKey,
          bindingKey: row.bindingKey,
          sourceCode: row.sourceCode,
          vodId: row.vodId,
          resourceSignature: row.resourceSignature,
          knownEpisodes: row.knownEpisodes,
          baselineEpisodes: row.baselineEpisodes,
          readEpisodes: row.readEpisodes.filter(number => !row.syncedReadEpisodes.includes(number)),
        }))
      const { data, error } = await client
        .rpc('sync_series_notifications', { p_changes: changes, p_resource_keys: batch })
        .setHeader('Authorization', `Bearer ${session.token}`)
      if (!current()) return
      if (error)
        throw new Error(
          error.code === 'PGRST202' || error.code === '42P01'
            ? '请先在 Supabase 执行 202610190001_series_notifications.sql 迁移'
            : error.message,
        )
      const remote = z.array(remoteNotificationSchema).parse(data)
      if (
        remote.some(
          row =>
            !validNotificationIdentity(row) ||
            !batch.includes(row.resourceKey) ||
            !row.knownEpisodes.length,
        )
      )
        throw new Error('提醒同步返回了无效的资源数据')
      if (changes.some(change => !remote.some(row => row.resourceKey === change.resourceKey)))
        throw new Error('提醒同步未确认本次上传，请重试')
      applying = true
      try {
        useSeriesNotificationsStore.getState().applyRemote(session.id, remote)
        applyViews(session.id)
      } finally {
        applying = false
      }
    }
    if (current()) {
      lastNotificationsSyncAt = Date.now()
      useSeriesNotificationsStore.setState({
        syncOwner: session.id,
        status: Object.values(
          useSeriesNotificationsStore.getState().accounts[session.id] ?? {},
        ).some(notificationNeedsSync)
          ? '有待同步的提醒'
          : '提醒已同步',
        error: null,
      })
    }
  } catch (error) {
    if (current())
      useSeriesNotificationsStore.setState({
        syncOwner: session.id,
        status: '提醒同步待重试',
        error: error instanceof Error ? error.message : '提醒同步失败',
      })
  } finally {
    if (run === generation) busy = false
  }
}

export function startSeriesNotificationSync(): () => void {
  if (!syncClient) return () => {}
  const schedule = (delay = 10000) => {
    if (!identity() || timer) return
    timer = setTimeout(() => {
      timer = undefined
      void syncSeriesNotificationsNow()
    }, delay)
  }
  const changeSession = () => {
    generation++
    busy = false
    if (timer) clearTimeout(timer)
    timer = undefined
    useSeriesNotificationsStore.setState({
      syncOwner: identity()?.id ?? null,
      status: identity() ? '准备同步提醒' : '未登录',
      error: null,
    })
    schedule(0)
  }
  const auth = useAuthStore.subscribe((state, previous) => {
    if (state.session !== previous.session || state.account?.id !== previous.account?.id)
      changeSession()
  })
  const privateMode = usePrivateModeStore.subscribe((state, previous) => {
    if (state.isPrivateMode !== previous.isPrivateMode) changeSession()
  })
  const receipts = useSeriesNotificationsStore.subscribe((state, previous) => {
    if (!applying && state.accounts !== previous.accounts) {
      const owner = identity()?.id
      if (owner && !busy && Object.values(state.accounts[owner] ?? {}).some(notificationNeedsSync))
        useSeriesNotificationsStore.setState({ syncOwner: owner, status: '有待同步的提醒' })
      schedule()
    }
  })
  const checks = useSeriesUpdatesStore.subscribe((state, previous) => {
    if (state.ownerId !== previous.ownerId || state.activeKeys !== previous.activeKeys) schedule()
  })
  const flush = () => {
    void syncSeriesNotificationsNow()
  }
  const flushIfCooldownExpired = () => {
    if (Date.now() - lastNotificationsSyncAt >= NOTIFICATIONS_COOLDOWN_MS) {
      void syncSeriesNotificationsNow()
    }
  }
  const visible = () => {
    if (document.visibilityState === 'visible') flushIfCooldownExpired()
  }
  const onFocus = () => {
    flushIfCooldownExpired()
  }
  const storage = (event: StorageEvent) => {
    if (event.key === 'xkatv-series-notifications') {
      void Promise.resolve(useSeriesNotificationsStore.persist.rehydrate())
        .then(() => {
          const owner = identity()?.id
          if (owner) applyViews(owner)
          schedule()
        })
        .catch(error =>
          useSeriesNotificationsStore.setState({
            error: String(error),
            status: '提醒缓存读取失败',
          }),
        )
    }
  }
  window.addEventListener('focus', onFocus)
  window.addEventListener('online', flush)
  window.addEventListener('storage', storage)
  document.addEventListener('visibilitychange', visible)
  changeSession()
  return () => {
    generation++
    busy = false
    auth()
    privateMode()
    receipts()
    checks()
    if (timer) clearTimeout(timer)
    timer = undefined
    window.removeEventListener('focus', onFocus)
    window.removeEventListener('online', flush)
    window.removeEventListener('storage', storage)
    document.removeEventListener('visibilitychange', visible)
  }
}
