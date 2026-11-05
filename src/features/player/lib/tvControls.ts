export function finiteTime(value: number | undefined): number {
  return Number.isFinite(value) && value! >= 0 ? value! : 0
}
export function seekTarget(requested: number, duration: number): number | null {
  if (!Number.isFinite(requested) || !Number.isFinite(duration) || duration <= 0) return null
  return Math.min(duration, Math.max(0, requested))
}
interface TvPlayer {
  currentTime: number
  duration: number
  seek: number
  volume: number
  video?: { paused: boolean }
  play: () => Promise<unknown>
  pause: () => unknown
}
export function toggleTv(player: TvPlayer, osd: (message: string) => void) {
  if (player.video?.paused)
    void player
      .play()
      .then(() => osd('▶ 播放'))
      .catch(() => osd('请按电视上的播放按钮重试'))
  else {
    player.pause()
    osd('⏸ 暂停')
  }
}
export function seekTv(player: TvPlayer, requested: number, osd: (message: string) => void) {
  const target = seekTarget(requested, player.duration)
  if (target === null) {
    osd('视频尚未就绪，暂时无法跳转')
    return
  }
  player.seek = target
  osd(
    `跳转至 ${Math.floor(target / 60)}:${Math.floor(target % 60)
      .toString()
      .padStart(2, '0')}`,
  )
}
export function handleTvKey(
  event: KeyboardEvent,
  player: TvPlayer,
  osd: (message: string) => void,
  exit: () => void,
) {
  const target = event.target
  if (
    target instanceof HTMLElement &&
    target.closest('input,textarea,select,[contenteditable="true"]')
  )
    return
  const key = event.code === 'Space' ? ' ' : event.key
  if (key === 'Enter' && target instanceof HTMLElement && target.closest('button,a')) return
  if (
    ![
      ' ',
      'Spacebar',
      'Enter',
      'ArrowLeft',
      'ArrowRight',
      'ArrowUp',
      'ArrowDown',
      'Escape',
      'Backspace',
    ].includes(key)
  )
    return
  event.preventDefault()
  event.stopImmediatePropagation()
  if (event.repeat) return
  if ([' ', 'Spacebar', 'Enter'].includes(key)) toggleTv(player, osd)
  else if (key === 'ArrowLeft' || key === 'ArrowRight')
    seekTv(player, finiteTime(player.currentTime) + (key === 'ArrowLeft' ? -10 : 10), osd)
  else if (key === 'ArrowUp' || key === 'ArrowDown')
    player.volume = Math.max(
      0,
      Math.min(1, finiteTime(player.volume) + (key === 'ArrowUp' ? 0.1 : -0.1)),
    )
  else exit()
}
