import type { WatchPartyChatMessage } from '../hooks/useWatchParty'

export function isWatchPartyChatMessage(value: unknown): value is WatchPartyChatMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Record<string, unknown>
  return typeof message.id === 'string' && message.id.length > 0 && message.id.length <= 128 &&
    typeof message.senderId === 'string' && message.senderId.length > 0 && message.senderId.length <= 128 &&
    typeof message.senderName === 'string' && message.senderName.length > 0 && message.senderName.length <= 64 &&
    typeof message.text === 'string' && message.text.trim().length > 0 && message.text.length <= 100 &&
    typeof message.timestamp === 'number' && Number.isFinite(message.timestamp) &&
    (message.isHost === undefined || typeof message.isHost === 'boolean')
}
