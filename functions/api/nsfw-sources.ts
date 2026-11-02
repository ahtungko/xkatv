import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { accountSchema } from '../../shared/account-rules.js'

interface Env {
  XKA_SUPABASE_URL?: string
  SUPABASE_URL?: string
  XKA_SUPABASE_ANON_KEY?: string
  XKA_SUPABASE_PUBLISHABLE_KEY?: string
  NSFW_VIDEO_SOURCES?: string
  [key: string]: unknown
}

interface Context {
  request: Request
  env: Env
  params: unknown
}

const sourceSchema = z.object({
  id: z.string().trim().min(1).max(160).optional(),
  name: z.string().trim().min(1).max(160),
  url: z.string().trim().min(1).max(4096),
  detailUrl: z.string().trim().min(1).max(4096).optional(),
  isEnabled: z.boolean().optional(),
  timeout: z.number().int().positive().max(120_000).optional(),
  retry: z.number().int().min(0).max(10).optional(),
})

function removeSurroundingQuotes(value: string) {
  const trimmed = value.trim()
  const first = trimmed.at(0)
  const last = trimmed.at(-1)
  return trimmed.length >= 2 && first === last && (first === "'" || first === '"')
    ? trimmed.slice(1, -1)
    : trimmed
}

async function loadSources(nsfwSourcesEnv?: string) {
  let sourceText = nsfwSourcesEnv?.trim() ?? ''
  if (!sourceText) return []
  let remoteUrl: URL | null = null
  try {
    remoteUrl = new URL(sourceText)
  } catch {
    // Inline JSON continues below.
  }
  if (remoteUrl) {
    const response = await fetch(remoteUrl, { signal: AbortSignal.timeout(8_000), cache: 'no-store' })
    if (!response.ok) throw new Error(`Source request failed: ${response.status}`)
    sourceText = await response.text()
  }
  const parsed: unknown = JSON.parse(removeSurroundingQuotes(sourceText))
  const items = Array.isArray(parsed) ? parsed : [parsed]
  return items.flatMap((item, index) => {
    const source = sourceSchema.safeParse(item)
    return source.success ? [{ ...source.data, id: `nsfw_env_${index}` }] : []
  })
}

const noStoreHeaders = {
  'Cache-Control': 'private, no-store',
}

export const onRequest = async (context: Context): Promise<Response> => {
  const method = context.request.method
  if (method !== 'GET') {
    return Response.json(
      { error: 'Method not allowed' },
      {
        status: 405,
        headers: {
          ...noStoreHeaders,
          Allow: 'GET',
        },
      },
    )
  }

  const token = context.request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!token) {
    return Response.json({ error: '请先登录' }, { status: 401, headers: noStoreHeaders })
  }

  const env = context.env || {}
  const url = env.XKA_SUPABASE_URL || env.SUPABASE_URL
  const key = env.XKA_SUPABASE_ANON_KEY || env.XKA_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    return Response.json({ error: '账号服务尚未配置完成' }, { status: 503, headers: noStoreHeaders })
  }

  try {
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data, error } = await client.rpc('current_account')
    if (error) {
      return Response.json({ error: '登录已失效，请重新登录' }, { status: 401, headers: noStoreHeaders })
    }

    const account = accountSchema.safeParse(data?.[0])
    if (!account.success || !account.data.enabled) {
      return Response.json({ error: '账号不可用' }, { status: 403, headers: noStoreHeaders })
    }

    if (account.data.role !== 'admin') {
      const access = await client.rpc('account_is_active')
      if (access.error) {
        return Response.json({ error: '暂时无法确认网站状态' }, { status: 503, headers: noStoreHeaders })
      }
      if (access.data !== true) {
        return Response.json(
          { error: '网站维护中，请稍后再试', maintenance: true },
          {
            status: 503,
            headers: {
              ...noStoreHeaders,
              'Retry-After': '15',
            },
          },
        )
      }
    }

    if (account.data.role !== 'admin' && !account.data.allow_nsfw) {
      return Response.json({ sources: [] }, { status: 200, headers: noStoreHeaders })
    }

    const sources = await loadSources(env.NSFW_VIDEO_SOURCES)
    return Response.json({ sources }, { status: 200, headers: noStoreHeaders })
  } catch {
    return Response.json({ error: 'NSFW 视频源暂时不可用' }, { status: 500, headers: noStoreHeaders })
  }
}
