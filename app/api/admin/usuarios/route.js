import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('genesis_usuarios')
    .select('*')
    .order('creado_en', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req) {
  try {
    const { id, ...campos } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const { error } = await supabaseAdmin
      .from('genesis_usuarios')
      .update(campos)
      .eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch(e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
