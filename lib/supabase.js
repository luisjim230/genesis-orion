import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xeeieqjqmtoiutfnltqu.supabase.co'
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_TX8OYawDu3vjd1Upet2GbQ_SURnQqRs'

export const supabase = createClient(url, key)
