// Helpers compartidos del módulo Compras a Proveedor.
// Todo el acceso a datos va por acá con el service_role key (bypassa RLS).
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const BUCKET = 'compras-proveedor'
export const MAX_BYTES = 15 * 1024 * 1024 // 15 MB (entra una foto de celu sin comprimir)

// Tipos aceptados: PDF y fotos (Luis manda la venta o la cotización desde el celu).
export const MIMES_OK = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
]
const EXT_MIME = {
  pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
}

let _sb
export function getDb() {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
  }
  return _sb
}

export function ok(data, init) {
  return Response.json(data ?? { ok: true }, init)
}
export function bad(error, status = 400) {
  return Response.json({ error }, { status })
}
export function fail(error) {
  return Response.json({ error: String(error?.message || error) }, { status: 500 })
}

// Sube un PDF o una foto al bucket privado, calcula sha256, deduplica e
// inserta metadata en cp_archivos. Devuelve el archivo o lanza HttpError.
// - reusarSiExiste: para respaldos (venta / cotización) el mismo archivo puede
//   servir a varias compras, así que se reusa la fila en vez de fallar.
//   Para comprobantes y facturas se mantiene el bloqueo anti doble-carga.
export async function subirArchivo(file, { uploadedBy, reusarSiExiste = false } = {}) {
  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new HttpError(400, 'Archivo requerido (PDF o foto).')
  }
  const nombre = file.name || 'documento.pdf'
  const ext = (nombre.split('.').pop() || '').toLowerCase()
  const mime = (file.type && MIMES_OK.includes(file.type)) ? file.type : EXT_MIME[ext]
  if (!mime) throw new HttpError(400, 'El archivo debe ser un PDF o una foto (JPG, PNG, WEBP, HEIC).')

  const buffer = Buffer.from(await file.arrayBuffer())
  if (buffer.length === 0) throw new HttpError(400, 'El archivo está vacío.')
  if (buffer.length > MAX_BYTES) throw new HttpError(400, 'El archivo supera el máximo de 15 MB.')

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')
  const db = getDb()

  // Defensa anti doble-carga: mismo contenido ya cargado.
  const { data: dup } = await db
    .from('cp_archivos')
    .select('*')
    .eq('sha256', sha256)
    .maybeSingle()
  if (dup) {
    if (reusarSiExiste) return dup
    throw new HttpError(409, `Este archivo ya fue cargado antes (archivo #${dup.id} · ${dup.nombre}).`)
  }

  const safe = nombre.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const storagePath = `${new Date().getFullYear()}/${sha256.slice(0, 12)}_${safe}`

  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: mime, upsert: false })
  if (upErr) throw new HttpError(500, 'No se pudo subir el archivo: ' + upErr.message)

  const { data: archivo, error: insErr } = await db
    .from('cp_archivos')
    .insert({
      nombre,
      mime_type: mime,
      tamano_bytes: buffer.length,
      storage_path: storagePath,
      sha256,
      uploaded_by: uploadedBy || null,
    })
    .select('*')
    .single()
  if (insErr) {
    // Rollback best-effort del objeto subido.
    await db.storage.from(BUCKET).remove([storagePath]).catch(() => {})
    throw new HttpError(500, 'No se pudo registrar el archivo: ' + insErr.message)
  }
  return archivo
}

// Alias histórico (comprobantes de pago y facturas siguen llamándolo así).
export const subirPdf = subirArchivo

// ── Documentos de una compra ────────────────────────────────────────────────
// El corazón de "¿qué me falta?": 4 documentos por compra. El que casi siempre
// queda colgando es la factura del proveedor.
export const DOCS = [
  { clave: 'venta',        label: 'Venta al cliente',       emoji: '🧍' },
  { clave: 'cotizacion',   label: 'Cotización proveedor',   emoji: '💬' },
  { clave: 'comprobante',  label: 'Comprobante de pago',    emoji: '💸' },
  { clave: 'factura',      label: 'Factura del proveedor',  emoji: '🧾' },
]

// Calcula qué documentos faltan. `pagos` viene con comprobante_archivo_id y
// link (cp_factura_pago_link). Devuelve { docs, faltantes, falta_factura, ... }.
export function docsDeCompra(compra, pagos = []) {
  const hayPagos = pagos.length > 0
  const conComprobante = pagos.some(p => p.comprobante_archivo_id)
  const pagosSinFactura = pagos.filter(p => !p.link || p.link.length === 0)

  const estados = {
    venta: !!compra?.venta_archivo_id,
    cotizacion: !!compra?.cotizacion_archivo_id,
    comprobante: hayPagos && conComprobante,
    // La factura se considera pendiente sólo cuando ya se pagó algo: antes de
    // pagar, lo pendiente es el pago, no la factura.
    factura: hayPagos ? pagosSinFactura.length === 0 : true,
  }
  const docs = DOCS.map(d => ({ ...d, ok: estados[d.clave] }))
  const faltantes = docs.filter(d => !d.ok).map(d => d.clave)
  return {
    docs,
    faltantes,
    falta_factura: !estados.factura,
    falta_pago: !hayPagos,
    monto_sin_factura: pagosSinFactura.reduce((s, p) => s + Number(p.monto || 0), 0),
  }
}

// Sugerencia automática de match para una factura (sección 8.2 del spec).
// Devuelve { factura, sugerencia_fuerte, alternativas, todos_los_candidatos }.
export async function sugerenciasMatch(facturaId) {
  const db = getDb()
  const { data: factura } = await db.from('cp_facturas').select('*').eq('id', facturaId).maybeSingle()
  if (!factura) throw new HttpError(404, 'Factura no encontrada.')

  const desde = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
  const { data: pagos } = await db
    .from('cp_pagos')
    .select('id, monto, fecha_pago, referencia_bancaria, banco_origen, compra:cp_compras!inner(id,descripcion,cliente_nombre,proveedor_id), link:cp_factura_pago_link(id)')
    .eq('compra.proveedor_id', factura.proveedor_id)
    .gte('fecha_pago', desde)
    .order('fecha_pago', { ascending: false })

  const candidatos = (pagos || []).filter(p => !p.link || p.link.length === 0)
  const target = Number(factura.monto_total)

  let sugerencia_fuerte = null
  let alternativas = []
  const single = candidatos.find(p => Math.round(Number(p.monto) * 100) === Math.round(target * 100))
  if (single) {
    sugerencia_fuerte = [single.id]
  } else {
    const combos = combinacionesExactas(candidatos, target, 5)
    if (combos.length === 1) sugerencia_fuerte = combos[0]
    else if (combos.length > 1) alternativas = combos
  }
  return { factura, sugerencia_fuerte, alternativas, todos_los_candidatos: candidatos }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

// Envuelve un handler para convertir HttpError en respuesta JSON limpia.
export async function handle(fn) {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status })
    return fail(e)
  }
}

// Recalcula el estado de una compra vía la función SQL (atómico y reutilizable).
export async function recompute(compraId) {
  const { error } = await getDb().rpc('cp_recompute_estado', { p_compra_id: compraId })
  if (error) throw new HttpError(500, 'recompute_estado: ' + error.message)
}

// Subset-sum acotado: combinaciones de hasta `maxK` pagos cuya suma == target.
// Trabaja en centavos para evitar errores de punto flotante. Devuelve arrays
// de ids de pago.
export function combinacionesExactas(pagos, target, maxK = 5, maxResultados = 30) {
  const objetivo = Math.round(Number(target) * 100)
  const items = pagos.map(p => ({ id: p.id, c: Math.round(Number(p.monto) * 100) }))
  const out = []
  function rec(start, restantes, acumId, acumSum) {
    if (out.length >= maxResultados) return
    if (acumSum === objetivo && acumId.length > 0) { out.push([...acumId]); return }
    if (acumSum > objetivo || restantes === 0) return
    for (let i = start; i < items.length; i++) {
      const it = items[i]
      if (acumSum + it.c > objetivo) continue
      acumId.push(it.id)
      rec(i + 1, restantes - 1, acumId, acumSum + it.c)
      acumId.pop()
    }
  }
  rec(0, maxK, [], 0)
  return out
}
