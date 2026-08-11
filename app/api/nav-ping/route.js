import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// POST /api/nav-ping  { email, modulo }
// Cuenta (best-effort) que un usuario abrió un módulo. Se usa para personalizar
// el orden del menú más adelante. Nunca debe romper la navegación: ante
// cualquier error responde ok igual y no propaga.
export async function POST(request) {
  try {
    const { email, modulo } = await request.json()
    if (!email || !modulo) return Response.json({ ok: false }, { status: 200 })
    const db = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xeeieqjqmtoiutfnltqu.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
    await db.rpc('nav_uso_inc', { p_email: String(email), p_modulo: String(modulo) })
    return Response.json({ ok: true })
  } catch {
    return Response.json({ ok: false }, { status: 200 })
  }
}
