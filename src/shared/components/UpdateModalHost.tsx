import { lazy, Suspense, useEffect, useState } from 'react'
import { useVersionStore } from '@/shared/store/versionStore'

const UpdateModal = lazy(() => import('./UpdateModal'))

export default function UpdateModalHost() {
  const showUpdateModal = useVersionStore(state => state.showUpdateModal)
  const [activated, setActivated] = useState(showUpdateModal)

  useEffect(() => {
    if (showUpdateModal) setActivated(true)
  }, [showUpdateModal])

  // Load on first use, then let the dialog manage its own closing transition.
  if (!showUpdateModal && !activated) return null

  return (
    <Suspense fallback={null}>
      <UpdateModal />
    </Suspense>
  )
}
