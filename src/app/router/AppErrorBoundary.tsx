import { Component, type ErrorInfo, type ReactNode } from 'react'
import { ErrorFallbackView } from './ErrorFallbackView'

export interface AppErrorBoundaryProps {
  children?: ReactNode
  fallback?: ((error: unknown, reset: () => void) => ReactNode) | ReactNode
  onReload?: () => void
  onGoHome?: () => void
}

interface AppErrorBoundaryState {
  hasError: boolean
  error: unknown
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  override state: AppErrorBoundaryState = {
    hasError: false,
    error: null,
  }

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return { hasError: true, error }
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error('AppErrorBoundary caught an unhandled error:', error, errorInfo)
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  override render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.handleReset)
      }
      if (this.props.fallback) {
        return this.props.fallback
      }
      return (
        <ErrorFallbackView
          error={this.state.error}
          onReload={this.props.onReload}
          onGoHome={this.props.onGoHome}
        />
      )
    }
    return this.props.children
  }
}
