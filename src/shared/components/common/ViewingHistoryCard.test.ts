// @vitest-environment jsdom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ViewingHistoryCard } from './ViewingHistoryCard'
import type { ViewingHistoryItem } from '@/shared/types'

// @ts-expect-error React act environment flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true

const mockItem: ViewingHistoryItem = {
  recordType: 'cms',
  sourceCode: 'src-1',
  sourceName: '测试源',
  vodId: '12345',
  title: '测试电影',
  episodeIndex: 0,
  episodeName: '正片',
  playbackPosition: 60,
  duration: 120,
  timestamp: Date.now(),
  imageUrl: 'https://example.com/poster.jpg',
}

describe('ViewingHistoryCard 编辑选择模式安全隔离', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    vi.clearAllMocks()
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  it('非编辑模式下渲染为播放跳转链接（a 标签）', async () => {
    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(ViewingHistoryCard, { item: mockItem, selectionMode: false }),
        ),
      )
    })

    const link = host.querySelector('a')
    expect(link).not.toBeNull()
    expect(link?.getAttribute('href')).toContain('/play/cms/src-1/12345')
  })

  it('编辑模式（selectionMode）下渲染为安全 div，绝无播放链接，点击卡片或 checkbox 仅触发选择回调', async () => {
    const onToggleSelect = vi.fn()

    await act(async () => {
      root.render(
        createElement(
          MemoryRouter,
          null,
          createElement(ViewingHistoryCard, {
            item: mockItem,
            selectionMode: true,
            selected: false,
            onToggleSelect,
          }),
        ),
      )
    })

    // 编辑状态下绝不能存在 a 标签，防止任何意外跳转进入播放
    const link = host.querySelector('a')
    expect(link).toBeNull()

    // 存在 checkbox 控制项
    const checkbox = host.querySelector('button[role="checkbox"]')
    expect(checkbox).not.toBeNull()

    // 点击 checkbox 触发选择
    await act(async () => {
      ;(checkbox as HTMLElement)?.click()
    })
    expect(onToggleSelect).toHaveBeenCalledWith(mockItem)

    onToggleSelect.mockClear()

    // 点击整张卡片同样触发选择
    const cardContainer = host.querySelector('[role="button"]')
    expect(cardContainer).not.toBeNull()
    await act(async () => {
      ;(cardContainer as HTMLElement)?.click()
    })
    expect(onToggleSelect).toHaveBeenCalledWith(mockItem)
  })
})
