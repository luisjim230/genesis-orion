import {
  getDb, ok, bad, handle, BUCKET, RECEPTOR_EMPRESA,
  parseFacturaXML, cargarContexto, buscarProveedor, clasificar,
  armarLineasGasto, guardarFactura, crearAsientoConLineas, HttpError,
} from '../_lib'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// POST /api/contabilidad/procesar  (multipart: files[] = XML y/o PDF)
// Por cada archivo: parsea/extrae, clasifica, arma el asiento y lo guarda
// como borrador. Devuelve { creados, ignorados, rechazados }.
export async function POST(request) {
  return handle(async () => {
    const form = await request.formData()
    const files = form.getAll('files').filter((f) => f && typeof f.arrayBuffer === 'function')
    const creadoPor = (form.get('creado_por') || '').toString().trim() || null
    if (!files.length) return bad('No llegó ningún archivo.')

    const ctx = await cargarContexto()
    const creados = [], ignorados = [], rechazados = []

    for (const file of files) {
      const nombre = file.name || 'archivo'
      try {
        const esXml = /\.xml$/i.test(nombre) || /xml/i.test(file.type || '')
        const factura = esXml
          ? parseFacturaXML(new TextDecoder('utf-8').decode(await file.arrayBuffer()))
          : await extraerDesdePdf(file)
        factura._origen = esXml ? 'xml' : 'pdf'

        const res = await procesarFactura(factura, file, ctx, creadoPor)
        if (res.tipo === 'creado') creados.push(res)
        else if (res.tipo === 'ignorado') ignorados.push(res)
        else rechazados.push(res)
      } catch (e) {
        rechazados.push({ tipo: 'rechazado', archivo: nombre, motivo: e?.message || String(e) })
      }
    }

    return ok({ creados, ignorados, rechazados })
  })
}

async function procesarFactura(factura, file, ctx, creadoPor) {
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

  // 5) Mercadería / ignorar -> guardamos la factura pero NO creamos asiento
  if (cls.decision === 'ignorar') {
    await guardarFactura(factura, 'mercaderia', storagePath)
    return { tipo: 'ignorado', archivo: nombre, motivo: cls.motivo, proveedor: proveedor?.nombre || factura.nombre_emisor }
  }

  // 6) Armar líneas del asiento
  const clasifFactura = cls.decision === 'nuevo' ? 'por_clasificar' : (cls.decision === 'preguntar' ? 'preguntar' : 'gasto')
  await guardarFactura(factura, clasifFactura, storagePath)

  const { lineas } = armarLineasGasto(factura, proveedor, ctx, 'gasto')

  // Descripción legible
  const desc = [
    proveedor?.nombre || factura.nombre_emisor || 'Proveedor',
    factura.consecutivo ? `· ${factura.consecutivo}` : '',
  ].join(' ').trim()

  const asiento = await crearAsientoConLineas({
    fecha: (factura.fecha_emision || new Date().toISOString()).slice(0, 10),
    descripcion: desc,
    tipo_origen: factura._origen,
    clave_factura: factura.clave || null,
    moneda: factura.moneda || 'CRC',
    tipo_cambio: factura.tipo_cambio || null,
    deducible: proveedor?.deducible_default !== false,
    creado_por: creadoPor,
    pdf_url: storagePath.pdf_path || null,
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
