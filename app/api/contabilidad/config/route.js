import { requirePermiso } from '../../../../lib/auth-server'
import { getDb, ok, bad, handle, esAdmin, bitacoraCatalogo, modoPruebaActivo } from '../_lib'

export const dynamic = 'force-dynamic'

function claveUi(email) { return 'ui:' + String(email || '').toLowerCase() }

// GET /api/contabilidad/config?email=  -> { modo_prueba, ui_prefs }
export async function GET(request) {
  const _g = await requirePermiso('contabilidad'); if (_g.response) return _g.response;

  return handle(async () => {
    const email = new URL(request.url).searchParams.get('email')
    let ui = {}
    if (email) {
      const { data } = await getDb().from('conta_config').select('valor').eq('clave', claveUi(email)).maybeSingle()
      ui = data?.valor || {}
    }
    return ok({ modo_prueba: await modoPruebaActivo(), ui_prefs: ui })
  })
}

// POST /api/contabilidad/config
//   { actor, modo_prueba: bool }            -> cambia el flag global (solo admin)
//   { actor, ui_prefs: {...} }              -> guarda prefs de UI del propio usuario
export async function POST(request) {
  const _g = await requirePermiso('contabilidad'); if (_g.response) return _g.response;

  return handle(async () => {
    const db = getDb()
    const b = await request.json().catch(() => ({}))

    // Preferencias de UI por usuario (cualquier usuario guarda las suyas)
    if (b.ui_prefs && typeof b.ui_prefs === 'object') {
      if (!b.actor) return bad('No se pudo identificar al usuario.')
      const { data: prev } = await db.from('conta_config').select('valor').eq('clave', claveUi(b.actor)).maybeSingle()
      const valor = { ...(prev?.valor || {}), ...b.ui_prefs }
      const { error } = await db.from('conta_config').upsert({
        clave: claveUi(b.actor), valor, actualizado_por: b.actor, actualizado_en: new Date().toISOString(),
      }, { onConflict: 'clave' })
      if (error) throw error
      return ok({ ui_prefs: valor })
    }

    // Flag global de modo prueba (solo admin)
    if ('modo_prueba' in b) {
      if (!(await esAdmin(b.actor))) return bad('Solo un admin puede cambiar el modo prueba.', 403)
      const activo = b.modo_prueba === true
      const { error } = await db.from('conta_config').upsert({
        clave: 'modo_prueba', valor: { activo }, actualizado_por: b.actor, actualizado_en: new Date().toISOString(),
      }, { onConflict: 'clave' })
      if (error) throw error
      await bitacoraCatalogo('modo_prueba', b.actor, { activo })
      return ok({ modo_prueba: activo })
    }

    return bad('Nada para guardar.')
  })
}
