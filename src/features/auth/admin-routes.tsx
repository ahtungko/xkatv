import { lazy, Suspense } from 'react'
import { Navigate, type RouteObject } from 'react-router'
import AdminIndexRedirect from './AdminIndexRedirect'

export const adminModules = [
  { key: 'announcements', name: '站内公告', color: 'bg-amber-500', path: '/admin/announcements' },
  { key: 'users', name: '用户管理', color: 'bg-violet-500', path: '/admin/users' },
  { key: 'audit', name: '操作记录', color: 'bg-sky-500', path: '/admin/audit' },
] as const

const AccountAdmin = lazy(() => import('@/features/settings/components/AccountAdmin'))
const accountPage = (
  <Suspense
    fallback={
      <p role="status" className="text-muted-foreground p-4 text-sm">
        正在加载…
      </p>
    }
  >
    <AccountAdmin showNavigation={false} />
  </Suspense>
)

export const adminChildRoutes: RouteObject[] = [
  { index: true, element: <AdminIndexRedirect /> },
  { path: 'login', element: <Navigate to="/admin/announcements" replace /> },
  { path: 'announcements', element: null },
  { path: 'users', element: accountPage },
  { path: 'audit', element: accountPage },
  { path: '*', element: <Navigate to="/admin/announcements" replace /> },
]
