import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let _sb
function getDb() {
  if (!_sb) _sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  return _sb
}

// GET: devuelve las dos listas (sin peso / por revisar) + contador de alertas.
export async function GET() {
  try {
    const db = getDb()
    const [sinPeso, porRevisar, alertas] = await Promise.all([
      db.from('v_productos_sin_peso').select('codigo_interno, item, categoria, peso_kg, estado'),
      db.from('v_pesos_por_revisar').select('codigo_interno, producto, categoria, clase, peso_kg, estado, motivo'),
      db.from('pesos_alertas_log').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    ])
    if (sinPeso.error) throw sinPeso.error
    if (porRevisar.error) throw porRevisar.error

    return NextResponse.json({
      sin_peso: sinPeso.data || [],
      por_revisar: porRevisar.data || [],
      alertas_pendientes: alertas.count || 0,
    })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: upsert del peso asignado manualmente.
export async function POST(request) {
  try {
    const body = await request.json()
    const codigo = (body.codigo_interno || '').trim()
    const pesoKg = Number(body.peso_kg)
    const usuario = (body.actualizado_por || 'Manual').trim()

    if (!codigo) return NextResponse.json({ error: 'Falta el código.' }, { status: 400 })
    if (!Number.isFinite(pesoKg) || pesoKg <= 0) {
      return NextResponse.json({ error: 'El peso debe ser un número mayor a 0.' }, { status: 400 })
    }

    const { error } = await getDb()
      .from('item_pesos')
      .upsert({
        codigo_interno: codigo,
        peso_kg: pesoKg,
        estado: 'Asignado',
        fuente: 'Manual',
        actualizado: new Date().toISOString(),
        actualizado_por: usuario,
      }, { onConflict: 'codigo_interno' })

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
