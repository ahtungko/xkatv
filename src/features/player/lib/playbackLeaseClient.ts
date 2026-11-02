import { syncClient } from '@/shared/sync/client'
import { useAuthStore } from '@/shared/store/authStore'
import { playbackReplySchema, type LeaseRequest } from './playbackLease'

function getTabPlayerId(): string {
  try {
    const key = 'xkatv_playback_player_id'
    let id = sessionStorage.getItem(key)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(key, id)
    }
    return id
  } catch {
    return crypto.randomUUID()
  }
}

export function playbackLeaseClient(
  mediaKey: string,
  title: string,
  privateMode: boolean | (() => boolean) = false,
) {
  const isPrivate = () => (typeof privateMode === 'function' ? privateMode() : privateMode)
  const privateMediaKey = `private:${crypto.randomUUID()}`
  const player = getTabPlayerId()
  const owner = useAuthStore.getState().account?.id
  const platform = navigator.platform || '未知设备'
  const browser = navigator.userAgent.match(/(Edg|Chrome|Firefox|Safari)\/[\d.]+/)?.[1] || '浏览器'
  let confirmedPrivate: boolean | undefined
  let identityRevision = 0
  const request = async (input: LeaseRequest) => {
    const activePrivate = isPrivate()
    const requestRevision = identityRevision
    const state = useAuthStore.getState()
    if (!syncClient || !owner || state.account?.id !== owner || !state.session)
      throw new Error('请重新登录')
    const { data, error } = await syncClient
      .rpc('playback_lease', {
        p_operation: input.operation,
        p_lease: input.lease,
        p_takeover: input.takeover,
        p_position: activePrivate ? 0 : input.position,
        p_duration: activePrivate ? 0 : input.duration,
        p_player: player,
        p_device_label: `${browser} · ${platform}`,
        p_media_key: activePrivate ? privateMediaKey : mediaKey,
        p_title: activePrivate ? '无痕播放' : title,
      })
      .setHeader('Authorization', `Bearer ${state.session.access_token}`)
      .abortSignal(AbortSignal.timeout(8000))
    if (error) throw error
    const reply = playbackReplySchema.parse(data)
    const expectedKey = activePrivate ? privateMediaKey : mediaKey
    if (requestRevision !== identityRevision) return reply
    if (reply.status === 'held' && (reply.media_key === expectedKey ||
        (reply.media_key === undefined && (input.operation === 'acquire' || confirmedPrivate === activePrivate)))) {
      confirmedPrivate = activePrivate
    } else if (reply.status !== 'released') {
      confirmedPrivate = undefined
    }
    return reply
  }
  return Object.assign(request, {
    isIdentityConfirmed: () => confirmedPrivate === isPrivate(),
    invalidateIdentity: () => { identityRevision += 1; confirmedPrivate = undefined },
  })
}
