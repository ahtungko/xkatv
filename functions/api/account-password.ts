import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { accountEmail, accountSchema, passwordSchema } from '../../shared/account-rules.js'

interface Env {
  XKA_SUPABASE_URL?: string
  SUPABASE_URL?: string
  XKA_SUPABASE_ANON_KEY?: string
  XKA_SUPABASE_PUBLISHABLE_KEY?: string
  [key: string]: unknown
}

interface Context {
  request: Request
  env: Env
  params: unknown
}

const inputSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: passwordSchema,
})

const noStoreHeaders = {
  'Cache-Control': 'no-store',
}

export const onRequest = async (context: Context): Promise<Response> => {
  const method = context.request.method
  if (method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed' },
      {
        status: 405,
        headers: {
          ...noStoreHeaders,
          Allow: 'POST',
        },
      },
    )
  }

  const token = context.request.headers.get('authorization')?.match(/^Bearer (\S+)$/)?.[1]
  if (!token) {
    return Response.json({ error: '请重新登录' }, { status: 401, headers: noStoreHeaders })
  }

  const contentType = context.request.headers.get('content-type')
  if (!contentType?.startsWith('application/json')) {
    return Response.json({ error: 'Expected application/json' }, { status: 415, headers: noStoreHeaders })
  }

  const body = await context.request.json().catch(() => null)
  const input = inputSchema.safeParse(body)
  if (!input.success) {
    return Response.json({ error: '请填写当前密码，新密码需为 10–128 个字符' }, { status: 400, headers: noStoreHeaders })
  }
  if (input.data.currentPassword === input.data.newPassword) {
    return Response.json({ error: '新密码不能与当前密码相同' }, { status: 400, headers: noStoreHeaders })
  }

  const env = context.env || {}
  const url = env.XKA_SUPABASE_URL || env.SUPABASE_URL
  const key = env.XKA_SUPABASE_ANON_KEY || env.XKA_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    return Response.json({ error: '账号服务尚未配置完成' }, { status: 503, headers: noStoreHeaders })
  }

  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  }

  try {
    const caller = createClient(url, key, {
      ...options,
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    const { data, error } = await caller.rpc('current_account')
    const account = accountSchema.safeParse(data?.[0])
    if (error || !account.success || !account.data.enabled) {
      return Response.json({ error: '账号或会话已失效，请重新登录' }, { status: 401, headers: noStoreHeaders })
    }

    if (account.data.role !== 'admin') {
      const access = await caller.rpc('account_is_active')
      if (access.error) {
        return Response.json({ error: '暂时无法确认网站状态' }, { status: 503, headers: noStoreHeaders })
      }
      if (access.data !== true) {
        return Response.json({ error: '网站维护中，请稍后再试', maintenance: true }, { status: 503, headers: noStoreHeaders })
      }
    }

    // Reauthenticate in an isolated, non-persistent client. Never accept a target user ID.
    const verifier = createClient(url, key, options)
    const verified = await verifier.auth.signInWithPassword({
      email: accountEmail(account.data.username),
      password: input.data.currentPassword,
    })

    try {
      if (verified.error || !verified.data.session || verified.data.user?.id !== account.data.id) {
        return Response.json(
          { error: '当前密码不正确，或请求过于频繁，请稍后重试' },
          { status: 400, headers: noStoreHeaders },
        )
      }
      const active = await verifier.rpc('current_account')
      if (active.error || active.data?.[0]?.id !== account.data.id || !active.data[0].enabled) {
        return Response.json({ error: '账号已不可用，请联系管理员' }, { status: 403, headers: noStoreHeaders })
      }
      if (account.data.role !== 'admin') {
        const access = await verifier.rpc('account_is_active')
        if (access.error) {
          return Response.json({ error: '暂时无法确认网站状态' }, { status: 503, headers: noStoreHeaders })
        }
        if (access.data !== true) {
          return Response.json({ error: '网站维护中，请稍后再试', maintenance: true }, { status: 503, headers: noStoreHeaders })
        }
      }
      const updated = await verifier.auth.updateUser({
        password: input.data.newPassword,
        current_password: input.data.currentPassword,
      })
      if (updated.error) {
        return Response.json(
          { error: '修改失败，请检查新密码是否符合密码要求后重试' },
          { status: 400, headers: noStoreHeaders },
        )
      }
      return Response.json({ ok: true }, { status: 200, headers: noStoreHeaders })
    } finally {
      // Dispose only the temporary verification session, preserving the browser session.
      if (verified.data?.session) await verifier.auth.signOut({ scope: 'local' }).catch(() => {})
    }
  } catch {
    return Response.json({ error: '账号服务暂时不可用，请稍后重试' }, { status: 500, headers: noStoreHeaders })
  }
}
