import { requirePermiso } from '../../../../lib/auth-server'
import { getDb, ok, handle } from '../_lib'

export const dynamic = 'force-dynamic'

// GET /api/contabilidad/catalogos?email=...
// Devuelve todos los catálogos que la UI necesita (comboboxes, reglas, etc.)
// y el aprobador correspondiente al email logueado (rol + monto_maximo).
export async function GET(request) {
  const _g = await requirePermiso('contabilidad'); if (_g.response) return _g.response;

  return handle(async () => {
    const db = getDb()
    const email = new URL(request.url).searchParams.get('email')

    const [cuentas, centros, proveedores, reglas, cabys, plantillas, plineas, yo, cfg, uiCfg, solUser] = await Promise.all([
      db.from('conta_cuentas').select('codigo,nombre,tipo,codigo_padre,nivel,imputable,activa,permitida_en_gastos,notas').order('codigo'),
      db.from('conta_centros_costo').select('id,nombre_neo,cedula,activo').order('nombre_neo'),
      db.from('conta_proveedores').select('*').order('nombre'),
      db.from('conta_reglas_iva').select('*'),
      db.from('conta_cabys_reglas').select('*').order('prefijo', { ascending: false }),
      db.from('conta_plantillas').select('*').order('nombre'),
      db.from('conta_plantilla_lineas').select('*').order('plantilla_id').order('orden'),
      email ? db.from('conta_aprobadores').select('*').ilike('email', email).maybeSingle() : Promise.resolve({ data: null }),
      db.from('conta_config').select('valor').eq('clave', 'modo_prueba').maybeSingle(),
      email ? db.from('conta_config').select('valor').eq('clave', 'ui:' + email.toLowerCase()).maybeSingle() : Promise.resolve({ data: null }),
      email ? db.from('usuarios_sol').select('nombre,rol').ilike('email', email).maybeSingle() : Promise.resolve({ data: null }),
    ])

    const lineasPorPlantilla = {}
    for (const l of plineas.data || []) {
      ;(lineasPorPlantilla[l.plantilla_id] ||= []).push(l)
    }
    const plantillasFull = (plantillas.data || []).map((p) => ({ ...p, lineas: lineasPorPlantilla[p.id] || [] }))

    // Rol del usuario: el de conta_aprobadores manda; si no tiene y es admin de
    // SOL, se le da rol admin igual (así cualquier dueño de SOL ve el toggle).
    let yoRow = yo.data || null
    if (!yoRow && solUser.data?.rol === 'admin') {
      yoRow = { email, nombre: solUser.data.nombre || null, rol: 'admin', monto_maximo: null, activo: true, via_sol: true }
    }

    return ok({
      cuentas: cuentas.data || [],
      centros: centros.data || [],
      proveedores: proveedores.data || [],
      reglas_iva: reglas.data || [],
      cabys: cabys.data || [],
      plantillas: plantillasFull,
      yo: yoRow,
      modo_prueba: cfg.data?.valor?.activo === true,
      ui_prefs: uiCfg.data?.valor || {},
    })
  })
}
