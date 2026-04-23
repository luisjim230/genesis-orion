// app/api/neo/encolar-oc/route.js
import { createClient } from '@supabase/supabase-js'

let _sb;
function getDb() { if (!_sb) _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY); return _sb; }

function generarExcelNEO(items) {
  const ss = ['Código','Cantidad comprada','Costo unitario de la compra','Descuento']
  const rows = items.map((item, idx) => {
    const r = idx + 2
    const cod = String(item.codigo).replace(/[<>&]/g,'')
    const esNumero = /^\d+$/.test(cod)
    const celdaCodigo = esNumero
      ? '<c r="A' + r + '" t="n"><v>' + cod + '</v></c>'
      : '<c r="A' + r + '" t="inlineStr"><is><t>' + cod + '</t></is></c>'
    return '<row r="' + r + '">' + celdaCodigo + '<c r="B' + r + '" t="n"><v>' + (Number(item.cantidad)||0) + '</v></c><c r="C' + r + '" t="n"><v>' + (Number(item.costo_unitario)||0) + '</v></c><c r="D' + r + '" t="n"><v>' + (Number(item.descuento)||0) + '</v></c></row>'
  }).join('\n')
  const sheetXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c><c r="D1" t="s"><v>3</v></c></row>' + rows + '</sheetData></worksheet>'
  const sharedStringsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="4" uniqueCount="4">' + ss.map(s => '<si><t xml:space="preserve">' + s + '</t></si>').join('') + '</sst>'
  const workbookXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Orden" sheetId="1" r:id="rId1"/></sheets></workbook>'
  const workbookRels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'
  const contentTypes = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'
  const relsRoot = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
  return { sheetXml, sharedStringsXml, workbookXml, workbookRels, contentTypes, relsRoot }
}

async function buildXlsxBuffer(items) {
  const JSZip = (await import('jszip')).default
  const zip = new JSZip()
  const { sheetXml, sharedStringsXml, workbookXml, workbookRels, contentTypes, relsRoot } = generarExcelNEO(items)
  zip.file('[Content_Types].xml', contentTypes)
  zip.file('_rels/.rels', relsRoot)
  zip.file('xl/workbook.xml', workbookXml)
  zip.file('xl/_rels/workbook.xml.rels', workbookRels)
  zip.file('xl/worksheets/sheet1.xml', sheetXml)
  zip.file('xl/sharedStrings.xml', sharedStringsXml)
  return await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' })
}

export async function POST(request) {
  try {
    let { proveedor, items, creadoPor } = await request.json()
    if (!proveedor || !items?.length) {
      return Response.json({ error: 'Faltan proveedor o items' }, { status: 400 })
    }
    // Enriquecer items con precios de neo_minimos_maximos si vienen en 0
    const codigos = items.filter(i => !i.costo_unitario).map(i => String(i.codigo))
    if (codigos.length > 0) {
      const { data: precios } = await getDb()
        .from('neo_minimos_maximos')
        .select('codigo, ultimo_costo')
        .in('codigo', codigos)
      if (precios) {
        const mapaPrecios = {}
        for (const p of precios) mapaPrecios[String(p.codigo)] = parseFloat(p.ultimo_costo) || 0
        items = items.map(i => ({
          ...i,
          costo_unitario: i.costo_unitario || mapaPrecios[String(i.codigo)] || 0
        }))
      }
    }

    const fecha = new Date().toISOString().slice(0, 10)
    const proveedorSafe = proveedor.toUpperCase().replace(/[^A-Z0-9]/g,'_').replace(/_+/g,'_').slice(0,40)
    const ts = Date.now(); const nombreArchivo = 'OC_' + proveedorSafe + '_' + fecha + '_' + ts + '.xlsx'
    const xlsxBuffer = await buildXlsxBuffer(items)
    const { error: uploadError } = await getDb().storage
      .from('oc-excels')
      .upload(nombreArchivo, xlsxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true
      })
    if (uploadError) {
      return Response.json({ error: 'Error subiendo archivo: ' + uploadError.message }, { status: 500 })
    }
    // Dividir items en lotes de max 20
    const LOTE = 20
    const lotes = []
    for (let i = 0; i < items.length; i += LOTE) {
      lotes.push(items.slice(i, i + LOTE))
    }

    const anio = new Date().getFullYear()
    const resultados = []

    for (let idx = 0; idx < lotes.length; idx++) {
      const lote = lotes[idx]
      const sufijo = lotes.length > 1 ? `_parte${idx+1}de${lotes.length}` : ''
      const nombreLote = 'OC_' + proveedorSafe + '_' + fecha + '_' + ts + sufijo + '.xlsx'
      const xlsxLote = await buildXlsxBuffer(lote)

      const { error: uploadErr } = await getDb().storage
        .from('oc-excels')
        .upload(nombreLote, xlsxLote, {
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          upsert: true
        })
      if (uploadErr) continue

      const { data: consData } = await getDb().rpc('siguiente_numero_sol', { p_anio: anio })
      const numeroSol = `OC-${anio}-${String(consData).padStart(4, '0')}`

      await getDb().from('cola_neo_uploads').insert({
        nombre_archivo: nombreLote,
        storage_path: 'oc-excels/' + nombreLote,
        proveedor_nombre: proveedor,
        estado: 'pendiente',
        creado_por: creadoPor || 'sol',
        numero_sol: numeroSol
      })

      resultados.push({ numero_sol: numeroSol, items: lote, nombre_archivo: nombreLote })
    }

    if (resultados.length === 0) {
      return Response.json({ error: 'Error generando lotes' }, { status: 500 })
    }

    return Response.json({
      ok: true,
      lotes: resultados,
      numero_sol: resultados[0].numero_sol,
      nombre_archivo: resultados[0].nombre_archivo
    })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
