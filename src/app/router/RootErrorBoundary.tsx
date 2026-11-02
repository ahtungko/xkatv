import { useRouteError } from 'react-router'
import { ErrorFallbackView, type ErrorFallbackViewProps } from './ErrorFallbackView'

export type RootErrorBoundaryProps = ErrorFallbackViewProps

export function RootErrorBoundary(props: RootErrorBoundaryProps = {}) {
  const routeError = useRouteError()
  const error = props.error ?? routeError

  return (
    <ErrorFallbackView
      error={error}
      onReload={props.onReload}
      onGoHome={props.onGoHome}
    />
  )
}
