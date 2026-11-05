import { expect, it, vi } from 'vitest'
import { seekTarget, seekTv, handleTvKey, finiteTime } from './tvControls'
it('clamps finite seeks and rejects unavailable timelines', () => {
  expect(seekTarget(110, 100)).toBe(100)
  expect(seekTarget(-10, 100)).toBe(0)
  expect(seekTarget(10, NaN)).toBeNull()
  expect(seekTarget(Infinity, 100)).toBeNull()
  expect(finiteTime(Infinity)).toBe(0)
})
it('uses the computed seek time rather than reading a setter-only property', () => {
  let position = 0
  const player = {
    currentTime: 40,
    duration: 100,
    volume: 1,
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    set seek(value: number) {
      position = value
    },
  }
  const osd = vi.fn()
  seekTv(player, 50, osd)
  expect(position).toBe(50)
  expect(osd).toHaveBeenCalledWith('跳转至 0:50')
})
it('space toggles once and editable fields retain their keyboard behavior', () => {
  const player = {
    currentTime: 0,
    duration: 100,
    seek: 0,
    volume: 1,
    video: { paused: false },
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
  }
  const osd = vi.fn()
  const duplicate = vi.fn()
  const handler = (e: KeyboardEvent) => handleTvKey(e, player, osd, vi.fn())
  window.addEventListener('keydown', handler, true)
  document.addEventListener('keydown', duplicate)
  const input = document.createElement('input')
  document.body.appendChild(input)
  try {
    document.body.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true, cancelable: true }),
    )
    expect(player.pause).toHaveBeenCalledTimes(1)
    expect(duplicate).not.toHaveBeenCalled()
    input.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', bubbles: true }))
    expect(player.pause).toHaveBeenCalledTimes(1)
    expect(duplicate).toHaveBeenCalledTimes(1)
  } finally {
    window.removeEventListener('keydown', handler, true)
    document.removeEventListener('keydown', duplicate)
    input.remove()
  }
})
