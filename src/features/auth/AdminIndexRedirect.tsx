import { Navigate, useLocation } from 'react-router'

export default function AdminIndexRedirect() {
  const location = useLocation()
  const params = new URLSearchParams(location.search)
  const tab = params.get('tab')
  const section = params.get('id')
    ? 'users'
    : params.get('view') === 'audit' || tab === 'audit'
      ? 'audit'
      : tab === 'users' ||
          (!tab && ['search', 'enabled', 'nsfw', 'page', 'listPage'].some(key => params.has(key)))
        ? 'users'
        : 'announcements'
  params.delete('tab')
  params.delete('view')
  return (
    <Navigate
      to={{ pathname: `/admin/${section}`, search: params.toString(), hash: location.hash }}
      replace
    />
  )
}
