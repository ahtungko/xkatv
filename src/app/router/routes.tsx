import { lazy, Suspense, useEffect } from 'react'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router'
import { LoadingFallback } from './LoadingFallback'
import { RootErrorBoundary } from './RootErrorBoundary'
import { useAuthStore } from '@/shared/store/authStore'
import { usePrivateModeStore } from '@/shared/store/privateModeStore'
import { adminChildRoutes } from '@/features/auth/admin-routes'

// 主布局随受保护路由加载，设置布局在进入设置页时再加载。
import MainLayout from '@/app/layouts/MainLayout'
const SettingsLayout = lazy(() => import('@/app/layouts/SettingsLayout'))

// Auth
const AccountView = lazy(() => import('@/features/auth/AccountView'))
const AdminView = lazy(() => import('@/features/auth/AdminView'))

// Views (lazy loaded from features)
const HomeView = lazy(() => import('@/features/home/views/HomeView'))
const SearchHubView = lazy(() => import('@/features/search/views/SearchHubView'))
const FavoritesView = lazy(() => import('@/features/favorites/views/FavoritesView'))
const HistoryView = lazy(() => import('@/features/history/views/HistoryView'))
const TmdbDetailView = lazy(() => import('@/features/media/views/TmdbDetailView'))

// Settings sub-routes
const SourceSettings = lazy(() => import('@/features/settings/views/SourceSettings'))
const PlaybackSettings = lazy(() => import('@/features/settings/views/PlaybackSettings'))
const SystemSettings = lazy(() => import('@/features/settings/views/SystemSettings'))
const PersonalConfigSettings = lazy(
  () => import('@/features/settings/views/PersonalConfigSettings'),
)
const AboutSettings = lazy(() => import('@/features/settings/views/AboutSettings'))

// Player views
const UnifiedPlayer = lazy(() => import('@/features/player/components/UnifiedPlayer'))
const GuestPartyView = lazy(() => import('@/features/player/views/GuestPartyView'))

// Suspense wrapper for lazy components
const SuspenseWrapper = ({ children }: { children: React.ReactNode }) => (
  <Suspense fallback={<LoadingFallback />}>{children}</Suspense>
)

const HistoryGuard = ({ children }: { children: React.ReactNode }) => {
  const isPrivateMode = usePrivateModeStore(state => state.isPrivateMode)
  if (isPrivateMode) {
    return <Navigate to="/" replace />
  }
  return <>{children}</>
}

const AdminOnly = ({ children }: { children: React.ReactNode }) => {
  const isAdmin = useAuthStore(state => state.account?.role === 'admin')
  return isAdmin ? <>{children}</> : <Navigate to="/" replace />
}

const RequireAuth = ({ children }: { children: React.ReactNode }) => {
  const account = useAuthStore(state => state.account)
  useEffect(() => {
    if (!account) {
      window.location.replace('/')
    }
  }, [account])

  if (!account) {
    return <LoadingFallback />
  }

  return <>{children}</>
}

const router = createBrowserRouter([
  {
    path: 'p/:roomId',
    element: (
      <SuspenseWrapper>
        <GuestPartyView />
      </SuspenseWrapper>
    ),
    ErrorBoundary: RootErrorBoundary,
  },
  // A. 专属免登录极简影院 (脱离主站核心布局，无顶部导航与搜索)
  {
    path: 'party/:roomId',
    element: (
      <SuspenseWrapper>
        <GuestPartyView />
      </SuspenseWrapper>
    ),
    ErrorBoundary: RootErrorBoundary,
  },
  // B. 核心布局路由 (带顶部导航)
  {
    path: '/',
    element: (
      <RequireAuth>
        <MainLayout />
      </RequireAuth>
    ),
    ErrorBoundary: RootErrorBoundary,
    children: [
      {
        path: 'admin',
        element: (
          <AdminOnly>
            <SuspenseWrapper>
              <AdminView />
            </SuspenseWrapper>
          </AdminOnly>
        ),
        children: adminChildRoutes,
      },
      {
        path: 'account',
        element: (
          <SuspenseWrapper>
            <AccountView />
          </SuspenseWrapper>
        ),
      },
      {
        index: true,
        element: (
          <SuspenseWrapper>
            <HomeView />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'search',
        element: (
          <SuspenseWrapper>
            <SearchHubView />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'favorites',
        element: (
          <SuspenseWrapper>
            <HistoryGuard><FavoritesView /></HistoryGuard>
          </SuspenseWrapper>
        ),
      },
      {
        path: 'history',
        element: (
          <SuspenseWrapper>
            <HistoryGuard><HistoryView /></HistoryGuard>
          </SuspenseWrapper>
        ),
      },
      {
        path: 'continue-watching',
        element: (
          <SuspenseWrapper>
            <HistoryGuard><HistoryView /></HistoryGuard>
          </SuspenseWrapper>
        ),
      },
      {
        path: 'media/:type/:tmdbId',
        element: (
          <SuspenseWrapper>
            <TmdbDetailView />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'play/:type/:tmdbId',
        element: (
          <SuspenseWrapper>
            <UnifiedPlayer />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'play/cms/:sourceCode/:vodId',
        element: (
          <SuspenseWrapper>
            <UnifiedPlayer />
          </SuspenseWrapper>
        ),
      },
      {
        path: 'settings',
        element: (
          <SuspenseWrapper>
            <SettingsLayout />
          </SuspenseWrapper>
        ),
        children: [
          { index: true, element: <Navigate to="source" replace /> },
          {
            path: 'source',
            element: (
              <SuspenseWrapper>
                <SourceSettings />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'playback',
            element: (
              <SuspenseWrapper>
                <PlaybackSettings />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'system',
            element: (
              <SuspenseWrapper>
                <SystemSettings />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'profile',
            element: (
              <SuspenseWrapper>
                <PersonalConfigSettings />
              </SuspenseWrapper>
            ),
          },
          {
            path: 'about',
            element: (
              <SuspenseWrapper>
                <AboutSettings />
              </SuspenseWrapper>
            ),
          },
        ],
      },
    ],
  },
])

export default function ProtectedRouter() {
  return <RouterProvider router={router} />
}
