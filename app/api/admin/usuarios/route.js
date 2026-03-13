import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

// GET /api/admin/usuarios → lista todos los usuarios
export async function GET() {
  const { data, error } = await supabase
    .from('usuarios_sol')
    .select('*')
    .order('creado_en', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

// PATCH /api/admin/usuarios → actualiza rol, activo o permisos_extra
export async function PATCH(req) {
  const body = await req.json()
  const { id, ...campos } = body

  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

  const { data, error } = await supabase
    .from('usuarios_sol')
    .update(campos)
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
