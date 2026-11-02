import { lazy, Suspense } from 'react'
import { LoadingFallback } from './LoadingFallback'
import { AppErrorBoundary } from './AppErrorBoundary'
import AuthGuard from '@/shared/components/AuthGuard'

const ProtectedRouter = lazy(() => import('./routes'))

export { AppErrorBoundary }

export default function AppRouter() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<LoadingFallback />}>
        <AuthGuard>
          <ProtectedRouter />
        </AuthGuard>
      </Suspense>
    </AppErrorBoundary>
  )
}
