import type { WatchPartyMode } from '../hooks/useWatchParty'

export function buildInviteMessage({
  inviter,
  mediaTitle,
  episodeTitle,
  inviteUrl,
  mode,
}: {
  inviter?: string | null
  mediaTitle?: string
  episodeTitle?: string
  inviteUrl: string
  mode: WatchPartyMode
}): string {
  const hostLabel = inviter ? `「${inviter}」` : '你的好友'
  const titlePart = mediaTitle ? `《${mediaTitle}》` : '精彩视频'
  const epPart = episodeTitle ? ` ${episodeTitle}` : ''
  const cinemaNote =
    mode === 'guest_cinema'
      ? '（免登录专属影厅，点开秒看）'
      : '（同屏同步播放，实时联动）'

  return `🍿 ${hostLabel}邀请你一起看${titlePart}${epPart}！\n📺 毫秒级同屏同步 · 播放/暂停/快进全员联动\n🔗 点击进入 xkaTV 放映室${cinemaNote}：\n${inviteUrl}`
}
