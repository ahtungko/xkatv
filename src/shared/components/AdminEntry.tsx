import type { ReactNode } from 'react'
import { Lock } from 'lucide-react'

export default function AdminEntry({
  adminLogin = false,
  children,
}: {
  adminLogin?: boolean
  children?: ReactNode
}) {
  const label = adminLogin ? '返回主站' : '管理入口'
  return (
    <a
      href={adminLogin ? '/' : '/admin/login'}
      aria-label={label}
      title={label}
      className="text-muted-foreground hover:text-foreground -m-2 inline-flex size-10 shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {children ?? <Lock className="size-6" />}
    </a>
  )
}
