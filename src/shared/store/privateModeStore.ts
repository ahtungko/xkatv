import { create } from 'zustand'

const PRIVATE_MODE_SESSION_KEY = 'xkatv-private-mode'

export function readPrivateModeSession(): boolean {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return false
    return window.sessionStorage.getItem(PRIVATE_MODE_SESSION_KEY) === 'true'
  } catch {
    return false
  }
}

export function writePrivateModeSession(enabled: boolean): void {
  try {
    if (typeof window === 'undefined' || !window.sessionStorage) return
    if (enabled) {
      window.sessionStorage.setItem(PRIVATE_MODE_SESSION_KEY, 'true')
    } else {
      window.sessionStorage.removeItem(PRIVATE_MODE_SESSION_KEY)
    }
  } catch {
    // Storage may be blocked or restricted in private browsing mode
  }
}

interface PrivateModeState {
  isPrivateMode: boolean
  privateQuery: string
  setPrivateQuery: (query: string) => void
  setPrivateMode: (enabled: boolean) => void
  togglePrivateMode: () => boolean
}

export const usePrivateModeStore = create<PrivateModeState>((set, get) => ({
  isPrivateMode: readPrivateModeSession(),
  privateQuery: '',
  setPrivateQuery: query => set({ privateQuery: query }),
  setPrivateMode: (enabled: boolean) => {
    writePrivateModeSession(enabled)
    set({ isPrivateMode: enabled, privateQuery: '' })
  },
  togglePrivateMode: () => {
    const next = !get().isPrivateMode
    writePrivateModeSession(next)
    set({ isPrivateMode: next, privateQuery: '' })
    return next
  },
}))

export function resetPrivateModeStore(): void {
  writePrivateModeSession(false)
  usePrivateModeStore.setState({ isPrivateMode: false, privateQuery: '' })
}
