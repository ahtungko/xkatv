import { createClient } from '@supabase/supabase-js'
import { getPublicEnv } from '@/shared/config/runtimeEnv'

const url = getPublicEnv('XKA_SUPABASE_URL')?.trim()
const key = (
  getPublicEnv('XKA_SUPABASE_ANON_KEY') || getPublicEnv('XKA_SUPABASE_PUBLISHABLE_KEY')
)?.trim()

// Only the public publishable/anon key belongs in frontend configuration.
export const syncClient = url && key ? createClient(url, key) : null
