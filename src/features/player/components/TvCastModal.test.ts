import { describe, it, expect, vi } from 'vitest'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'
import { TvCastModal } from './TvCastModal'

describe('TvCastModal', () => {
  it('renders pairing input and connect button when not casting', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const onConnect = vi.fn()
    const onClose = vi.fn()
    const onSendCommand = vi.fn()
    const onDisconnect = vi.fn()

    await act(async () => {
      root.render(
        createElement(TvCastModal, {
          isOpen: true,
          onClose,
          isCasting: false,
          connectedPin: '',
          recentPins: ['1234', '5678'],
          remoteState: {
            isPlaying: false,
            currentTime: 0,
            duration: 0,
            mediaTitle: '',
            episodeTitle: '',
          },
          onConnect,
          onSendCommand,
          onDisconnect,
        }),
      )
    })

    const input = document.querySelector('input[placeholder*="7829"]') as HTMLInputElement
    expect(input).not.toBeNull()

    const submitBtn = document.querySelector('button[type="submit"]') as HTMLButtonElement
    expect(submitBtn).not.toBeNull()

    // Test recent PIN buttons exist
    const recentButtons = document.querySelectorAll('button')
    const hasPin1234 = Array.from(recentButtons).some(btn => btn.textContent?.includes('1234'))
    expect(hasPin1234).toBe(true)

    root.unmount()
    container.remove()
  })

  it('renders remote control buttons when casting is active', async () => {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)

    const onSendCommand = vi.fn()

    await act(async () => {
      root.render(
        createElement(TvCastModal, {
          isOpen: true,
          onClose: vi.fn(),
          isCasting: true,
          connectedPin: '7829',
          recentPins: [],
          remoteState: {
            isPlaying: true,
            currentTime: 120,
            duration: 2400,
            mediaTitle: '繁花',
            episodeTitle: '第 3 集',
          },
          onConnect: vi.fn(),
          onSendCommand,
          onDisconnect: vi.fn(),
        }),
      )
    })

    expect(document.body.textContent).toContain('已连接至电视')
    expect(document.body.textContent).toContain('7829')
    expect(document.body.textContent).toContain('繁花')
    expect(document.body.textContent).toContain('第 3 集')

    expect(document.body.textContent).not.toContain('跳片头')
    const dialog=document.querySelector('[role="dialog"]')!
    await act(async()=>dialog.dispatchEvent(new KeyboardEvent('keydown',{key:' ',code:'Space',bubbles:true,cancelable:true})))
    expect(onSendCommand).toHaveBeenCalledWith('toggle')

    root.unmount()
    container.remove()
  })
})
