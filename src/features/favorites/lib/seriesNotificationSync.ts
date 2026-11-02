import { z } from 'zod'
import { normalizeVodId } from '@xkatv/cms-core'
import type { SeriesUpdate } from './seriesTracking'

const episodes = z.array(z.number().int().min(1).max(9999)).max(9999)
const identity = {
  resourceKey: z.string().min(1).max(8192),
  trackingKey: z.string().min(1).max(2048),
  bindingKey: z.string().min(1).max(2048),
  sourceCode: z.string().min(1).max(512),
  vodId: z
    .string()
    .regex(/^[\w-]+$/)
    .max(512),
  resourceSignature: z.string().max(128),
}
export const remoteNotificationSchema = z.object({
  ...identity,
  knownEpisodes: episodes,
  readEpisodes: episodes,
})
export const localNotificationSchema = remoteNotificationSchema.extend({
  baselineEpisodes: episodes,
  syncedKnownEpisodes: episodes,
  syncedReadEpisodes: episodes,
})
export type RemoteSeriesNotification = z.infer<typeof remoteNotificationSchema>
export type LocalSeriesNotification = z.infer<typeof localNotificationSchema>
export type NotificationAccounts = Record<string, Record<string, LocalSeriesNotification>>

export const unionEpisodes = (...arrays: number[][]) =>
  [...new Set(arrays.flat())].sort((a, b) => a - b)
export function notificationIdentity(trackingKey: string, update: SeriesUpdate) {
  const vodId = normalizeVodId(update.vodId)
  if (!update.sourceCode || vodId === null || !update.checkedAt || !update.episodes?.length)
    return null
  const data = {
    trackingKey,
    bindingKey: normalizeBindingKey(update.bindingKey ?? 'auto'),
    sourceCode: update.sourceCode,
    vodId,
    resourceSignature: update.resourceSignature ?? '',
  }
  const resourceKey = JSON.stringify([
    data.trackingKey,
    data.bindingKey,
    data.sourceCode,
    data.vodId,
    data.resourceSignature,
  ])
  return { ...data, resourceKey }
}
export function validNotificationIdentity(row: RemoteSeriesNotification): boolean {
  return (
    row.resourceKey ===
      JSON.stringify([
        row.trackingKey,
        row.bindingKey,
        row.sourceCode,
        row.vodId,
        row.resourceSignature,
      ]) && row.readEpisodes.every(number => row.knownEpisodes.includes(number))
  )
}
export function notificationNeedsSync(row: LocalSeriesNotification): boolean {
  return (
    !row.syncedKnownEpisodes.length ||
    row.knownEpisodes.some(number => !row.syncedKnownEpisodes.includes(number)) ||
    row.readEpisodes.some(number => !row.syncedReadEpisodes.includes(number))
  )
}
export function notificationView(row: LocalSeriesNotification) {
  const read = new Set(
    row.syncedKnownEpisodes.length
      ? row.readEpisodes
      : unionEpisodes(row.baselineEpisodes, row.readEpisodes),
  )
  return {
    knownEpisodes: row.knownEpisodes,
    unreadEpisodes: row.knownEpisodes.filter(number => !read.has(number)),
  }
}
export function mergeNotificationAccounts(
  a: NotificationAccounts,
  b: NotificationAccounts,
): NotificationAccounts {
  const result: NotificationAccounts = Object.assign(Object.create(null), a)
  for (const [owner, rows] of Object.entries(b)) {
    const merged = { ...result[owner] }
    for (const [key, right] of Object.entries(rows)) {
      const left = merged[key]
      merged[key] = mergeNotificationRows(left, right)
    }
    result[owner] = merged
  }
  return result
}

function mergeNotificationRows(
  left: LocalSeriesNotification | undefined,
  right: LocalSeriesNotification,
): LocalSeriesNotification {
  return !left
    ? right
    : {
        ...left,
        knownEpisodes: unionEpisodes(left.knownEpisodes, right.knownEpisodes),
        readEpisodes: unionEpisodes(left.readEpisodes, right.readEpisodes),
        // Before the first server baseline, retain the smaller shared baseline.
        baselineEpisodes: left.baselineEpisodes.filter(number =>
          right.baselineEpisodes.includes(number),
        ),
        syncedKnownEpisodes: unionEpisodes(left.syncedKnownEpisodes, right.syncedKnownEpisodes),
        syncedReadEpisodes: unionEpisodes(left.syncedReadEpisodes, right.syncedReadEpisodes),
      }
}

function normalizeBindingKey(value: string): string {
  try {
    const binding: unknown = JSON.parse(value)
    if (Array.isArray(binding) && binding.length === 2 && typeof binding[0] === 'string') {
      const vodId = normalizeVodId(binding[1])
      if (vodId !== null) return JSON.stringify([binding[0], vodId])
    }
  } catch {
    // 'auto' and opaque binding keys are already valid identities.
  }
  return value
}

const storedNotificationSchema = localNotificationSchema.extend({
  vodId: z.union([
    identity.vodId,
    z.number().int().min(Number.MIN_SAFE_INTEGER).max(Number.MAX_SAFE_INTEGER),
  ]),
})
const dictionarySchema = z.record(z.string(), z.unknown())

export function parseNotificationAccounts(value: unknown): NotificationAccounts {
  const accounts: NotificationAccounts = Object.create(null)
  const parsedAccounts = dictionarySchema.safeParse(value)
  if (!parsedAccounts.success) return accounts
  for (const [owner, value] of Object.entries(parsedAccounts.data)) {
    if (!owner || owner.length > 128) continue
    const parsedRows = dictionarySchema.safeParse(value)
    if (!parsedRows.success) continue
    const rows: Record<string, LocalSeriesNotification> = Object.create(null)
    for (const [key, value] of Object.entries(parsedRows.data)) {
      const parsed = storedNotificationSchema.safeParse(value)
      if (!parsed.success) continue
      const row = parsed.data
      // Validate the original identity before migrating numeric IDs and composite keys.
      if (
        key !== row.resourceKey ||
        row.resourceKey !==
          JSON.stringify([
            row.trackingKey,
            row.bindingKey,
            row.sourceCode,
            row.vodId,
            row.resourceSignature,
          ]) ||
        row.readEpisodes.some(number => !row.knownEpisodes.includes(number))
      )
        continue
      const vodId = normalizeVodId(row.vodId)
      if (vodId === null) continue
      const bindingKey = normalizeBindingKey(row.bindingKey)
      const resourceKey = JSON.stringify([
        row.trackingKey,
        bindingKey,
        row.sourceCode,
        vodId,
        row.resourceSignature,
      ])
      const changed = resourceKey !== row.resourceKey
      const migrated = {
        ...row,
        bindingKey,
        vodId,
        resourceKey,
        // Server acknowledgements belong to the old key. Re-upload under the
        // canonical key using actual receipts, not a stale device's implicit baseline.
        baselineEpisodes:
          changed && row.syncedKnownEpisodes.length ? row.readEpisodes : row.baselineEpisodes,
        syncedKnownEpisodes: changed ? [] : row.syncedKnownEpisodes,
        syncedReadEpisodes: changed ? [] : row.syncedReadEpisodes,
      }
      rows[resourceKey] = mergeNotificationRows(rows[resourceKey], migrated)
    }
    accounts[owner] = rows
  }
  return accounts
}
