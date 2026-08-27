import { requireUserOrMachine } from '../../../../lib/auth-server'
import {
  getDb, ok, bad, handle, BUCKET, RECEPTOR_EMPRESA,
  parseFacturaXML, raizXML, parseAcuseXML, guardarEstadoHacienda,
  RAICES_COMPROBANTE, RAICES_ACUSE,
  cargarContexto, buscarProveedor, clasificar,
  armarLineasGasto, armarLineasNotaCredito, esNotaCredito,
  guardarFactura, crearAsientoConLineas, modoPruebaActivo, HttpError,
} from '../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/contabilidad/procesar  (multipart: files[] = XML y/o PDF)
// Cada archivo va en su PROPIO try/catch: si uno falla, los demás igual se
// procesan y el que falló aparece en rechazados. Devuelve
// { creados, ignorados, rechazados, acuses }.
export async function POST(request) {
  const _g = await requireUserOrMachine(request); if (_g.response) return _g.response;

  return handle(async () => {
    const form = await request.formData()
    const files = form.getAll('files').filter((f) => f && typeof f.arrayBuffer === 'function')
    const creadoPor = (form.get('creado_por') || '').toString().trim() || null
    if (!files.length) return bad('No llegó ningún archivo.')

    const ctx = await cargarContexto()
    const esPrueba = await modoPruebaActivo()
    const creados = [], ignorados = [], rechazados = [], acuses = []

    // Casi toda factura llega como XML + PDF gemelo (+ acuse). Se procesan los
    // XML PRIMERO: así, cuando toca el PDF, su factura ya entró por el XML (que
    // es el que manda) y el PDF se reconoce como duplicado en vez de intentar
    // leerlo y ensuciar el resultado con un "rechazado" que asusta.
    const orden = [...files].sort((a, b) =>
      (/\.pdf$/i.test(a.name || '') ? 1 : 0) - (/\.pdf$/i.test(b.name || '') ? 1 : 0))
    let huboComprobante = false // ¿ya entró alguna factura por su XML en este lote?

    for (const file of orden) {
      const nombre = file.name || 'archivo'
      try {
        const esPdf = /\.pdf$/i.test(nombre) || /pdf/i.test(file.type || '')

        // ── PDF: el XML manda. Si el XML gemelo ya está (por la clave en el
        //    nombre, o porque entró en este mismo lote), no se lee el PDF. ────
        if (esPdf) {
          const claveNom = (nombre.match(/\d{48,50}/) || [])[0]
          if (claveNom) {
            const { data: fex } = await getDb().from('conta_facturas').select('xml_path').eq('clave', claveNom).maybeSingle()
            if (fex?.xml_path) { ignorados.push({ tipo: 'ignorado', archivo: nombre, motivo: 'PDF gemelo: ya está el XML (el XML manda).' }); continue }
          }
          let factura
          try {
            factura = await extraerDesdePdf(file)
          } catch (e) {
            // No se pudo leer el PDF: si la factura ya entró por su XML en este
            // lote, es solo el PDF gemelo → se ignora en vez de rechazar.
            if (huboComprobante) { ignorados.push({ tipo: 'ignorado', archivo: nombre, motivo: 'PDF gemelo: la factura ya entró por su XML.' }); continue }
            throw e
          }
          factura._origen = 'pdf'
          empujar(await procesarFactura(factura, file, ctx, creadoPor, esPrueba), { creados, ignorados, rechazados })
          continue
        }

        // ── XML: decidir por la RAÍZ, no por el nombre del archivo ──────────
        const texto = new TextDecoder('utf-8').decode(await file.arrayBuffer())
        const raiz = raizXML(texto)

        if (RAICES_ACUSE.includes(raiz)) {
          // Acuse de Hacienda: NO es factura. Se ignora, pero se aprovecha.
          const ac = parseAcuseXML(texto)
          let aplicado = false
          if (ac.clave && ac.estado) aplicado = await guardarEstadoHacienda(ac.clave, ac.estado)
          acuses.push({ archivo: nombre, clave: ac.clave || null, estado: ac.estado || 'desconocido', aplicado })
          continue
        }

        if (!RAICES_COMPROBANTE.includes(raiz)) {
          rechazados.push({ tipo: 'rechazado', archivo: nombre, motivo: `No es un comprobante ni un acuse (raíz <${raiz || 'desconocida'}>).` })
          continue
        }

        const factura = parseFacturaXML(texto)
        factura._origen = 'xml'
        const res = await procesarFactura(factura, file, ctx, creadoPor, esPrueba)
        if (res.tipo === 'creado' || res.tipo === 'ignorado') huboComprobante = true
        empujar(res, { creados, ignorados, rechazados })
      } catch (e) {
        rechazados.push({ tipo: 'rechazado', archivo: nombre, motivo: e?.message || String(e) })
      }
    }

    return ok({ creados, ignorados, rechazados, acuses })
  })
}

function empujar(res, { creados, ignorados, rechazados }) {
  if (res.tipo === 'creado') creados.push(res)
  else if (res.tipo === 'ignorado') ignorados.push(res)
  else rechazados.push(res)
}

async function procesarFactura(factura, file, ctx, creadoPor, esPrueba) {
  const db = getDb()
  const nombre = file.name || 'archivo'

  // 1) Debe ser una factura recibida por la empresa (receptor = cédula propia)
  if (factura.cedula_receptor && factura.cedula_receptor.replace(/\D/g, '') !== RECEPTOR_EMPRESA) {
    return { tipo: 'rechazado', archivo: nombre, motivo: `Esta factura la emitió la empresa (receptor ${factura.cedula_receptor}), no es un gasto.` }
  }

  // 2) XML manda: si ya hay XML de esta factura y esto es un PDF, se ignora el PDF
  if (factura.clave) {
    const { data: fex } = await db.from('conta_facturas').select('clave,xml_path').eq('clave', factura.clave).maybeSingle()
    if (fex?.xml_path && factura._origen === 'pdf') {
      return { tipo: 'ignorado', archivo: nombre, motivo: 'Ya existe el XML de esta factura (el XML manda).' }
    }
    // Si ya hay un asiento activo para esta clave, no duplicar
    const { data: asx } = await db.from('conta_asientos').select('id,estado').eq('clave_factura', factura.clave).neq('estado', 'descartado').maybeSingle()
    if (asx) {
      return { tipo: 'rechazado', archivo: nombre, motivo: `Esta factura ya está contabilizada en el asiento #${asx.id} (${asx.estado}).` }
    }
  }

  // 3) Buscar proveedor y clasificar
  const proveedor = await buscarProveedor(factura.cedula_emisor, factura.nombre_emisor)
  const cls = clasificar(factura, proveedor)

  // 4) Subir el archivo al bucket privado
  const storagePath = await subirArchivo(file, factura)

  // 5) Mercadería / ignorar -> guardamos la factura (nunca se borra) marcada
  //    procesada=false, para que aparezca en "Ignoradas" y se pueda revisar /
  //    convertir en gasto. NO creamos asiento.
  if (cls.decision === 'ignorar') {
    await guardarFactura(factura, 'mercaderia', { ...storagePath, procesada: false })
    return { tipo: 'ignorado', archivo: nombre, motivo: cls.motivo, proveedor: proveedor?.nombre || factura.nombre_emisor }
  }

  // 6) Armar líneas del asiento
  const clasifFactura = cls.decision === 'nuevo' ? 'por_clasificar' : (cls.decision === 'preguntar' ? 'preguntar' : 'gasto')
  await guardarFactura(factura, clasifFactura, storagePath)

  // Nota de crédito de proveedor: es la reversa de una compra (baja el gasto),
  // no un gasto nuevo. Se arman las líneas invertidas.
  const esNC = esNotaCredito(factura.tipo_documento)
  const { lineas } = esNC
    ? armarLineasNotaCredito(factura, proveedor, ctx)
    : armarLineasGasto(factura, proveedor, ctx, 'gasto')

  // Si la factura vino en otra moneda, las líneas ya están convertidas a CRC.
  // Se deja constancia en la descripción y el asiento queda en CRC.
  const enMonedaExtranjera = factura.moneda && factura.moneda !== 'CRC' && Number(factura.tipo_cambio) > 1
  const notaMoneda = enMonedaExtranjera
    ? ` (${factura.moneda} ${Number(factura.total_comprobante || 0).toLocaleString('es-CR')} @ ${factura.tipo_cambio})`
    : ''

  // Descripción legible (las NC se prefijan para que se distingan de un golpe)
  const desc = (esNC ? 'NC · ' : '') + [
    proveedor?.nombre || factura.nombre_emisor || 'Proveedor',
    factura.consecutivo ? `· ${factura.consecutivo}` : '',
  ].join(' ').trim() + notaMoneda

  const asiento = await crearAsientoConLineas({
    fecha: (factura.fecha_emision || new Date().toISOString()).slice(0, 10),
    descripcion: desc,
    tipo_origen: factura._origen,
    clave_factura: factura.clave || null,
    clave_referencia: factura.referencia_clave || null,
    moneda: 'CRC',
    tipo_cambio: factura.tipo_cambio || null,
    deducible: proveedor?.deducible_default !== false,
    creado_por: creadoPor,
    pdf_url: storagePath.pdf_path || null,
    es_prueba: esPrueba,
  }, lineas)

  const avisos = []
  if (cls.aviso) avisos.push(cls.aviso)
  if (factura._origen === 'pdf') avisos.push('Leído de PDF, verificá los montos.')

  return {
    tipo: 'creado',
    archivo: nombre,
    asiento_id: asiento.id,
    proveedor: proveedor?.nombre || factura.nombre_emisor,
    decision: cls.decision,
    confianza: proveedor?.confianza ?? null,
    avisos,
  }
}

// Sube el XML o PDF al bucket. Devuelve { xml_path?, pdf_path? }
async function subirArchivo(file, factura) {
  const db = getDb()
  const buf = Buffer.from(await file.arrayBuffer())
  const esPdf = /\.pdf$/i.test(file.name || '') || /pdf/i.test(file.type || '')
  const year = (factura.fecha_emision || new Date().toISOString()).slice(0, 4)
  const base = (factura.clave || file.name || Date.now()).toString().replace(/[^a-zA-Z0-9._-]/g, '_')
  const ext = esPdf ? 'pdf' : 'xml'
  const path = `${year}/${base}.${ext}`
  const { error } = await db.storage.from(BUCKET).upload(path, buf, {
    contentType: esPdf ? 'application/pdf' : 'application/xml', upsert: true,
  })
  if (error) throw new HttpError(500, 'No se pudo subir el archivo: ' + error.message)
  return esPdf ? { pdf_path: path } : { xml_path: path }
}

// ── Extracción de PDF con Anthropic (Haiku) ──────────────────────────────────
async function extraerDesdePdf(file) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new HttpError(400, 'Falta la variable ANTHROPIC_API_KEY para leer PDFs. Cargala en Vercel. (Los XML sí funcionan sin ella.)')
  }
  const buf = Buffer.from(await file.arrayBuffer())
  const b64 = buf.toString('base64')

  const prompt = `Sos un asistente contable de Costa Rica. Extraé de esta factura electrónica los datos y devolvé SOLO un JSON válido (sin explicación, sin markdown) con esta forma exacta:
{
  "clave": "clave numérica de 50 dígitos si aparece, si no null",
  "consecutivo": "número de comprobante o null",
  "cedula_emisor": "cédula del emisor (solo dígitos) o null",
  "nombre_emisor": "nombre del emisor",
  "cedula_receptor": "cédula del receptor (solo dígitos) o null",
  "fecha_emision": "fecha ISO YYYY-MM-DD o null",
  "moneda": "CRC o USD",
  "tipo_cambio": número o 1,
  "num_oc": "número de orden de compra tipo OC-1234-5678 si aparece, si no null",
  "total_impuesto": número (IVA total),
  "total_comprobante": número (total a pagar),
  "venta_neta": número (subtotal sin impuesto),
  "desglose_impuesto": [ { "tarifa": 13, "base": número, "monto": número } ],
  "lineas": [ { "detalle": "texto", "cabys": "código o null", "base_imponible": número, "impuesto_monto": número, "tarifa": número } ]
}
Los montos van como números sin símbolos ni separadores de miles. Si una factura mezcla tarifas (13% y 1%), separalas en desglose_impuesto y en cada línea.`

  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{
        role: 'user',
        content: [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
          { type: 'text', text: prompt },
        ],
      }],
    }),
  })
  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    throw new HttpError(502, 'Anthropic no pudo leer el PDF: ' + resp.status + ' ' + t.slice(0, 200))
  }
  const data = await resp.json()
  const texto = (data.content || []).map((c) => c.text || '').join('')
  const jsonMatch = texto.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new HttpError(502, 'No se pudo interpretar la respuesta del lector de PDF.')
  const ex = JSON.parse(jsonMatch[0])

  // Normalizar a la forma que produce parseFacturaXML
  const lineas = (ex.lineas || []).map((l) => ({
    cabys: l.cabys || null,
    detalle: l.detalle || '',
    base_imponible: Number(l.base_imponible) || 0,
    subtotal: Number(l.base_imponible) || 0,
    impuesto_monto: Number(l.impuesto_monto) || 0,
    impuestos: l.tarifa ? [{ tarifa: Number(l.tarifa), monto: Number(l.impuesto_monto) || 0 }] : [],
  }))
  return {
    clave: ex.clave || null,
    consecutivo: ex.consecutivo || null,
    tipo_documento: 'FacturaElectronica',
    cedula_emisor: (ex.cedula_emisor || '').toString().replace(/\D/g, '') || null,
    nombre_emisor: ex.nombre_emisor || '',
    cedula_receptor: (ex.cedula_receptor || '').toString().replace(/\D/g, '') || null,
    fecha_emision: ex.fecha_emision || null,
    moneda: ex.moneda || 'CRC',
    tipo_cambio: Number(ex.tipo_cambio) || 1,
    total_gravado: 0, total_exento: 0,
    total_descuentos: 0,
    total_impuesto: Number(ex.total_impuesto) || 0,
    total_comprobante: Number(ex.total_comprobante) || 0,
    venta_neta: Number(ex.venta_neta) || ((Number(ex.total_comprobante) || 0) - (Number(ex.total_impuesto) || 0)),
    desglose_impuesto: (ex.desglose_impuesto || []).map((d) => ({ tarifa: Number(d.tarifa), base: Number(d.base) || 0, monto: Number(d.monto) || 0 })),
    lineas,
    num_oc: ex.num_oc || null,
    medio_pago: null, condicion_venta: null,
  }
}
