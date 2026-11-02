import { useState } from 'react'
import { NavLink } from 'react-router'
import { Cloud, KeyRound, LogOut, Settings, UserRound, Users } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { useAuthStore } from '@/shared/store/authStore'
import { syncNow, useSyncStatus } from '@/shared/sync/service'

export default function AccountMenu() {
  const { account, logout } = useAuthStore()
  const status = useSyncStatus(state => state.status)
  const [busy, setBusy] = useState(false)
  if (!account) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="size-8 rounded-full"
          aria-label="我的账号"
          title="我的账号"
        >
          <UserRound className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="break-all">
          {account.username} · {account.role === 'admin' ? '管理员' : '用户'}
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <NavLink to="/account">
            <Cloud className="size-4" />
            我的账号 · {status}
          </NavLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/account">
            <KeyRound className="size-4" />
            修改密码
          </NavLink>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <NavLink to="/settings">
            <Settings className="size-4" />
            系统设置
          </NavLink>
        </DropdownMenuItem>
        {account.role === 'admin' && (
          <DropdownMenuItem asChild>
            <NavLink to="/admin">
              <Users className="size-4" />
              管理员中心
            </NavLink>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={busy}
          onSelect={() => {
            setBusy(true)
            void syncNow()
              .then(logout)
              .catch(error =>
                toast.error(error instanceof Error ? error.message : '退出失败，请重试'),
              )
              .finally(() => setBusy(false))
          }}
        >
          <LogOut className="size-4" />
          {busy ? '正在退出…' : '退出账号'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
