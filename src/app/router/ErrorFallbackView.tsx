import { isRouteErrorResponse } from 'react-router'
import { AlertCircle, Home, RefreshCw } from 'lucide-react'
import { Button } from '@/shared/components/ui/button'
import { XkaLogo } from '@/shared/components/icons'
import { isDynamicImportError } from '@/shared/lib/preloadRecovery'

export interface ErrorFallbackViewProps {
  error?: unknown
  onReload?: () => void
  onGoHome?: () => void
}

export function ErrorFallbackView({
  error,
  onReload,
  onGoHome,
}: ErrorFallbackViewProps = {}) {
  const isChunkError = isDynamicImportError(error)
  const is404 = isRouteErrorResponse(error) && error.status === 404

  const title = isChunkError
    ? '网站已发布新版本'
    : is404
      ? '页面未找到'
      : '页面遇到意外问题'

  const description = isChunkError
    ? '检测到应用更新或静态分包失效，请刷新页面以加载最新内容。'
    : is404
      ? '你访问的页面不存在或已被移除。'
      : '页面在渲染或加载时发生了异常，你可以尝试刷新页面或返回首页。'

  const errorMessage =
    error instanceof Error
      ? error.message
      : isRouteErrorResponse(error)
        ? `${error.status} ${error.statusText}`
        : typeof error === 'string'
          ? error
          : null

  const handleReload = () => {
    if (onReload) {
      onReload()
      return
    }
    window.location.reload()
  }

  const handleGoHome = () => {
    if (onGoHome) {
      onGoHome()
      return
    }
    window.location.href = '/'
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center p-6 text-center">
      <div className="flex -translate-y-8 flex-col items-center max-w-md w-full">
        <div className="mb-6 flex items-center justify-center">
          <XkaLogo size={56} />
        </div>

        <div className="mb-2 flex items-center justify-center gap-2">
          {!isChunkError && <AlertCircle className="size-5 text-amber-500 shrink-0" />}
          <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        </div>

        <p className="text-muted-foreground text-sm leading-relaxed mb-6">
          {description}
        </p>

        <div className="flex items-center justify-center gap-3">
          <Button onClick={handleReload} className="gap-2">
            <RefreshCw className="size-4" />
            刷新页面
          </Button>
          {!isChunkError && (
            <Button variant="outline" onClick={handleGoHome} className="gap-2">
              <Home className="size-4" />
              返回首页
            </Button>
          )}
        </div>

        {import.meta.env.DEV && errorMessage && !isChunkError && (
          <details className="mt-8 w-full text-left">
            <summary className="text-xs text-muted-foreground/80 cursor-pointer hover:text-foreground transition-colors">
              查看技术错误详情
            </summary>
            <pre className="mt-2 p-3 bg-muted rounded-md text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
              {errorMessage}
            </pre>
          </details>
        )}
      </div>
    </div>
  )
}
