import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { accountEmail, accountSchema, adminActionSchema } from '../../shared/account-rules.js'

interface Env {
  XKA_SUPABASE_URL?: string
  SUPABASE_URL?: string
  XKA_SUPABASE_ANON_KEY?: string
  XKA_SUPABASE_PUBLISHABLE_KEY?: string
  SUPABASE_SERVICE_ROLE_KEY?: string
  SUPABASE_SECRET_KEY?: string
  [key: string]: unknown
}

interface Context {
  request: Request
  env: Env
  params: unknown
}

const noStoreHeaders = {
  'Cache-Control': 'no-store',
}

export const onRequest = async (context: Context): Promise<Response> => {
  const method = context.request.method
  if (method !== 'GET' && method !== 'POST') {
    return Response.json(
      { error: 'Method not allowed' },
      {
        status: 405,
        headers: {
          ...noStoreHeaders,
          Allow: 'GET, POST',
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
  const secret = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY

  if (!url || !key || !secret) {
    return Response.json({ error: '账号管理尚未配置完成' }, { status: 503, headers: noStoreHeaders })
  }

  try {
    // Verify the caller through RLS and live session state before using the privileged client.
    const caller = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })

    const { data: profiles, error: profileError } = await caller.rpc('current_account')
    if (profileError) {
      return Response.json({ error: '登录已失效，请重新登录' }, { status: 401, headers: noStoreHeaders })
    }

    const profile = accountSchema.safeParse(profiles?.[0])
    if (!profile.success || !profile.data.enabled || profile.data.role !== 'admin') {
      return Response.json({ error: '仅管理员可管理账号' }, { status: 403, headers: noStoreHeaders })
    }

    const admin = createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false },
    })

    if (method === 'GET') {
      const reqUrl = new URL(context.request.url)
      const offsetParam = reqUrl.searchParams.get('offset')
      const offset = Number(offsetParam ?? 0)
      const pageSize = 20
      const search = reqUrl.searchParams.get('search')?.trim().toLowerCase() || ''
      const idParam = reqUrl.searchParams.get('id')
      const view = reqUrl.searchParams.get('view')

      if (
        !Number.isSafeInteger(offset) ||
        offset < 0 ||
        offset > Number.MAX_SAFE_INTEGER - pageSize
      ) {
        return Response.json({ error: 'Invalid offset' }, { status: 400, headers: noStoreHeaders })
      }

      if (idParam !== null) {
        const id = z.string().uuid().safeParse(idParam)
        if (!id.success) {
          return Response.json({ error: 'Invalid account id' }, { status: 400, headers: noStoreHeaders })
        }

        const { data: account, error } = await admin
          .from('user_accounts')
          .select('id,username,role,enabled,allow_nsfw,created_at')
          .eq('id', id.data)
          .maybeSingle()

        if (error) throw error
        if (!account) {
          return Response.json({ error: '账号不存在或已删除' }, { status: 404, headers: noStoreHeaders })
        }

        const [devices, authUser] = await Promise.all([
          admin
            .from('account_devices')
            .select('label,first_seen_at,last_seen_at', { count: 'exact' })
            .eq('user_id', id.data)
            .order('last_seen_at', { ascending: false })
            .order('session_id')
            .range(offset, offset + pageSize - 1),
          admin.auth.admin.getUserById(id.data),
        ])

        if (devices.error) throw devices.error
        if (authUser.error) throw authUser.error

        return Response.json(
          {
            account: {
              ...account,
              last_sign_in_at: authUser.data.user.last_sign_in_at ?? null,
              devices: devices.data ?? [],
            },
            total: devices.count ?? 0,
          },
          { status: 200, headers: noStoreHeaders },
        )
      }

      if (view === 'audit') {
        const { data, error, count } = await admin
          .from('admin_audit_log')
          .select('id,actor_username,target_username,action,details,created_at', { count: 'exact' })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(offset, offset + pageSize - 1)

        if (error) throw error
        return Response.json({ audit: data, total: count ?? 0 }, { status: 200, headers: noStoreHeaders })
      }

      const enabled = reqUrl.searchParams.get('enabled')
      const nsfw = reqUrl.searchParams.get('nsfw')

      if (
        [enabled, nsfw].some(value => value !== null && value !== 'true' && value !== 'false')
      ) {
        return Response.json({ error: 'Invalid filter' }, { status: 400, headers: noStoreHeaders })
      }

      if (search.length > 32) {
        return Response.json({ error: '搜索词最多 32 个字符' }, { status: 400, headers: noStoreHeaders })
      }

      let accountQuery = admin
        .from('user_accounts')
        .select('id,username,role,enabled,allow_nsfw,created_at', { count: 'exact' })
        .order('created_at')
        .order('id')
        .range(offset, offset + pageSize - 1)

      if (enabled !== null) accountQuery = accountQuery.eq('enabled', enabled === 'true')
      if (nsfw === 'true') accountQuery = accountQuery.or('role.eq.admin,allow_nsfw.eq.true')
      if (nsfw === 'false') accountQuery = accountQuery.eq('role', 'user').eq('allow_nsfw', false)
      if (search) {
        accountQuery = accountQuery.ilike(
          'username',
          `%${search.split('\\').join('\\\\').split('%').join('\\%').split('_').join('\\_')}%`,
        )
      }

      const { data, error, count } = await accountQuery
      if (error) throw error
      return Response.json({ accounts: data ?? [], total: count ?? 0 }, { status: 200, headers: noStoreHeaders })
    }

    const contentType = context.request.headers.get('content-type')
    if (!contentType?.startsWith('application/json')) {
      return Response.json({ error: 'Expected application/json' }, { status: 415, headers: noStoreHeaders })
    }

    const body = await context.request.json().catch(() => null)
    const parsed = adminActionSchema.safeParse(body)
    if (!parsed.success) {
      return Response.json({ error: '请检查用户名和密码（密码至少 10 个字符）' }, { status: 400, headers: noStoreHeaders })
    }

    const action = parsed.data
    if (action.action === 'create') {
      const { data: created, error } = await admin.auth.admin.createUser({
        email: accountEmail(action.username),
        password: action.password,
        email_confirm: true,
        app_metadata: { managed_account: true, username: action.username, account_role: 'user' },
      })

      if (error) {
        return Response.json({ error: '创建失败，请检查用户名是否已存在及密码要求' }, { status: 400, headers: noStoreHeaders })
      }
      if (!created.user) {
        return Response.json({ error: '账号创建未返回用户' }, { status: 500, headers: noStoreHeaders })
      }

      const { error: profileError } = await admin.from('user_accounts').insert({
        id: created.user.id,
        username: action.username,
        role: 'user',
        enabled: true,
        allow_nsfw: action.allow_nsfw,
      })

      if (profileError) {
        await admin.auth.admin.deleteUser(created.user.id)
        return Response.json(
          { error: '账号资料创建失败，请检查数据库迁移和用户名是否已存在' },
          { status: 400, headers: noStoreHeaders },
        )
      }

      await admin.from('admin_audit_log').insert({
        actor_id: profile.data.id,
        actor_username: profile.data.username,
        target_id: created.user.id,
        target_username: action.username,
        action: 'create',
      })
    } else {
      const { data: target, error: targetError } = await admin
        .from('user_accounts')
        .select('id,role,username,allow_nsfw')
        .eq('id', action.id)
        .maybeSingle()

      if (targetError) throw targetError
      // Admin accounts are managed by the operator; prevent self-lockout and privilege changes.
      if (!target || target.role !== 'user' || action.id === profile.data.id) {
        return Response.json({ error: '此操作仅适用于普通用户账号' }, { status: 403, headers: noStoreHeaders })
      }

      const targetUsername = target.username
      const { error: revokeError } =
        action.action === 'set-nsfw'
          ? await admin.rpc('set_account_nsfw', {
              target_id: action.id,
              new_allow_nsfw: action.allow_nsfw,
            })
          : await admin.rpc('invalidate_account_sessions', {
              target_id: action.id,
              new_enabled: action.action === 'set-enabled' ? action.enabled : null,
            })

      if (revokeError) throw revokeError

      if (action.action === 'reset-password') {
        const { error } = await admin.auth.admin.updateUserById(action.id, {
          password: action.password,
        })
        if (error) {
          return Response.json({ error: '密码修改失败；旧会话已失效，请重试' }, { status: 400, headers: noStoreHeaders })
        }
        const { error: finalRevokeError } = await admin.rpc('invalidate_account_sessions', {
          target_id: action.id,
        })
        if (finalRevokeError) throw finalRevokeError
      }

      if (action.action === 'delete') {
        const { error } = await admin.auth.admin.deleteUser(action.id)
        if (error) {
          return Response.json({ error: '删除账号失败，请重试' }, { status: 400, headers: noStoreHeaders })
        }
      }

      const auditAction = action.action.replace('-', '_')
      await admin.from('admin_audit_log').insert({
        actor_id: profile.data.id,
        actor_username: profile.data.username,
        target_id: action.id,
        target_username: targetUsername,
        action: auditAction,
        details:
          action.action === 'set-enabled'
            ? { enabled: action.enabled }
            : action.action === 'set-nsfw'
              ? { allow_nsfw: action.allow_nsfw }
              : {},
      })
    }

    return Response.json({ ok: true }, { status: 200, headers: noStoreHeaders })
  } catch {
    return Response.json({ error: '账号服务暂时不可用，请检查服务端配置和数据库迁移' }, { status: 500, headers: noStoreHeaders })
  }
}
