// Helpers compartidos del módulo Contabilidad.
// Todo el acceso a datos va por acá con el service_role key (bypassa RLS).
// Las tablas conta_* YA EXISTEN y están pobladas: acá solo leemos y escribimos.
import { createClient } from '@supabase/supabase-js'

export const BUCKET = 'contabilidad'
export const MAX_BYTES = 15 * 1024 * 1024 // 15 MB
export const RECEPTOR_EMPRESA = '3101317661' // Corporación Rojimo S.A.
export const CONTRAPARTIDA_DEFAULT = '10-10-10-01' // Caja General
// Cuenta especial (imputable=false) usada como placeholder cuando no sabemos la
// cuenta de gasto (proveedor nuevo). Satisface el FK pero el gating de
// aprobación la bloquea hasta que un humano elija la cuenta real de detalle.
export const CUENTA_SIN_CLASIFICAR = '00-SIN-CLASIFICAR'

let _sb
export function getDb() {
  if (!_sb) {
    _sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://xeeieqjqmtoiutfnltqu.supabase.co',
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    )
  }
  return _sb
}

export function ok(data, init) { return Response.json(data ?? { ok: true }, init) }
export function bad(error, status = 400) { return Response.json({ error }, { status }) }
export function fail(error) { return Response.json({ error: String(error?.message || error) }, { status: 500 }) }

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}
export async function handle(fn) {
  try { return await fn() }
  catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status })
    return fail(e)
  }
}

// ── Normalización de texto (sin acentos, minúsculas) ─────────────────────────
export function norm(s) {
  return String(s || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().trim()
}

// ═══════════════════════════════════════════════════════════════════════════
//  PARSER XML — FacturaElectronica v4.4 de Hacienda (namespace-agnóstico)
// ═══════════════════════════════════════════════════════════════════════════
function decodeXml(s) {
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&amp;/g, '&')
}
function firstBlock(xml, name) {
  const m = String(xml).match(new RegExp('<(?:\\w+:)?' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + name + '>'))
  return m ? m[1] : null
}
function allBlocks(xml, name) {
  const re = new RegExp('<(?:\\w+:)?' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</(?:\\w+:)?' + name + '>', 'g')
  const out = []; let m
  while ((m = re.exec(String(xml)))) out.push(m[1])
  return out
}
function val(xml, name) {
  const b = firstBlock(xml, name)
  return b == null ? null : decodeXml(b.trim())
}
function num(xml, name) {
  const v = val(xml, name)
  if (v == null || v === '') return 0
  const n = parseFloat(String(v).replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}
function rootName(xml) {
  const m = String(xml).match(/<(?:\w+:)?(FacturaElectronica|TiqueteElectronico|NotaCreditoElectronica|NotaDebitoElectronica|FacturaElectronicaCompra|FacturaElectronicaExportacion)[\s>]/)
  return m ? m[1] : 'FacturaElectronica'
}

// Raíces válidas de comprobante electrónico (se procesan como factura).
export const RAICES_COMPROBANTE = [
  'FacturaElectronica', 'TiqueteElectronico', 'NotaCreditoElectronica',
  'NotaDebitoElectronica', 'FacturaElectronicaCompra', 'FacturaElectronicaExportacion',
]
// Raíces de acuse de Hacienda (NO son facturas: se ignoran, pero se aprovechan).
export const RAICES_ACUSE = ['MensajeHacienda', 'MensajeReceptor']

// Nombre del elemento raíz del XML (ignora la declaración <?xml?>, comentarios
// y DOCTYPE). Detecta el tipo por CONTENIDO, no por nombre de archivo.
export function raizXML(xmlRaw) {
  const s = String(xmlRaw || '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!DOCTYPE[^>]*>/gi, '')
  const m = s.match(/<(?:[\w.-]+:)?([A-Za-z_][\w.-]*)[\s>/]/)
  return m ? m[1] : null
}

// Acuse de Hacienda: trae Clave y el estado (Aceptado / Rechazado).
export function parseAcuseXML(xmlRaw) {
  const xml = String(xmlRaw || '')
  const clave = (val(xml, 'Clave') || '').replace(/\s/g, '')
  let estado = val(xml, 'EstadoMensaje')
  if (!estado) {
    // Algunos acuses traen <Mensaje> con código: 1=Aceptado, 2=Parcial, 3=Rechazado
    const cod = (val(xml, 'Mensaje') || '').trim()
    estado = cod === '1' ? 'Aceptado' : cod === '3' ? 'Rechazado' : cod === '2' ? 'Aceptado parcial' : null
  }
  return { clave, estado, detalle: val(xml, 'DetalleMensaje') }
}

// Guarda el estado de Hacienda en la factura, si la clave ya existe.
export async function guardarEstadoHacienda(clave, estado) {
  if (!clave || !estado) return false
  const { data } = await getDb().from('conta_facturas')
    .update({ estado_hacienda: estado }).eq('clave', clave).select('clave')
  return (data || []).length > 0
}

// Devuelve un objeto factura normalizado o lanza HttpError si no aplica.
export function parseFacturaXML(xmlRaw) {
  const xml = String(xmlRaw || '')
  if (!/Factura|Tiquete|Nota/i.test(rootName(xml)) || !xml.includes('<')) {
    throw new HttpError(400, 'El archivo no parece un comprobante electrónico válido.')
  }
  const clave = val(xml, 'Clave')
  if (!clave || !/^\d{48,50}$/.test(clave.replace(/\s/g, ''))) {
    throw new HttpError(400, 'El XML no tiene una clave numérica válida de Hacienda.')
  }

  const emisorBlock = firstBlock(xml, 'Emisor') || ''
  const receptorBlock = firstBlock(xml, 'Receptor') || ''
  const cedEmisor = (val(firstBlock(emisorBlock, 'Identificacion') || '', 'Numero') || '').trim()
  const cedReceptor = (val(firstBlock(receptorBlock, 'Identificacion') || '', 'Numero') || '').trim()
  const nombreEmisor = val(emisorBlock, 'Nombre') || ''
  const correoEmisor = (val(emisorBlock, 'CorreoElectronico') || '').trim() || null

  const resumen = firstBlock(xml, 'ResumenFactura') || ''
  const moneda = val(firstBlock(resumen, 'CodigoTipoMoneda') || resumen, 'CodigoMoneda') || 'CRC'
  const tipoCambio = num(firstBlock(resumen, 'CodigoTipoMoneda') || resumen, 'TipoCambio') || 1

  // Líneas de detalle
  const lineas = allBlocks(xml, 'LineaDetalle').map((lb) => {
    const impuestos = allBlocks(lb, 'Impuesto').map((ib) => ({
      codigo: val(ib, 'Codigo'),
      codigo_tarifa: val(ib, 'CodigoTarifa'),
      tarifa: num(ib, 'Tarifa'),
      monto: num(ib, 'Monto'),
    }))
    const montoTotal = num(lb, 'MontoTotal')
    const descuento = num(firstBlock(lb, 'Descuento') || lb, 'MontoDescuento')
    let subTotal = num(lb, 'SubTotal')
    if (!subTotal) subTotal = Math.max(0, montoTotal - descuento)
    const baseImponible = num(lb, 'BaseImponible') || subTotal
    return {
      numero: val(lb, 'NumeroLinea'),
      cabys: val(lb, 'CodigoCABYS') || val(firstBlock(lb, 'Codigo') || '', 'Codigo') || null,
      detalle: val(lb, 'Detalle') || '',
      cantidad: num(lb, 'Cantidad'),
      monto_total: montoTotal,
      descuento,
      subtotal: subTotal,
      base_imponible: baseImponible,
      impuestos,
      impuesto_monto: impuestos.reduce((s, i) => s + i.monto, 0),
    }
  })

  // Desglose de impuesto agregado por tarifa (clave para facturas de super
  // que mezclan 13% y 1%): { tarifa, base, monto }
  const porTarifa = {}
  for (const l of lineas) {
    for (const imp of l.impuestos) {
      const k = String(imp.tarifa)
      if (!porTarifa[k]) porTarifa[k] = { tarifa: imp.tarifa, base: 0, monto: 0 }
      porTarifa[k].monto += imp.monto
      porTarifa[k].base += l.base_imponible
    }
  }
  const desglose = Object.values(porTarifa).sort((a, b) => b.tarifa - a.tarifa)

  // Número de orden de compra en Otros/OtroTexto
  const otros = firstBlock(xml, 'Otros') || ''
  const otrosTexto = allBlocks(otros, 'OtroTexto').map(decodeXml).join(' ')
  const ocMatch = otrosTexto.match(/OC[-\s]?\d{2,6}[-\s]?\d{2,6}/i) || xml.match(/OC[-\s]?\d{2,6}[-\s]?\d{2,6}/i)
  const numOc = ocMatch ? ocMatch[0].toUpperCase().replace(/\s/g, '-') : null

  const totalImpuesto = num(resumen, 'TotalImpuesto') || lineas.reduce((s, l) => s + l.impuesto_monto, 0)
  const totalComprobante = num(resumen, 'TotalComprobante') || lineas.reduce((s, l) => s + l.subtotal + l.impuesto_monto, 0)
  const totalDescuentos = num(resumen, 'TotalDescuentos') || lineas.reduce((s, l) => s + l.descuento, 0)
  const totalGravado = num(resumen, 'TotalGravado')
  const totalExento = num(resumen, 'TotalExento')
  const totalNoSujeto = num(resumen, 'TotalNoSujeto') || num(resumen, 'TotalMercNoSujeta')
  const totalExonerado = num(resumen, 'TotalExonerado')
  const ventaNeta = num(resumen, 'TotalVentaNeta') || (totalComprobante - totalImpuesto)

  return {
    clave: clave.replace(/\s/g, ''),
    consecutivo: val(xml, 'NumeroConsecutivo'),
    tipo_documento: rootName(xml),
    cedula_emisor: cedEmisor,
    nombre_emisor: nombreEmisor,
    correo_emisor: correoEmisor,
    cedula_receptor: cedReceptor,
    fecha_emision: val(xml, 'FechaEmision'),
    moneda,
    tipo_cambio: tipoCambio,
    total_gravado: totalGravado,
    total_exento: totalExento,
    total_no_sujeto: totalNoSujeto,
    total_exonerado: totalExonerado,
    total_descuentos: totalDescuentos,
    total_impuesto: totalImpuesto,
    total_comprobante: totalComprobante,
    venta_neta: ventaNeta,
    desglose_impuesto: desglose,
    lineas,
    num_oc: numOc,
    medio_pago: val(xml, 'MedioPago'),
    condicion_venta: val(xml, 'CondicionVenta'),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  CATÁLOGOS EN MEMORIA (se cargan una vez por request)
// ═══════════════════════════════════════════════════════════════════════════
export async function cargarContexto() {
  const db = getDb()
  const [reglasIva, cabys] = await Promise.all([
    db.from('conta_reglas_iva').select('*'),
    db.from('conta_cabys_reglas').select('*').order('prefijo', { ascending: false }),
  ])
  return {
    reglasIva: reglasIva.data || [],
    cabys: cabys.data || [],
  }
}

// Cuenta de IVA según tarifa + destino ('gasto' | 'compra' | 'impuesto').
// Nunca hardcodeamos: sale de conta_reglas_iva.
export function cuentaIva(reglasIva, tarifa, destino) {
  const t = Number(tarifa)
  // Coincidencia exacta tarifa+destino
  let r = reglasIva.find((x) => Number(x.tarifa) === t && x.destino === destino)
  if (r) return r.cuenta
  // Fallback: misma tarifa cualquier destino (1% y 2% comparten cuenta)
  r = reglasIva.find((x) => Number(x.tarifa) === t)
  return r ? r.cuenta : null
}

// Regla CABYS por prefijo más largo; a igual largo, menor prioridad.
export function reglaCabys(cabys, codigo) {
  if (!codigo) return null
  const c = String(codigo)
  const matches = cabys
    .filter((r) => c.startsWith(String(r.prefijo)))
    .sort((a, b) => String(b.prefijo).length - String(a.prefijo).length || a.prioridad - b.prioridad)
  return matches[0] || null
}

// ── Buscar proveedor por cédula o, si no, por nombre normalizado ─────────────
export async function buscarProveedor(cedula, nombre) {
  const db = getDb()
  if (cedula) {
    const { data } = await db.from('conta_proveedores').select('*').eq('cedula', cedula).maybeSingle()
    if (data) return data
  }
  if (nombre) {
    const n = norm(nombre)
    const { data } = await db.from('conta_proveedores').select('*')
    const hit = (data || []).find((p) => norm(p.nombre) === n)
    if (hit) return hit
    // match parcial defensivo
    const parcial = (data || []).find((p) => n && (norm(p.nombre).includes(n) || n.includes(norm(p.nombre))))
    if (parcial) return parcial
  }
  return null
}

// ═══════════════════════════════════════════════════════════════════════════
//  CLASIFICACIÓN + ARMADO DE ASIENTO
// ═══════════════════════════════════════════════════════════════════════════
// Devuelve { decision, motivo, aviso, proveedor } donde decision ∈
//   'ignorar' (mercadería), 'preguntar', 'gasto', 'nuevo'
export function clasificar(factura, proveedor) {
  // 1) Orden de compra presente -> mercadería (se ignora en silencio)
  if (factura.num_oc) {
    return { decision: 'ignorar', motivo: `Trae orden de compra ${factura.num_oc}: es mercadería.`, proveedor }
  }
  // 2) Proveedor clasificado como mercadería
  if (proveedor && proveedor.clasificacion === 'mercaderia') {
    return { decision: 'ignorar', motivo: 'Proveedor de mercadería.', proveedor }
  }
  if (proveedor && proveedor.clasificacion === 'ignorar') {
    return { decision: 'ignorar', motivo: 'Proveedor marcado como ignorar.', proveedor }
  }
  // 3) Proveedor "preguntar"
  if (proveedor && proveedor.clasificacion === 'preguntar') {
    return {
      decision: 'preguntar', proveedor,
      aviso: 'Este proveedor a veces vende mercadería. Confirmá que esto es gasto.',
    }
  }
  // 4) Proveedor gasto (con cuenta sugerida)
  if (proveedor && proveedor.clasificacion === 'gasto') {
    return { decision: 'gasto', proveedor }
  }
  // 5) Desconocido / por_clasificar
  return {
    decision: 'nuevo', proveedor: proveedor || null,
    aviso: proveedor ? 'Proveedor sin clasificar, revisá las cuentas.' : 'Proveedor nuevo, hay que clasificarlo.',
  }
}

// Redondea a 2 decimales de forma estable.
export function r2(n) { return Math.round((Number(n) || 0) * 100) / 100 }

// Construye las líneas propuestas del asiento para un gasto simple.
// ctx = { reglasIva, cabys }. Devuelve { lineas, aviso? }.
export function armarLineasGasto(factura, proveedor, ctx, destino = 'gasto') {
  const lineas = []
  const cuentaBase = proveedor?.cuenta_sugerida || null
  const centro = proveedor?.centro_costo_id || null

  // 1) Líneas de gasto agrupadas por cuenta (CABYS puede overridear por línea)
  const porCuenta = {}
  for (const l of factura.lineas || []) {
    const rc = reglaCabys(ctx.cabys, l.cabys)
    const cuenta = (rc && rc.cuenta_sugerida) || cuentaBase || CUENTA_SIN_CLASIFICAR
    const key = cuenta
    if (!porCuenta[key]) porCuenta[key] = { cuenta, monto: 0 }
    porCuenta[key].monto += l.base_imponible
  }
  // Si la factura no trae líneas (solo totales), usar la venta neta
  if (Object.keys(porCuenta).length === 0) {
    porCuenta['base'] = { cuenta: cuentaBase || CUENTA_SIN_CLASIFICAR, monto: factura.venta_neta }
  }
  let orden = 1
  for (const g of Object.values(porCuenta)) {
    if (r2(g.monto) === 0) continue
    lineas.push({ orden: orden++, cuenta: g.cuenta, centro_costo_id: centro, debe: r2(g.monto), haber: 0, observacion: 'Gasto' })
  }

  // 2) Líneas de IVA: una por cada tarifa distinta del desglose
  for (const d of factura.desglose_impuesto || []) {
    if (r2(d.monto) === 0) continue
    const cuenta = cuentaIva(ctx.reglasIva, d.tarifa, destino)
    lineas.push({
      orden: orden++, cuenta: cuenta || CUENTA_SIN_CLASIFICAR, centro_costo_id: centro,
      debe: r2(d.monto), haber: 0, observacion: `IVA soportado ${d.tarifa}%`,
    })
  }

  // 3) Contrapartida al haber = suma de los débitos (garantiza cuadre exacto)
  const totalDebe = r2(lineas.reduce((s, l) => s + l.debe, 0))
  const contrapartida = (proveedor && proveedor.cuenta_contrapartida) || CONTRAPARTIDA_DEFAULT
  lineas.push({
    orden: orden++, cuenta: contrapartida, centro_costo_id: null,
    debe: 0, haber: totalDebe, observacion: 'Contrapartida',
  })

  return { lineas }
}

// ── Persistir factura + asiento + líneas (borrador) ──────────────────────────
export async function guardarFactura(factura, clasificacion, { xml_path = null, pdf_path = null, procesada = true } = {}) {
  const db = getDb()
  const row = {
    clave: factura.clave,
    consecutivo: factura.consecutivo || null,
    tipo_documento: factura.tipo_documento || null,
    cedula_emisor: factura.cedula_emisor || null,
    nombre_emisor: factura.nombre_emisor || null,
    correo_emisor: factura.correo_emisor || null,
    cedula_receptor: factura.cedula_receptor || null,
    fecha_emision: factura.fecha_emision || null,
    moneda: factura.moneda || 'CRC',
    tipo_cambio: factura.tipo_cambio || null,
    total_gravado: factura.total_gravado || 0,
    total_exento: factura.total_exento || 0,
    total_no_sujeto: factura.total_no_sujeto || 0,
    total_exonerado: factura.total_exonerado || 0,
    total_descuentos: factura.total_descuentos || 0,
    total_impuesto: factura.total_impuesto || 0,
    total_comprobante: factura.total_comprobante || 0,
    desglose_impuesto: factura.desglose_impuesto || [],
    lineas: factura.lineas || [],
    num_oc: factura.num_oc || null,
    medio_pago: factura.medio_pago || null,
    condicion_venta: factura.condicion_venta || null,
    clasificacion: clasificacion || 'por_clasificar',
    xml_path, pdf_path,
    procesada,
  }
  const { data, error } = await db.from('conta_facturas').upsert(row, { onConflict: 'clave' }).select('*').single()
  if (error) throw new HttpError(500, 'No se pudo guardar la factura: ' + error.message)
  return data
}

// Inserta asiento (borrador) + sus líneas. Los totales los calcula el trigger.
export async function crearAsientoConLineas(asiento, lineas) {
  const db = getDb()
  const { data: a, error } = await db.from('conta_asientos').insert({
    fecha: asiento.fecha,
    descripcion: asiento.descripcion,
    tipo_origen: asiento.tipo_origen || 'manual',
    clave_factura: asiento.clave_factura || null,
    plantilla_id: asiento.plantilla_id || null,
    moneda: asiento.moneda || 'CRC',
    tipo_cambio: asiento.tipo_cambio || null,
    deducible: asiento.deducible !== false,
    estado: 'borrador',
    creado_por: asiento.creado_por || null,
    pdf_url: asiento.pdf_url || null,
    es_prueba: asiento.es_prueba === true,
  }).select('*').single()
  if (error) {
    if (error.code === '23505') throw new HttpError(409, 'Ya existe un asiento activo para esta factura.')
    throw new HttpError(500, 'No se pudo crear el asiento: ' + error.message)
  }
  let filas
  try {
    filas = sanearLineas(lineas, a.id)
  } catch (e) {
    await db.from('conta_asientos').delete().eq('id', a.id)
    throw e
  }
  if (filas.length) {
    const { error: le } = await db.from('conta_asiento_lineas').insert(filas)
    if (le) {
      await db.from('conta_asientos').delete().eq('id', a.id)
      throw new HttpError(500, 'No se pudieron guardar las líneas: ' + le.message)
    }
  }
  await bitacora(a.id, 'creado', asiento.creado_por || 'sistema', { tipo_origen: a.tipo_origen, clave: a.clave_factura })
  return a
}

// Descarta líneas totalmente vacías y valida que toda línea con monto tenga
// cuenta (la columna cuenta es FK NOT NULL). Devuelve filas listas para insert.
export function sanearLineas(lineas, asientoId) {
  const filas = []
  let orden = 1
  for (const l of lineas || []) {
    const debe = r2(l.debe), haber = r2(l.haber)
    const cuenta = (l.cuenta || '').trim()
    const vacia = !cuenta && debe === 0 && haber === 0
    if (vacia) continue // fila en blanco: se ignora
    if (!cuenta) throw new HttpError(400, 'Hay una línea con monto pero sin cuenta. Elegí la cuenta o borrá la línea.')
    filas.push({
      asiento_id: asientoId,
      orden: orden++,
      cuenta,
      centro_costo_id: l.centro_costo_id || null,
      debe, haber,
      observacion: l.observacion || null,
    })
  }
  return filas
}

export async function bitacora(asientoId, accion, actor, detalle) {
  try {
    await getDb().from('conta_bitacora').insert({
      asiento_id: asientoId, accion, actor: actor || 'sistema', detalle: detalle || null,
    })
  } catch { /* la bitácora nunca debe romper el flujo principal */ }
}

// Bitácora de cambios de catálogo/config (sin asiento asociado).
export async function bitacoraCatalogo(accion, actor, detalle) {
  return bitacora(null, accion, actor, detalle)
}

// ── Rol / config ─────────────────────────────────────────────────────────────
export async function aprobadorDe(email) {
  if (!email) return null
  const { data } = await getDb().from('conta_aprobadores')
    .select('*').ilike('email', email).eq('activo', true).maybeSingle()
  return data || null
}
// ¿El usuario es admin general de SOL? (usuarios_sol.rol = 'admin'). Sirve de
// respaldo para que cualquier dueño/admin de SOL tenga el rol admin de
// Contabilidad sin tener que estar cargado a mano en conta_aprobadores.
export async function esAdminSol(email) {
  if (!email) return false
  const { data } = await getDb().from('usuarios_sol')
    .select('rol').ilike('email', email).maybeSingle()
  return data?.rol === 'admin'
}
export async function esAdmin(email) {
  const a = await aprobadorDe(email)
  if (a?.rol === 'admin') return true
  return await esAdminSol(email)
}

// Flag global de modo prueba (guardado en la base, igual para todos).
export async function modoPruebaActivo() {
  const { data } = await getDb().from('conta_config').select('valor').eq('clave', 'modo_prueba').maybeSingle()
  return data?.valor?.activo === true
}
