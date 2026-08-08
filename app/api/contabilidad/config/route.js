import { getDb, ok, bad, handle, esAdmin, bitacoraCatalogo, modoPruebaActivo } from '../_lib'

export const dynamic = 'force-dynamic'

// GET /api/contabilidad/config -> { modo_prueba }
export async function GET() {
  return handle(async () => ok({ modo_prueba: await modoPruebaActivo() }))
}

// POST /api/contabilidad/config  { actor, modo_prueba: bool }  (solo admin)
export async function POST(request) {
  return handle(async () => {
    const b = await request.json().catch(() => ({}))
    if (!(await esAdmin(b.actor))) return bad('Solo un admin puede cambiar el modo prueba.', 403)
    const activo = b.modo_prueba === true
    const { error } = await getDb().from('conta_config').upsert({
      clave: 'modo_prueba', valor: { activo }, actualizado_por: b.actor, actualizado_en: new Date().toISOString(),
    }, { onConflict: 'clave' })
    if (error) throw error
    await bitacoraCatalogo('modo_prueba', b.actor, { activo })
    return ok({ modo_prueba: activo })
  })
}
