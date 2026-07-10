// API de configuración del Panel de Incomodidad.
// Todo el acceso de escritura va por acá con el service_role key (bypassa RLS).
//   GET   -> { config, cuentas, gastos_nuevos }
//   PATCH -> actualiza config (margen/override), toggles de cuentas y gastos nuevos
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

let _sb
function getDb() {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
  }
  return _sb
}

export async function GET() {
  try {
    const db = getDb()
    const [cfg, cuentas, gastos] = await Promise.all([
      db.from('incomodidad_config').select('*').eq('id', 1).maybeSingle(),
      db.from('incomodidad_cuentas_detectadas').select('*'),
      db.from('incomodidad_gastos_nuevos').select('*').order('fecha_inicio', { ascending: true }),
    ])
    if (cfg.error) throw cfg.error
    if (cuentas.error) throw cuentas.error
    if (gastos.error) throw gastos.error
    return NextResponse.json({
      config: cfg.data,
      cuentas: cuentas.data || [],
      gastos_nuevos: gastos.data || [],
    })
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function PATCH(req) {
  try {
    const db = getDb()
    const body = await req.json()

    // 1) Config global (margen objetivo / override de costos fijos)
    if (body.config) {
      const patch = { updated_at: new Date().toISOString() }
      if (body.config.margen_bruto_objetivo != null) {
        patch.margen_bruto_objetivo = Number(body.config.margen_bruto_objetivo)
      }
      if ('costos_fijos_override' in body.config) {
        const v = body.config.costos_fijos_override
        patch.costos_fijos_override = (v === '' || v == null) ? null : Number(v)
      }
      const { error } = await db.from('incomodidad_config').update(patch).eq('id', 1)
      if (error) throw error
    }

    // 2) Toggle de cuentas (incluir / es_fijo). Upsert por si la cuenta era
    //    "sin clasificar" y todavía no existía fila en incomodidad_cuentas_gasto.
    if (Array.isArray(body.cuentas)) {
      const rows = body.cuentas
        .filter((c) => c && c.cuenta_contable)
        .map((c) => ({
          cuenta_contable: c.cuenta_contable,
          incluir: !!c.incluir,
          es_fijo: c.es_fijo != null ? !!c.es_fijo : !!c.incluir,
          updated_at: new Date().toISOString(),
        }))
      if (rows.length) {
        const { error } = await db
          .from('incomodidad_cuentas_gasto')
          .upsert(rows, { onConflict: 'cuenta_contable' })
        if (error) throw error
      }
    }

    // 3) Gastos nuevos: crear / actualizar / borrar
    if (Array.isArray(body.gastos_nuevos)) {
      for (const g of body.gastos_nuevos) {
        if (g._delete && g.id) {
          const { error } = await db.from('incomodidad_gastos_nuevos').delete().eq('id', g.id)
          if (error) throw error
        } else if (g.id) {
          const { error } = await db.from('incomodidad_gastos_nuevos').update({
            concepto: g.concepto,
            monto_mensual: Number(g.monto_mensual) || 0,
            fecha_inicio: g.fecha_inicio,
            activo: g.activo != null ? !!g.activo : true,
          }).eq('id', g.id)
          if (error) throw error
        } else if (g.concepto && g.monto_mensual != null && g.fecha_inicio) {
          const { error } = await db.from('incomodidad_gastos_nuevos').insert({
            concepto: g.concepto,
            monto_mensual: Number(g.monto_mensual) || 0,
            fecha_inicio: g.fecha_inicio,
          })
          if (error) throw error
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
