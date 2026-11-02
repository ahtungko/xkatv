// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { WatchPartyModal } from './WatchPartyModal'

// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/shared/components/ui/dialog', () => {
  const Container = ({ children }: { children?: ReactNode }) => createElement('div', null, children)
  return {
    Dialog: Container, DialogContent: Container, DialogHeader: Container,
    DialogTitle: Container, DialogDescription: Container, DialogFooter: Container,
  }
})

it('创建界面只显示免登录影厅，创建时默认使用该模式', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const createParty = vi.fn().mockResolvedValue('https://example.com/p/room123')
  try {
    await act(async () => root.render(createElement(WatchPartyModal, {
      isOpen: true, onClose: vi.fn(), isPartyActive: false, isHost: false,
      mode: 'host_only', roomId: null, participants: [], isSupabaseAvailable: true,
      onCreateParty: createParty, onLeaveParty: vi.fn().mockResolvedValue(true),
    })))
    expect(host.textContent).toContain('免登录专属影厅')
    expect(host.textContent).not.toContain('房主主控')
    expect(host.textContent).not.toContain('全员自由')
    const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.includes('创建放映室'))
    expect(button).toBeDefined()
    await act(async () => button?.click())
    expect(createParty).toHaveBeenCalledWith('guest_cinema')
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it('创建失败时在弹窗显示错误并可重试', async () => {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  const createParty = vi.fn().mockRejectedValue(new Error('网络不可用'))
  try {
    await act(async () => root.render(createElement(WatchPartyModal, {
      isOpen: true, onClose: vi.fn(), isPartyActive: false, isHost: false,
      mode: 'host_only', roomId: null, participants: [], isSupabaseAvailable: true,
      onCreateParty: createParty, onLeaveParty: vi.fn().mockResolvedValue(true),
    })))
    const button = Array.from(host.querySelectorAll('button')).find(item => item.textContent?.includes('创建放映室'))!
    await act(async () => button.click())
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('网络不可用')
    expect(button.disabled).toBe(false)
  } finally { await act(async () => root.unmount()); host.remove() }
})
