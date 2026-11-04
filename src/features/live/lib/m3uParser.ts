import type { LiveChannel } from '@/shared/types/live'

export function parseM3uPlaylist(content: string): LiveChannel[] {
  if (!content || typeof content !== 'string') return []

  const lines = content.split(/\r?\n/).map(line => line.trim())
  const channels: LiveChannel[] = []

  const isM3u = lines.some(l => l.startsWith('#EXTM3U') || l.startsWith('#EXTINF:'))

  if (isM3u) {
    let currentExtinf: string | null = null

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line) continue

      if (line.startsWith('#EXTINF:')) {
        currentExtinf = line
      } else if (!line.startsWith('#') && currentExtinf) {
        const channel = parseExtinfLine(currentExtinf, line, channels.length)
        if (channel) {
          channels.push(channel)
        }
        currentExtinf = null
      }
    }
  } else {
    // TXT / TVBox format:
    // Group,#genre#
    // ChannelName,URL
    let currentGroup = '默认频道'

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      if (!line || line.startsWith('#')) continue

      if (line.includes(',#genre#')) {
        currentGroup = line.split(',#genre#')[0].trim() || '其他频道'
        continue
      }

      const commaIndex = line.indexOf(',')
      if (commaIndex > 0) {
        const name = line.substring(0, commaIndex).trim()
        const url = line.substring(commaIndex + 1).trim()
        if (name && (url.startsWith('http://') || url.startsWith('https://'))) {
          channels.push({
            id: `ch_${channels.length}_${encodeURIComponent(name).slice(0, 16)}`,
            name,
            url,
            group: currentGroup,
          })
        }
      }
    }
  }

  return channels
}

function parseExtinfLine(extinf: string, url: string, index: number): LiveChannel | null {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return null

  // Extract attributes
  const tvgIdMatch = extinf.match(/tvg-id="([^"]*)"/i)
  const tvgNameMatch = extinf.match(/tvg-name="([^"]*)"/i)
  const tvgLogoMatch = extinf.match(/tvg-logo="([^"]*)"/i)
  const groupTitleMatch = extinf.match(/group-title="([^"]*)"/i)

  // Channel name is after the last comma
  const lastCommaIndex = extinf.lastIndexOf(',')
  const rawTitle = lastCommaIndex !== -1 ? extinf.substring(lastCommaIndex + 1).trim() : ''
  const name = rawTitle || tvgNameMatch?.[1] || tvgIdMatch?.[1] || `Channel ${index + 1}`

  let group = groupTitleMatch?.[1]?.trim() || '其他频道'
  if (!group || group === 'undefined') group = '其他频道'

  return {
    id: `ch_${index}_${encodeURIComponent(name).slice(0, 16)}`,
    name,
    url,
    logo: tvgLogoMatch?.[1]?.trim(),
    group,
    tvgId: tvgIdMatch?.[1]?.trim(),
    tvgName: tvgNameMatch?.[1]?.trim(),
    rawTitle,
  }
}
