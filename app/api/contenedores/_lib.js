// Helpers del módulo Cargas en tránsito (Jonás).
// Todo lo que toca storage o lee documentos pasa por acá con el service_role.
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'
import * as XLSX from 'xlsx'

export const BUCKET = 'contenedores'
export const MAX_BYTES = 25 * 1024 * 1024 // 25 MB

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

export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

export function ok(data, init) { return Response.json(data ?? { ok: true }, init) }
export function bad(error, status = 400) { return Response.json({ error }, { status }) }

export async function handle(fn) {
  try {
    return await fn()
  } catch (e) {
    if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status })
    console.error('[contenedores]', e)
    return Response.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''))
  return Number.isFinite(n) ? n : null
}

// ── Lectura del archivo ─────────────────────────────────────────────────────
// Un Excel se convierte a texto (CSV por hoja) y se le manda a Claude como
// texto. Un PDF se manda tal cual como documento: Claude lo lee mejor que
// cualquier extractor de texto, sobre todo cuando la proforma es una tabla.
export function esPdf(file) {
  return /\.pdf$/i.test(file?.name || '') || /pdf/i.test(file?.type || '')
}
export function esExcel(file) {
  return /\.(xlsx|xlsm|xls|csv)$/i.test(file?.name || '') ||
    /spreadsheet|excel|csv/i.test(file?.type || '')
}

const MIMES = {
  pdf:  'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xls:  'application/vnd.ms-excel',
  csv:  'text/csv',
}
export function mimePorNombre(nombre) {
  const ext = String(nombre || '').split('.').pop().toLowerCase()
  return MIMES[ext] || 'application/octet-stream'
}
export function extensionValida(nombre) {
  return /\.(pdf|xlsx|xlsm|xls|csv)$/i.test(String(nombre || ''))
}

// Nombre del objeto dentro del bucket. Se le antepone el año y un random para
// que dos archivos con el mismo nombre no se pisen.
export function rutaStorage(nombre, prefijo) {
  const safe = String(nombre || 'documento').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  return `${new Date().getFullYear()}/${prefijo}_${safe}`
}

const MAX_TEXTO = 60000

export function excelATexto(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const partes = []
  for (const nombre of wb.SheetNames) {
    const ws = wb.Sheets[nombre]
    if (!ws) continue
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false, rawNumbers: true })
    if (csv.trim()) partes.push(`### Hoja: ${nombre}\n${csv}`)
  }
  const texto = partes.join('\n\n')
  return texto.length > MAX_TEXTO ? texto.slice(0, MAX_TEXTO) + '\n[...recortado...]' : texto
}

// ── Partidas del TLC China (para que la IA elija de una lista real) ─────────
let _partidasCache = null
export async function partidasTLC() {
  if (_partidasCache) return _partidasCache
  const { data } = await getDb()
    .from('tlc_china_partidas')
    .select('codigo_arancelario, descripcion, dai_efectivo_2026, ley_6946, paga_dai')
    .order('codigo_arancelario')
  _partidasCache = data || []
  return _partidasCache
}

// ── Extracción con Claude ───────────────────────────────────────────────────
const ESQUEMA = `{
  "tipo_doc": "proforma" | "factura" | "contrato" | "packing" | "bl" | "otro",
  "proveedor": "nombre de la fábrica/proveedor que emite el documento",
  "pi_num": "número de PI / SC / invoice o null",
  "fecha": "YYYY-MM-DD o null",
  "moneda": "USD",
  "incoterm": "FOB" | "CIF" | "EXW" | "DAP" | null,
  "puerto_origen": "puerto de carga o null",
  "puerto_destino": "puerto de destino o null",
  "contenedor_tipo": "1x40HQ, 2x40HC, etc. o null",
  "mercaderia_monto": número — subtotal SOLO de la mercadería, sin flete,
  "flete_monto": número o null — flete marítimo si el documento lo separa,
  "total_monto": número — total del documento,
  "cbm_total": número o null,
  "pct_adelanto": número o null — 30 si dice "30% deposit",
  "adelanto_monto": número o null — monto del depósito si aparece,
  "saldo_monto": número o null — monto del balance/saldo si aparece,
  "dias_produccion": "texto tal cual, ej. 45-50 días o null",
  "resumen": "2 o 3 frases en español rioplatense: qué mercadería viene, cuántas unidades y para qué sirve",
  "items": [
    {
      "item_no": "código del proveedor o null",
      "descripcion": "qué producto es, en español",
      "nombre_comercial": "nombre propio del modelo si lo trae (AMALFI, ROMA, MONTREAL) o null",
      "categoria": "familia corta en español: inodoros, muebles de baño, mamparas, piso SPC, panel WPC, etc.",
      "color": "o null",
      "medida": "medidas tal cual o null",
      "unidad": "PC, SET, M2, METRO... o null",
      "cantidad": número,
      "precio_unitario": número,
      "monto": número — total de la línea,
      "cbm": número o null,
      "partida": "código de 8 dígitos elegido de la lista de partidas, o null"
    }
  ]
}`

export async function extraerDoc({ file, buffer }) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new HttpError(400, 'Todavía no está cargada la clave de lectura de documentos (ANTHROPIC_API_KEY en Vercel). El archivo queda guardado: cuando la carguen, apretá "Leer de nuevo".')
  }

  const partidas = await partidasTLC()
  const listaPartidas = partidas
    .map((p) => `${p.codigo_arancelario} | ${p.descripcion} | DAI ${p.dai_efectivo_2026}%`)
    .join('\n')

  const prompt = `Sos el asistente de importaciones de Depósito Jiménez (Costa Rica). Te paso una proforma / factura / contrato de venta de un proveedor (casi siempre chino).

Extraé los datos y devolvé SOLO un JSON válido, sin markdown ni explicación, con esta forma exacta:
${ESQUEMA}

Reglas:
- Los montos son números pelados, sin $ ni separadores de miles.
- Una fila sin cantidad o con cantidad 0 NO se incluye en items.
- Si una fila hereda la descripción de la fila de arriba (celdas combinadas), repetí la descripción completa en esa línea.
- La "categoría" la ponés vos en español, corta y consistente.
- Para "partida" elegí el código que mejor calce de esta lista del TLC China–Costa Rica. Si ninguno calza, poné null:
${listaPartidas}
- Si el documento no separa flete, flete_monto = null (no lo inventes).
- Si el documento es CIF y el total ya incluye flete, mercaderia_monto es el subtotal de la mercadería y flete_monto el flete que aparezca aparte.`

  const contenido = []
  if (esPdf(file)) {
    contenido.push({
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: buffer.toString('base64') },
    })
  } else {
    contenido.push({ type: 'text', text: `Contenido del archivo "${file.name}":\n\n${excelATexto(buffer)}` })
  }
  contenido.push({ type: 'text', text: prompt })

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-5',
      max_tokens: 8000,
      messages: [{ role: 'user', content: contenido }],
    }),
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new HttpError(502, 'No se pudo leer el archivo: ' + resp.status + ' ' + t.slice(0, 200))
  }
  const data = await resp.json()
  const texto = (data.content || []).map((c) => c.text || '').join('')
  return parsearJSON(texto)
}

function parsearJSON(texto) {
  const limpio = String(texto || '').replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim()
  const ini = limpio.indexOf('{')
  const fin = limpio.lastIndexOf('}')
  if (ini < 0 || fin < 0) throw new HttpError(502, 'La lectura del archivo no devolvió un JSON válido.')
  try {
    return JSON.parse(limpio.slice(ini, fin + 1))
  } catch {
    throw new HttpError(502, 'La lectura del archivo devolvió un JSON roto (¿documento muy largo?).')
  }
}

// ── Normalización de las líneas extraídas ───────────────────────────────────
export async function armarItems(extraido) {
  const partidas = await partidasTLC()
  const mapa = new Map(partidas.map((p) => [String(p.codigo_arancelario), p]))
  const items = Array.isArray(extraido?.items) ? extraido.items : []
  return items
    .map((it, i) => {
      const cantidad = num(it.cantidad)
      if (!cantidad) return null
      const partida = it.partida ? String(it.partida).replace(/\D/g, '') : null
      const p = partida ? mapa.get(partida) : null
      return {
        linea: i + 1,
        item_no: it.item_no ? String(it.item_no).slice(0, 120) : null,
        descripcion: it.descripcion ? String(it.descripcion).slice(0, 500) : null,
        nombre_comercial: it.nombre_comercial ? String(it.nombre_comercial).slice(0, 120) : null,
        categoria: it.categoria ? String(it.categoria).slice(0, 80) : null,
        color: it.color ? String(it.color).slice(0, 120) : null,
        medida: it.medida ? String(it.medida).slice(0, 120) : null,
        unidad: it.unidad ? String(it.unidad).slice(0, 20) : null,
        cantidad,
        precio_unitario: num(it.precio_unitario),
        monto: num(it.monto) ?? (num(it.precio_unitario) || 0) * cantidad,
        cbm: num(it.cbm),
        partida: p ? p.codigo_arancelario : null,
        dai_pct: p ? Number(p.dai_efectivo_2026) : null,
        origen: 'archivo',
      }
    })
    .filter(Boolean)
}

// ── Estimación de impuestos de aduana ───────────────────────────────────────
// Rápida y referencial, como la pidió Luis. CIF = mercadería + flete (si el
// incoterm no es CIF, donde el flete ya va adentro del precio).
// Impuestos = DAI (por partida, TLC China) + 1% Ley 6946 + 13% IVA.
export const IVA_CR = 0.13
export const LEY_6946 = 0.01

export function estimarImpuestos({ envio, items }) {
  const lineas = items || []
  const sumaLineas = lineas.reduce((s, i) => s + (Number(i.monto) || 0), 0)
  const mercaderia = Number(envio?.mercaderia_monto) || sumaLineas ||
    ((Number(envio?.adelanto_monto) || 0) + (Number(envio?.final_monto) || 0))
  const flete = String(envio?.incoterm || '').toUpperCase() === 'CIF' ? 0 : (Number(envio?.flete_monto) || 0)
  const cif = mercaderia + flete

  // DAI ponderado por línea; las líneas sin partida se asumen 0% (TLC).
  const base = sumaLineas || mercaderia
  const factor = base > 0 ? cif / base : 0
  let dai = 0
  let montoConPartida = 0
  for (const it of lineas) {
    const monto = Number(it.monto) || 0
    const pct = Number(it.dai_pct)
    if (!Number.isFinite(pct)) continue
    montoConPartida += monto
    dai += monto * factor * (pct / 100)
  }

  const ley = cif * LEY_6946
  const iva = (cif + dai + ley) * IVA_CR
  const total = dai + ley + iva

  const cobertura = base > 0 ? montoConPartida / base : 0
  return {
    total: redondear(total),
    total_sin_iva: redondear(dai + ley),
    detalle: {
      mercaderia: redondear(mercaderia),
      flete: redondear(flete),
      cif: redondear(cif),
      dai: redondear(dai),
      dai_pct_promedio: cif > 0 ? Number(((dai / cif) * 100).toFixed(2)) : 0,
      ley_6946: redondear(ley),
      iva: redondear(iva),
      lineas_con_partida: lineas.filter((i) => Number.isFinite(Number(i.dai_pct))).length,
      lineas_totales: lineas.length,
      cobertura_partidas: Number((cobertura * 100).toFixed(0)),
      nota: 'Estimado. No incluye almacenaje, agente aduanal ni gastos portuarios (~$500–900 por contenedor). El IVA se paga en aduana pero después se acredita.',
      calculado: new Date().toISOString(),
    },
  }
}

const redondear = (n) => Math.round((Number(n) || 0) * 100) / 100

// ── Comparativo documento vs. lo que Luis escribió a mano ───────────────────
// NUNCA escribe: solo arma la lista de diferencias para que él decida.
const CAMPOS = [
  { campo: 'proveedor',        label: 'Proveedor',              tipo: 'texto',  de: (x) => x.proveedor },
  { campo: 'pi_num',           label: 'N° de PI / contrato',    tipo: 'texto',  de: (x) => x.pi_num },
  { campo: 'incoterm',         label: 'Incoterm',               tipo: 'texto',  de: (x) => x.incoterm },
  { campo: 'puerto_origen',    label: 'Puerto de origen',       tipo: 'texto',  de: (x) => x.puerto_origen },
  { campo: 'puerto_destino',   label: 'Puerto de destino',      tipo: 'texto',  de: (x) => x.puerto_destino },
  { campo: 'contenedor_tipo',  label: 'Contenedor',             tipo: 'texto',  de: (x) => x.contenedor_tipo },
  { campo: 'dias_produccion',  label: 'Tiempo de producción',   tipo: 'texto',  de: (x) => x.dias_produccion },
  { campo: 'mercaderia_monto', label: 'Valor de la mercadería', tipo: 'monto',  de: (x) => num(x.mercaderia_monto) },
  { campo: 'adelanto_monto',   label: 'Adelanto al proveedor',  tipo: 'monto',  de: (x) => num(x.adelanto_monto) ?? adelantoCalculado(x) },
  { campo: 'final_monto',      label: 'Pago final al proveedor', tipo: 'monto', de: (x) => num(x.saldo_monto) ?? saldoCalculado(x) },
  { campo: 'flete_monto',      label: 'Flete internacional',    tipo: 'monto',  de: (x) => num(x.flete_monto) },
  { campo: 'cbm_total',        label: 'CBM total',              tipo: 'monto',  de: (x) => num(x.cbm_total) },
  { campo: 'pct_adelanto',     label: '% de adelanto',          tipo: 'monto',  de: (x) => num(x.pct_adelanto) },
  { campo: 'resumen',          label: 'Resumen de lo que viene', tipo: 'texto', de: (x) => x.resumen },
]

function adelantoCalculado(x) {
  const pct = num(x.pct_adelanto), total = num(x.total_monto)
  return pct && total ? redondear(total * pct / 100) : null
}
function saldoCalculado(x) {
  const total = num(x.total_monto), ade = num(x.adelanto_monto) ?? adelantoCalculado(x)
  return total && ade ? redondear(total - ade) : null
}

const norm = (v) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

export function compararConEnvio(envio, extraido) {
  const filas = []
  for (const c of CAMPOS) {
    const propuesto = c.de(extraido || {})
    if (propuesto === null || propuesto === undefined || propuesto === '') continue
    const actual = envio ? envio[c.campo] : null
    let igual
    if (c.tipo === 'monto') {
      const a = Number(actual) || 0, b = Number(propuesto) || 0
      igual = a !== 0 && Math.abs(a - b) <= Math.max(1, b * 0.02) // 2% de tolerancia
    } else {
      igual = !!actual && norm(actual) === norm(propuesto)
    }
    const vacio = actual === null || actual === undefined || actual === '' || (c.tipo === 'monto' && Number(actual) === 0)
    filas.push({
      campo: c.campo,
      label: c.label,
      tipo: c.tipo,
      actual: actual ?? null,
      propuesto,
      estado: vacio ? 'vacio' : (igual ? 'igual' : 'distinto'),
    })
  }
  return filas
}

// Campos que la pantalla puede aplicar sobre neptuno_envios.
export const CAMPOS_APLICABLES = new Set([
  ...CAMPOS.map((c) => c.campo),
  'impuestos_monto', 'moneda', 'etd', 'eta',
])

// ── Match automático: ¿a qué envío pertenece este documento? ────────────────
// Se apoya en la plata, que es lo que menos miente: total, adelanto y saldo.
// Devuelve candidatos ordenados; confirmar es siempre un click de Luis.
function tokens(s) {
  return new Set(String(s || '').toLowerCase().replace(/[^a-z0-9áéíóúñ ]/gi, ' ').split(/\s+/).filter((t) => t.length > 3))
}
function solapan(a, b) {
  const A = tokens(a), B = tokens(b)
  if (!A.size || !B.size) return 0
  let n = 0
  for (const t of A) if (B.has(t)) n++
  return n / Math.min(A.size, B.size)
}
const cerca = (a, b, tol = 0.03) => {
  const x = Number(a), y = Number(b)
  if (!x || !y) return false
  return Math.abs(x - y) <= Math.max(50, y * tol)
}

export function matchEnvios(extraido, envios) {
  const total = num(extraido?.total_monto)
  const ade = num(extraido?.adelanto_monto) ?? adelantoCalculado(extraido || {})
  const saldo = num(extraido?.saldo_monto) ?? saldoCalculado(extraido || {})
  const prov = extraido?.proveedor || ''
  const pi = norm(extraido?.pi_num)

  const candidatos = envios.map((e) => {
    const motivos = []
    let score = 0
    if (pi && norm(e.pi_num) === pi) { score += 60; motivos.push('mismo N° de PI') }
    if (cerca(ade, e.adelanto_monto)) { score += 32; motivos.push('coincide el adelanto') }
    if (cerca(saldo, e.final_monto)) { score += 32; motivos.push('coincide el pago final') }
    if (cerca(total, (Number(e.adelanto_monto) || 0) + (Number(e.final_monto) || 0))) { score += 24; motivos.push('coincide el total') }
    const sp = Math.max(solapan(prov, e.proveedor), solapan(prov, e.nombre))
    if (sp >= 0.5) { score += 12; motivos.push('coincide el proveedor') }
    return { envio_id: e.id, nombre: e.nombre, proveedor: e.proveedor, eta: e.eta, score, motivos }
  })

  return candidatos.filter((c) => c.score >= 24).sort((a, b) => b.score - a.score).slice(0, 4)
}

// ── Storage ─────────────────────────────────────────────────────────────────
export function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex')
}

export async function subirArchivo(file, buffer, hash) {
  const path = rutaStorage(file.name, hash.slice(0, 12))
  const { error } = await getDb().storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type || 'application/octet-stream',
    upsert: true,
  })
  if (error) throw new HttpError(500, 'No se pudo guardar el archivo: ' + error.message)
  return path
}

// Recalcula y guarda el estimado de impuestos de un envío (no toca el monto real).
export async function recalcularEstimado(envioId) {
  const db = getDb()
  const { data: envio } = await db.from('neptuno_envios').select('*').eq('id', envioId).maybeSingle()
  if (!envio) return null
  const { data: items } = await db.from('neptuno_items').select('monto, dai_pct').eq('envio_id', envioId)
  const est = estimarImpuestos({ envio, items: items || [] })
  await db.from('neptuno_envios')
    .update({ impuestos_estimado: est.total, impuestos_detalle: est.detalle })
    .eq('id', envioId)
  return est
}

// ── Lectura (y relectura) de un documento ya guardado ───────────────────────
// El archivo se sube SIEMPRE, se lea o no. Si la lectura falla (falta la clave,
// el PDF es una foto borrosa, lo que sea), el documento queda con estado
// 'error' y se puede reintentar después sin volver a subirlo.
export async function leerDocumento(doc, { file, buffer } = {}) {
  const db = getDb()

  let bin = buffer
  if (!bin) {
    const { data: blob, error } = await db.storage.from(BUCKET).download(doc.storage_path)
    if (error || !blob) throw new HttpError(404, 'El archivo ya no está en el storage.')
    bin = Buffer.from(await blob.arrayBuffer())
  }
  const archivo = file || { name: doc.nombre, type: doc.mime_type || '' }

  let extraido = null
  let error = null
  try {
    extraido = await extraerDoc({ file: archivo, buffer: bin })
  } catch (e) {
    error = e instanceof HttpError ? e.message : String(e?.message || e)
  }

  // Candidatos de envío solo si todavía no está asignado.
  let candidatos = []
  if (extraido && !doc.envio_id) {
    const { data: activos } = await db.from('neptuno_envios')
      .select('id, nombre, proveedor, eta, pi_num, adelanto_monto, final_monto')
      .eq('archivado', false)
    candidatos = matchEnvios(extraido, activos || [])
  }

  const { data: actualizado } = await db.from('neptuno_docs').update({
    tipo_doc: extraido?.tipo_doc || doc.tipo_doc || 'otro',
    estado: extraido ? 'procesado' : 'error',
    error,
    extraido: extraido ?? doc.extraido ?? null,
    match_sugerido: candidatos.length ? { candidatos } : null,
  }).eq('id', doc.id).select('*').single()

  // Las líneas que salieron de este documento se rehacen, salvo las que Luis
  // corrigió a mano: esas mandan y no se tocan.
  let items = []
  if (extraido) {
    await db.from('neptuno_items').delete().eq('doc_id', doc.id).eq('editado', false)
    items = await armarItems(extraido)
    if (items.length) {
      await db.from('neptuno_items').insert(
        items.map((it) => ({ ...it, doc_id: doc.id, envio_id: doc.envio_id || null }))
      )
    }
    if (doc.envio_id) await recalcularEstimado(doc.envio_id)
  }

  return { doc: actualizado || doc, extraido, error, candidatos, items }
}
