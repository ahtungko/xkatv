export interface TvCastMediaPayload {
  videoUrl: string
  mediaTitle: string
  episodeTitle: string
  episodeIndex: number
  totalEpisodes?: number
  posterUrl?: string
  initialTime: number
  adFilteringEnabled?: boolean
  sourceCode?: string
  vodId?: string
}

export type TvCastCommandAction =
  | 'play'
  | 'pause'
  | 'toggle'
  | 'seek'
  | 'volume'
  | 'skip_intro'
  | 'next_episode'
  | 'prev_episode'

export interface TvCastCommandPayload {
  action: TvCastCommandAction
  value?: number
}

export interface TvCastProgressPayload {
  isPlaying: boolean
  currentTime: number
  duration: number
  mediaTitle: string
  episodeTitle: string
}

export type TvCastMessage =
  | { type: 'connect_request'; senderId: string; senderName: string }
  | { type: 'connect_ack'; deviceName: string; isPlaying: boolean }
  | { type: 'load_media'; payload: TvCastMediaPayload }
  | { type: 'command'; payload: TvCastCommandPayload }
  | { type: 'progress'; payload: TvCastProgressPayload }
  | { type: 'ended' }
  | { type: 'disconnect' }
  | { type: 'error'; message: string }

export function getTvCastChannelName(pin: string): string {
  const cleanPin = pin.trim().toUpperCase()
  return `tv_cast:${cleanPin}`
}

export function isValidPin(pin: string): boolean {
  return /^[0-9A-Z]{4}$/i.test(pin.trim())
}
