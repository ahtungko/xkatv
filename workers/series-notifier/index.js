/**
 * xkaTV Series Update Notifier — Standalone Cloudflare Worker (Cron Trigger)
 *
 * Can be deployed on ANY Cloudflare account (including a separate free account).
 * Zero external dependencies — supports both `wrangler deploy` and direct
 * copy-paste in the Cloudflare Workers Dashboard.
 *
 * Required Secrets:
 *   - SUPABASE_URL              e.g. https://xxxx.supabase.co
 *   - SUPABASE_SERVICE_ROLE_KEY Supabase service_role key (never expose to frontend)
 *   - CMS_SOURCES_JSON          Remote JSON URL(s) (e.g. https://example.com/sources.json),
 *                               OR inline JSON object {"sourceId": "https://..."},
 *                               OR inline JSON array [{"id": "sourceId", "url": "..."}]
 *                               (also supports full xkaTV config JSON with `videoSources`)
 *                               Optional alias: CMS_SOURCES_URL (can be used alongside or instead)
 *
 * Optional Environment Variables:
 *   - CHECK_COOLDOWN_HOURS      Default: 2 (skip items checked within N hours)
 *   - MAX_SUBREQUESTS           Default: 42 (safe buffer under CF Free plan's 50 limit)
 *   - MAX_IDS_PER_BATCH         Default: 20 (comma-separated ids per CMS detail request)
 *   - TRIGGER_SECRET            Optional Bearer token for manual POST /run testing
 */

const NON_MAIN_EPISODE_RE = /预告|花絮|特辑|特典|彩蛋|解说|片段|trailer|special|preview/i
const DISCORD_WEBHOOK_HOSTS = new Set([
  'discord.com',
  'discordapp.com',
  'ptb.discord.com',
  'canary.discord.com',
])
const BLOCKED_HOST_PATTERNS = [
  /^localhost$/i,
  /^127\./,
  /^10\./,
  /^192\.168\./,
  /^169\.254\./,
  /^0\./,
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./,
  /^172\.(1[6-9]|2\d|3[0-1])\./,
  /^\[?::\]?$/i,
  /^\[?::1\]?$/i,
  /^\[?::ffff:/i,
  /^\[?fc/i,
  /^\[?fd/i,
  /^\[?fe80:/i,
  /^\d+$/,
  /^0x[0-9a-f]+$/i,
  /\.local$/i,
  /\.internal$/i,
  /\.localhost$/i,
]

export function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const enc = new TextEncoder()
  const bytesA = enc.encode(a)
  const bytesB = enc.encode(b)
  const maxLen = Math.max(bytesA.length, bytesB.length)
  let diff = bytesA.length ^ bytesB.length
  for (let i = 0; i < maxLen; i++) {
    diff |= (bytesA[i] ?? 0) ^ (bytesB[i] ?? 0)
  }
  return diff === 0
}

function stripSurroundingQuotes(value) {
  const trimmed = String(value || '').trim()
  const first = trimmed.at(0)
  const last = trimmed.at(-1)
  if (trimmed.length >= 2 && first === last && (first === "'" || first === '"' || first === '`')) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function isHttpUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function registerSourceArray(items, map) {
  items.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const id = String(item.id || item.code || item.key || `env_source_${index}`).trim()
    const url = String(item.detailUrl || item.url || '').trim()
    if (id && url) map.set(id, url)
  })
}

export function parseCmsSourcesMap(raw, targetMap = new Map()) {
  const map = targetMap
  if (!raw || typeof raw !== 'string') return map
  const cleaned = stripSurroundingQuotes(raw)
  if (!cleaned) return map
  const parsed = JSON.parse(cleaned)
  if (Array.isArray(parsed)) {
    registerSourceArray(parsed, map)
    return map
  }
  if (parsed && typeof parsed === 'object') {
    if (Array.isArray(parsed.videoSources)) {
      registerSourceArray(parsed.videoSources, map)
      return map
    }
    if (Array.isArray(parsed.sources)) {
      registerSourceArray(parsed.sources, map)
      return map
    }
    if (typeof parsed.url === 'string' && parsed.url.trim()) {
      registerSourceArray([parsed], map)
      return map
    }
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) {
        map.set(id.trim(), value.trim())
      } else if (value && typeof value === 'object') {
        const url = String(value.detailUrl || value.url || '').trim()
        if (url) map.set(id.trim(), url)
      }
    }
  }
  return map
}

export async function loadCmsSourcesMap(rawInputs, budget) {
  const map = new Map()
  const entries = (Array.isArray(rawInputs) ? rawInputs : [rawInputs])
    .map(v => stripSurroundingQuotes(v))
    .filter(Boolean)

  for (const entry of entries) {
    // Support single URL or multiple URLs separated by newlines / commas
    const urlCandidates = entry
      .split(/[\r\n,]+/)
      .map(s => stripSurroundingQuotes(s))
      .filter(Boolean)
    const allAreUrls = urlCandidates.length > 0 && urlCandidates.every(isHttpUrl)

    if (allAreUrls) {
      for (const remoteUrl of urlCandidates) {
        if (!isAllowedWebhookUrl(remoteUrl)) {
          throw new Error(`Disallowed CMS sources URL: ${remoteUrl}`)
        }
        const res = await budget.fetch(remoteUrl, {
          headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': 'xkaTV-SeriesNotifier/1.0' },
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) {
          throw new Error(`Failed to fetch CMS sources URL (${res.status})`)
        }
        const text = await res.text()
        const cleaned = stripSurroundingQuotes(text)
        const parsed = JSON.parse(cleaned)
        // If remote file is an xkaTV full config whose videoSources is itself a URL, follow 1 hop
        if (
          parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          typeof parsed.videoSources === 'string' &&
          isHttpUrl(stripSurroundingQuotes(parsed.videoSources))
        ) {
          const nestedUrl = stripSurroundingQuotes(parsed.videoSources)
          if (!isAllowedWebhookUrl(nestedUrl)) {
            throw new Error(`Disallowed nested CMS sources URL: ${nestedUrl}`)
          }
          const nestedRes = await budget.fetch(nestedUrl, {
            headers: { Accept: 'application/json, text/plain, */*', 'User-Agent': 'xkaTV-SeriesNotifier/1.0' },
            signal: AbortSignal.timeout(10_000),
          })
          if (!nestedRes.ok) {
            throw new Error(`Failed to fetch nested CMS sources URL (${nestedRes.status})`)
          }
          parseCmsSourcesMap(await nestedRes.text(), map)
        } else {
          parseCmsSourcesMap(text, map)
        }
      }
    } else {
      parseCmsSourcesMap(entry, map)
    }
  }

  return map
}

export function buildBatchDetailUrl(baseUrl, ids) {
  const cleaned = baseUrl.replace(/\/+$/, '')
  const encodedIds = ids.map(id => encodeURIComponent(id)).join(',')
  if (cleaned.toLowerCase().includes('/api.php/provide/vod')) {
    const sep = cleaned.includes('?') ? '&' : '?'
    return `${cleaned}${sep}ac=videolist&ids=${encodedIds}`
  }
  return `${cleaned}/api.php/provide/vod/?ac=videolist&ids=${encodedIds}`
}

export function parsePlayUrl(vodPlayUrl, vodPlayFrom) {
  if (!vodPlayUrl || typeof vodPlayUrl !== 'string') return { urls: [], names: [] }
  const playSources = vodPlayUrl.split('$$$')
  const playFroms = (vodPlayFrom || '').split('$$$')
  if (!playSources.length) return { urls: [], names: [] }

  let sourceIndex = playFroms.findIndex(from => from.toLowerCase().includes('m3u8'))
  if (sourceIndex === -1 || sourceIndex >= playSources.length) {
    sourceIndex = playSources.length - 1
  }

  const parsed = playSources[sourceIndex]
    .split('#')
    .map((ep, index) => {
      const parts = ep.split('$')
      return {
        url: parts.length > 1 ? parts[1] : '',
        name: parts.length > 1 ? parts[0] : `第${index + 1}集`,
      }
    })
    .filter(ep => ep.url && /^https?:\/\//i.test(ep.url))

  return {
    urls: parsed.map(ep => ep.url),
    names: parsed.map(ep => ep.name),
  }
}

export function parseEpisodeNumber(name) {
  if (!name || NON_MAIN_EPISODE_RE.test(name)) return null
  const trimmed = name.trim()
  const match =
    trimmed.match(/^(?:第\s*)?0*(\d+)\s*(?:集|话|話|期|$)/i) ||
    trimmed.match(/^(?:EP?|Episode)\s*0*(\d+)(?:\b|$)/i)
  const num = match ? Number(match[1]) : 0
  return num > 0 && num < 10000 ? num : null
}

export function extractPlayableEpisodeNumbers(vodItem) {
  const { urls, names } = parsePlayUrl(vodItem?.vod_play_url || '', vodItem?.vod_play_from || '')
  const episodes = []
  const seen = new Set()
  urls.forEach((url, index) => {
    if (!/^https?:\/\//i.test(url)) return
    const name = names[index]
    if (name && NON_MAIN_EPISODE_RE.test(name)) return
    const num = parseEpisodeNumber(name) ?? episodes.length + 1
    if (seen.has(num)) return
    seen.add(num)
    episodes.push(num)
  })
  return episodes.sort((a, b) => a - b)
}

export function sourceReportsCompleted(remarks) {
  if (!remarks || /未完|不完结|不完結|连载|連載|更新中|待续|待續/i.test(remarks)) return false
  if (/完结|完結|已完/i.test(remarks)) return true
  if (/更新至/i.test(remarks)) return false
  return /完结|完結|已完|全集|全\s*\d+\s*集|\d+\s*集全/i.test(remarks)
}

export function formatEpisodeList(episodes) {
  const sorted = [...new Set(episodes)].sort((a, b) => a - b)
  if (!sorted.length) return ''
  if (sorted.length === 1) return `第 ${sorted[0]} 集`
  const contiguous = sorted.every((num, idx) => idx === 0 || num === sorted[idx - 1] + 1)
  if (contiguous) return `第 ${sorted[0]}–${sorted[sorted.length - 1]} 集（共 ${sorted.length} 集）`
  const preview = sorted.slice(0, 6).join('、')
  return sorted.length > 6 ? `第 ${preview} 等 ${sorted.length} 集` : `第 ${preview} 集`
}

export function formatDigestText(items) {
  const lines = ['📺 xkaTV 追剧更新提醒', '']
  for (const item of items) {
    lines.push(
      `• 《${item.title}》新增 ${formatEpisodeList(item.newEpisodes)}（当前共 ${item.totalEpisodes} 集）`,
    )
  }
  return lines.join('\n')
}

function isAllowedWebhookUrl(raw) {
  try {
    const parsed = new URL((raw || '').trim())
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false
    if (parsed.username || parsed.password) return false
    const host = parsed.hostname.toLowerCase()
    return Boolean(host) && !BLOCKED_HOST_PATTERNS.some(re => re.test(host))
  } catch {
    return false
  }
}

function isAllowedDiscordWebhookUrl(raw) {
  try {
    const parsed = new URL((raw || '').trim())
    return (
      parsed.protocol === 'https:' &&
      DISCORD_WEBHOOK_HOSTS.has(parsed.hostname.toLowerCase()) &&
      /^\/api\/(v\d+\/)?webhooks\/[^/]+\/[^/]+/i.test(parsed.pathname)
    )
  } catch {
    return false
  }
}

function countEnabledChannels(row) {
  let count = 0
  if (row.telegram_enabled && row.telegram_bot_token && row.telegram_chat_id) count += 1
  if (row.discord_enabled && isAllowedDiscordWebhookUrl(row.discord_webhook_url)) count += 1
  if (row.webhook_enabled && isAllowedWebhookUrl(row.webhook_url)) count += 1
  return count
}

function createBudgetedFetch(maxSubrequests, fetchImpl = fetch) {
  let count = 0
  return {
    get used() {
      return count
    },
    get remaining() {
      return Math.max(0, maxSubrequests - count)
    },
    async fetch(url, init) {
      if (count >= maxSubrequests) {
        throw new Error('SUBREQUEST_BUDGET_EXHAUSTED')
      }
      count += 1
      return fetchImpl(url, init)
    },
  }
}

async function supabaseRpc(env, budget, fnName, params) {
  const base = env.SUPABASE_URL.replace(/\/+$/, '')
  const res = await budget.fetch(`${base}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Supabase rpc/${fnName} failed (${res.status}): ${text.slice(0, 200)}`)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}

async function fetchCmsBatch(baseUrl, vodIds, budget, reservedBudget) {
  const result = new Map()
  if (!vodIds.length || budget.remaining <= reservedBudget) return result

  const batchUrl = buildBatchDetailUrl(baseUrl, vodIds)
  try {
    const res = await budget.fetch(batchUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'xkaTV-SeriesNotifier/1.0' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.ok) {
      const data = await res.json().catch(() => null)
      const list = Array.isArray(data?.list) ? data.list : []
      for (const item of list) {
        const id = String(item?.vod_id ?? '').trim()
        if (id) result.set(id, item)
      }
    }
  } catch {
    // Fall through to missing-id check below.
  }

  // Fallback for CMS sources that ignore comma-separated batch IDs
  const missing = vodIds.filter(id => !result.has(id))
  if (vodIds.length > 1 && missing.length > 0 && result.size <= 1) {
    for (const id of missing) {
      if (budget.remaining <= reservedBudget) break
      try {
        const res = await budget.fetch(buildBatchDetailUrl(baseUrl, [id]), {
          headers: { Accept: 'application/json', 'User-Agent': 'xkaTV-SeriesNotifier/1.0' },
          signal: AbortSignal.timeout(8_000),
        })
        if (!res.ok) continue
        const data = await res.json().catch(() => null)
        const item = Array.isArray(data?.list) ? data.list[0] : null
        if (item) result.set(id, item)
      } catch {
        // Ignore single-item error and continue
      }
    }
  }

  return result
}

async function deliverUserDigest(channelRow, items, budget) {
  const text = formatDigestText(items)
  const errors = []
  let sent = 0

  if (channelRow.telegram_enabled && channelRow.telegram_bot_token && channelRow.telegram_chat_id) {
    if (budget.remaining <= 0) {
      errors.push('telegram:budget_exhausted')
    } else {
      try {
        const endpoint = `https://api.telegram.org/bot${encodeURIComponent(channelRow.telegram_bot_token)}/sendMessage`
        const res = await budget.fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          redirect: 'error',
          body: JSON.stringify({
            chat_id: channelRow.telegram_chat_id,
            text,
            disable_web_page_preview: true,
          }),
          signal: AbortSignal.timeout(10_000),
        })
        const raw = await res.text().catch(() => '')
        let apiFailed = !res.ok
        if (!apiFailed && raw) {
          try {
            const parsed = JSON.parse(raw)
            if (parsed?.ok === false) apiFailed = true
          } catch {
            // Non-JSON 2xx body treated as success
          }
        }
        if (apiFailed) errors.push(`telegram:${res.status}`)
        else sent += 1
      } catch (err) {
        errors.push(`telegram:${err.message}`)
      }
    }
  }

  if (channelRow.discord_enabled && isAllowedDiscordWebhookUrl(channelRow.discord_webhook_url)) {
    if (budget.remaining <= 0) {
      errors.push('discord:budget_exhausted')
    } else {
      try {
        const description = items
          .map(
            item =>
              `• **《${item.title}》** 新增 ${formatEpisodeList(item.newEpisodes)}（当前共 ${item.totalEpisodes} 集）`,
          )
          .join('\n')
        const res = await budget.fetch(channelRow.discord_webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          redirect: 'error',
          body: JSON.stringify({
            username: 'xkaTV 追剧提醒',
            embeds: [
              {
                title: '📺 xkaTV 追剧更新提醒',
                description,
                color: 0xef4444,
                timestamp: new Date().toISOString(),
              },
            ],
          }),
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) errors.push(`discord:${res.status}`)
        else sent += 1
      } catch (err) {
        errors.push(`discord:${err.message}`)
      }
    }
  }

  if (channelRow.webhook_enabled && isAllowedWebhookUrl(channelRow.webhook_url)) {
    if (budget.remaining <= 0) {
      errors.push('webhook:budget_exhausted')
    } else {
      try {
        const headers = {
          'Content-Type': 'application/json',
          'User-Agent': 'xkaTV-SeriesNotifier/1.0',
        }
        if (channelRow.webhook_secret) {
          headers['X-Webhook-Secret'] = channelRow.webhook_secret
        }
        const res = await budget.fetch(channelRow.webhook_url, {
          method: 'POST',
          headers,
          redirect: 'error',
          body: JSON.stringify({
            event: 'series.update',
            app: 'xkaTV',
            message: text,
            items,
            sentAt: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(10_000),
        })
        if (!res.ok) errors.push(`webhook:${res.status}`)
        else sent += 1
      } catch (err) {
        errors.push(`webhook:${err.message}`)
      }
    }
  }

  return { sent, errors }
}

export async function runSeriesCheck(env, fetchImpl = fetch) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  }

  const cooldownHours = Math.max(0, Number(env.CHECK_COOLDOWN_HOURS ?? 2))
  const maxSubrequests = Math.max(10, Number(env.MAX_SUBREQUESTS ?? 42))
  const maxIdsPerBatch = Math.max(1, Math.min(50, Number(env.MAX_IDS_PER_BATCH ?? 20)))
  const budget = createBudgetedFetch(maxSubrequests, fetchImpl)
  const sourcesMap = await loadCmsSourcesMap([env.CMS_SOURCES_JSON, env.CMS_SOURCES_URL], budget)

  const summary = {
    configuredSources: sourcesMap.size,
    subscribedUsers: 0,
    checkedSources: 0,
    checkedResources: 0,
    updatedRows: 0,
    notifiedUsers: 0,
    subrequestsUsed: 0,
    errors: [],
  }

  if (sourcesMap.size === 0) {
    summary.errors.push('CMS_SOURCES_JSON / CMS_SOURCES_URL is empty')
    summary.subrequestsUsed = budget.used
    return summary
  }

  // 1. Single RPC loads enabled channels (active accounts) + due actively-tracked series
  const due =
    (await supabaseRpc(env, budget, 'get_due_series_notifications', {
      p_cooldown_hours: cooldownHours,
      p_limit: 200,
    })) || {}

  const channelRows = Array.isArray(due.channels) ? due.channels : []
  const notificationRows = Array.isArray(due.items) ? due.items : []

  summary.subscribedUsers = channelRows.length
  if (!channelRows.length || !notificationRows.length) {
    summary.subrequestsUsed = budget.used
    return summary
  }

  const channelsByUser = new Map(channelRows.map(row => [row.user_id, row]))

  // 2. Deduplicate by (source_code, vod_id) and group vod_ids per source
  const bySource = new Map()
  for (const row of notificationRows) {
    if (!sourcesMap.has(row.source_code)) continue
    if (!bySource.has(row.source_code)) bySource.set(row.source_code, new Map())
    const vodMap = bySource.get(row.source_code)
    if (!vodMap.has(row.vod_id)) vodMap.set(row.vod_id, [])
    vodMap.get(row.vod_id).push(row)
  }

  // Track needed push subrequests dynamically + 1 reserved for batch DB update RPC
  const digestsByUser = new Map()
  const digestDedupeKeys = new Set()
  const nowIso = new Date().toISOString()
  const pendingUpdates = []

  const reservedForWritesAndPushes = () => {
    let pushes = 0
    for (const userId of digestsByUser.keys()) {
      const ch = channelsByUser.get(userId)
      if (ch) pushes += countEnabledChannels(ch)
    }
    // Always keep at least 1 subrequest for batch_update_series_notifications + pending pushes + 2 buffer
    return 1 + pushes + 2
  }

  // 3. Batch-fetch CMS details per source
  for (const [sourceCode, vodMap] of bySource.entries()) {
    if (budget.remaining <= reservedForWritesAndPushes()) break
    const baseUrl = sourcesMap.get(sourceCode)
    const allVodIds = [...vodMap.keys()]
    summary.checkedSources += 1

    for (let i = 0; i < allVodIds.length; i += maxIdsPerBatch) {
      const reserved = reservedForWritesAndPushes()
      if (budget.remaining <= reserved) break
      const chunk = allVodIds.slice(i, i + maxIdsPerBatch)
      const fetched = await fetchCmsBatch(baseUrl, chunk, budget, reserved)

      for (const vodId of chunk) {
        const vodItem = fetched.get(vodId)
        if (!vodItem) continue
        summary.checkedResources += 1

        const currentEpisodes = extractPlayableEpisodeNumbers(vodItem)
        if (!currentEpisodes.length) continue
        const completed = sourceReportsCompleted(vodItem.vod_remarks)
        const cmsTitle = String(vodItem.vod_name || '').trim()

        for (const row of vodMap.get(vodId)) {
          const knownSet = new Set(Array.isArray(row.known_episodes) ? row.known_episodes : [])
          const newEpisodes = currentEpisodes.filter(ep => !knownSet.has(ep))
          const displayTitle = cmsTitle || String(row.title || '').trim() || `剧集 #${vodId}`

          pendingUpdates.push({
            userId: row.user_id,
            resourceHash: row.resource_hash,
            knownEpisodes: currentEpisodes,
            lastCheckedAt: nowIso,
            sourceCompleted: completed,
            title: displayTitle,
          })

          if (newEpisodes.length > 0) {
            const dedupeKey = `${row.user_id}::${row.tracking_key || ''}::${sourceCode}::${vodId}`
            if (!digestDedupeKeys.has(dedupeKey)) {
              digestDedupeKeys.add(dedupeKey)
              if (!digestsByUser.has(row.user_id)) digestsByUser.set(row.user_id, [])
              digestsByUser.get(row.user_id).push({
                title: displayTitle,
                sourceCode,
                vodId,
                newEpisodes,
                totalEpisodes: currentEpisodes.length,
              })
            }
          }
        }
      }
    }
  }

  // 4. Atomically persist ALL checked rows in ONE single Supabase RPC call
  //    BEFORE sending notifications so a DB failure can never cause duplicate push spam.
  if (pendingUpdates.length > 0) {
    try {
      const updatedCount = await supabaseRpc(env, budget, 'batch_update_series_notifications', {
        p_updates: pendingUpdates,
      })
      summary.updatedRows = typeof updatedCount === 'number' ? updatedCount : pendingUpdates.length
    } catch (err) {
      summary.errors.push(`batch_update:${err.message}`)
      summary.subrequestsUsed = budget.used
      return summary
    }
  }

  // 5. Send 1 digest message per user per enabled channel
  for (const [userId, items] of digestsByUser.entries()) {
    const channelRow = channelsByUser.get(userId)
    if (!channelRow || !items.length) continue
    const { sent, errors } = await deliverUserDigest(channelRow, items, budget)
    if (errors.length) {
      summary.errors.push(...errors)
    }
    if (sent > 0) {
      summary.notifiedUsers += 1
    }
  }

  summary.subrequestsUsed = budget.used
  return summary
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(
      runSeriesCheck(env)
        .then(summary => console.log('[xkaTV series-notifier]', JSON.stringify(summary)))
        .catch(err => console.error('[xkaTV series-notifier] failed:', err)),
    )
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') {
      return Response.json({ ok: true, service: 'xkatv-series-notifier' })
    }
    if (request.method === 'POST' && url.pathname === '/run') {
      if (!env.TRIGGER_SECRET) {
        return Response.json({ error: 'Manual trigger disabled' }, { status: 403 })
      }
      const token = request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
      if (!token || !timingSafeEqual(token, env.TRIGGER_SECRET)) {
        return Response.json({ error: 'Unauthorized' }, { status: 401 })
      }
      try {
        const summary = await runSeriesCheck(env)
        return Response.json({ ok: true, summary })
      } catch (err) {
        return Response.json({ ok: false, error: err.message }, { status: 500 })
      }
    }
    return Response.json({ ok: true, message: 'xkaTV Series Notifier Cron Worker' })
  },
}
