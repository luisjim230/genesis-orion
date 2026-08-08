import { getDb, ok, bad, handle } from '../../_lib'

export const dynamic = 'force-dynamic'

async function esAdmin(db, email) {
  if (!email) return false
  const { data } = await db.from('conta_aprobadores').select('rol').eq('email', email).eq('activo', true).maybeSingle()
  return data?.rol === 'admin'
}

// POST /api/contabilidad/catalogos/mantenimiento
// { actor, recurso: 'proveedor'|'centro'|'cuenta'|'plantilla', accion?, ...campos }
// Solo rol admin puede escribir en catálogos.
export async function POST(request) {
  return handle(async () => {
    const db = getDb()
    const b = await request.json()
    if (!(await esAdmin(db, b.actor))) return bad('Solo un admin puede editar catálogos.', 403)

    if (b.recurso === 'proveedor') {
      const upd = {}
      for (const k of ['clasificacion', 'cuenta_sugerida', 'centro_costo_id', 'deducible_default', 'notas', 'plantilla_id']) {
        if (k in b) upd[k] = b[k] === '' ? null : b[k]
      }
      upd.actualizado_en = new Date().toISOString()
      const { data, error } = await db.from('conta_proveedores').update(upd).eq('id', b.id).select('*').single()
      if (error) throw error
      return ok(data)
    }

    if (b.recurso === 'centro') {
      const upd = {}
      if ('cedula' in b) upd.cedula = b.cedula === '' ? null : b.cedula
      if ('activo' in b) upd.activo = b.activo
      const { data, error } = await db.from('conta_centros_costo').update(upd).eq('id', b.id).select('*').single()
      if (error) throw error
      return ok(data)
    }

    if (b.recurso === 'cuenta') {
      // Solo el campo notas es editable en el catálogo de cuentas
      const { data, error } = await db.from('conta_cuentas')
        .update({ notas: b.notas === '' ? null : b.notas, actualizado_en: new Date().toISOString() })
        .eq('codigo', b.codigo).select('*').single()
      if (error) throw error
      return ok(data)
    }

    if (b.recurso === 'plantilla') {
      if (b.accion === 'crear') {
        const { data: p, error } = await db.from('conta_plantillas').insert({
          nombre: b.nombre, descripcion: b.descripcion || null, tipo: b.tipo || 'otro',
          cedula_emisor: b.cedula_emisor || null, identificador: b.identificador || null,
          cuenta_contrapartida: b.cuenta_contrapartida || null,
          requiere_pdf: b.requiere_pdf === true, activa: b.activa !== false, notas: b.notas || null,
        }).select('*').single()
        if (error) throw error
        if (Array.isArray(b.lineas)) await reemplazarLineas(db, p.id, b.lineas)
        return ok(p)
      }
      if (b.accion === 'editar') {
        const upd = {}
        for (const k of ['nombre', 'descripcion', 'tipo', 'cedula_emisor', 'identificador', 'cuenta_contrapartida', 'requiere_pdf', 'activa', 'notas']) {
          if (k in b) upd[k] = b[k] === '' ? null : b[k]
        }
        const { data, error } = await db.from('conta_plantillas').update(upd).eq('id', b.id).select('*').single()
        if (error) throw error
        if (Array.isArray(b.lineas)) await reemplazarLineas(db, b.id, b.lineas)
        return ok(data)
      }
      if (b.accion === 'toggle') {
        const { data, error } = await db.from('conta_plantillas').update({ activa: b.activa }).eq('id', b.id).select('*').single()
        if (error) throw error
        return ok(data)
      }
    }

    return bad('Recurso o acción no reconocidos.')
  })
}

async function reemplazarLineas(db, plantillaId, lineas) {
  await db.from('conta_plantilla_lineas').delete().eq('plantilla_id', plantillaId)
  const filas = lineas.map((l, i) => ({
    plantilla_id: plantillaId, orden: l.orden ?? i + 1, cuenta: l.cuenta || '',
    naturaleza: l.naturaleza === 'haber' ? 'haber' : 'debe',
    origen_monto: l.origen_monto || 'manual', origen_detalle: l.origen_detalle || null,
    centro_costo_id: l.centro_costo_id || null, observacion: l.observacion || null,
  }))
  if (filas.length) {
    const { error } = await db.from('conta_plantilla_lineas').insert(filas)
    if (error) throw error
  }
}
