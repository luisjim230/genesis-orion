import { getDb, ok, handle } from '../_lib'

export const dynamic = 'force-dynamic'

// GET /api/contabilidad/catalogos?email=...
// Devuelve todos los catálogos que la UI necesita (comboboxes, reglas, etc.)
// y el aprobador correspondiente al email logueado (rol + monto_maximo).
export async function GET(request) {
  return handle(async () => {
    const db = getDb()
    const email = new URL(request.url).searchParams.get('email')

    const [cuentas, centros, proveedores, reglas, cabys, plantillas, plineas, yo, cfg, uiCfg] = await Promise.all([
      db.from('conta_cuentas').select('codigo,nombre,tipo,codigo_padre,nivel,imputable,activa,permitida_en_gastos,notas').order('codigo'),
      db.from('conta_centros_costo').select('id,nombre_neo,cedula,activo').order('nombre_neo'),
      db.from('conta_proveedores').select('*').order('nombre'),
      db.from('conta_reglas_iva').select('*'),
      db.from('conta_cabys_reglas').select('*').order('prefijo', { ascending: false }),
      db.from('conta_plantillas').select('*').order('nombre'),
      db.from('conta_plantilla_lineas').select('*').order('plantilla_id').order('orden'),
      email ? db.from('conta_aprobadores').select('*').eq('email', email).maybeSingle() : Promise.resolve({ data: null }),
      db.from('conta_config').select('valor').eq('clave', 'modo_prueba').maybeSingle(),
      email ? db.from('conta_config').select('valor').eq('clave', 'ui:' + email.toLowerCase()).maybeSingle() : Promise.resolve({ data: null }),
    ])

    const lineasPorPlantilla = {}
    for (const l of plineas.data || []) {
      ;(lineasPorPlantilla[l.plantilla_id] ||= []).push(l)
    }
    const plantillasFull = (plantillas.data || []).map((p) => ({ ...p, lineas: lineasPorPlantilla[p.id] || [] }))

    return ok({
      cuentas: cuentas.data || [],
      centros: centros.data || [],
      proveedores: proveedores.data || [],
      reglas_iva: reglas.data || [],
      cabys: cabys.data || [],
      plantillas: plantillasFull,
      yo: yo.data || null,
      modo_prueba: cfg.data?.valor?.activo === true,
      ui_prefs: uiCfg.data?.valor || {},
    })
  })
}
