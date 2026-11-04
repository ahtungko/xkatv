export interface LiveChannel {
  id: string
  name: string
  url: string
  logo?: string
  group: string
  tvgId?: string
  tvgName?: string
  rawTitle?: string
  subscriptionId?: string
}

export interface LiveCategory {
  id: string
  name: string
  channelCount: number
}

export interface LiveSubscription {
  id: string
  name: string
  url: string
  isEnabled: boolean
  updatedAt?: string
  channelCount?: number
  channels?: LiveChannel[]
}
