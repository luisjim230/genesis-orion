// app/api/neo/encolar-oc/route.js
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function generarExcelNEO(items) {
  const ss = ['Código','Cantidad comprada','Costo unitario de la compra','Descuento']
  const rows = items.map((item, idx) => {
    const r = idx + 2
    return '<row r="' + r + '"><c r="A' + r + '" t="n"><v>' + String(item.codigo).replace(/[<>&]/g,'') + '</v></c><c r="B' + r + '" t="n"><v>' + (Number(item.cantidad)||0) + '</v></c><c r="C' + r + '" t="n"><v>' + (Number(item.costo_unitario)||0) + '</v></c><c r="D' + r + '" t="n"><v>' + (Number(item.descuento)||0) + '</v></c></row>'
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
      const { data: precios } = await supabase
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
    const { error: uploadError } = await supabase.storage
      .from('oc-excels')
      .upload(nombreArchivo, xlsxBuffer, {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        upsert: true
      })
    if (uploadError) {
      return Response.json({ error: 'Error subiendo archivo: ' + uploadError.message }, { status: 500 })
    }
    const { error: insertError } = await supabase
      .from('cola_neo_uploads')
      .insert({
        nombre_archivo: nombreArchivo,
        storage_path: 'oc-excels/' + nombreArchivo,
        proveedor_nombre: proveedor,
        estado: 'pendiente',
        creado_por: creadoPor || 'sol'
      })
    if (insertError) {
      return Response.json({ error: 'Error insertando en cola: ' + insertError.message }, { status: 500 })
    }
    return Response.json({ ok: true, nombre_archivo: nombreArchivo })
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 })
  }
}
