import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

export async function GET() {
  const { data, error } = await sb.from('kommo_proveedores').select('*').order('nombre_proveedor')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function POST(req) {
  const { nombre_proveedor, whatsapp, notas } = await req.json()
  if (!nombre_proveedor) return NextResponse.json({ error: 'nombre requerido' }, { status: 400 })
  const { data, error } = await sb.from('kommo_proveedores').upsert({ nombre_proveedor, whatsapp, notas, actualizado_en: new Date().toISOString() }, { onConflict: 'nombre_proveedor' }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function DELETE(req) {
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
  const { error } = await sb.from('kommo_proveedores').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
