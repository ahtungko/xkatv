import { useRef } from 'react'
import { Button } from '@/shared/components/ui/button'
import {
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogHeader,
  DialogFooter,
  DialogTitle,
} from '@/shared/components/ui/dialog'
import { AnnouncementDetails } from './AnnouncementDetails'
import type { Announcement } from './service'

export function AnnouncementDialogContent({
  announcement,
  preview = false,
}: {
  announcement: Announcement
  preview?: boolean
}) {
  const titleRef = useRef<HTMLHeadingElement>(null)

  return (
    <DialogContent
      onOpenAutoFocus={event => {
        event.preventDefault()
        titleRef.current?.focus()
      }}
      className="top-1/2 right-auto bottom-auto left-1/2 max-h-[85dvh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-xl border-b sm:bottom-auto sm:w-full"
    >
      <DialogHeader>
        <DialogTitle ref={titleRef} tabIndex={-1} className="pr-6 leading-snug break-words outline-none">
          {announcement.kind === 'maintenance' ? '系统维护' : announcement.title}
        </DialogTitle>
        <DialogDescription>
          {preview
            ? '公告预览 · 仅供查看，不会保存或发布'
            : `站内公告 · ${new Date(announcement.updated_at).toLocaleString()}`}
        </DialogDescription>
      </DialogHeader>
      <div
        className="min-h-0 overflow-y-auto overscroll-contain [overflow-wrap:anywhere]"
        role="region"
        aria-label="公告内容"
        tabIndex={0}
      >
        <AnnouncementDetails announcement={announcement} />
      </div>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button">{preview ? '返回编辑' : '我知道了'}</Button>
        </DialogClose>
      </DialogFooter>
    </DialogContent>
  )
}
