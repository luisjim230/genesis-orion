import ExcelJS from 'exceljs'
import JSZip from 'jszip'

export async function POST(req) {
  try {
    const {items, proveedor} = await req.json()

    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Orden')

    const boldFont = { bold: true, name: 'Calibri', size: 11 }
    const normalFont = { name: 'Calibri', size: 11 }
    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
    const thinBorder = { top:{style:'thin'}, left:{style:'thin'}, bottom:{style:'thin'}, right:{style:'thin'} }

    const headers = ['Código', 'Cantidad comprada', 'Costo unitario de la compra', 'Descuento']
    headers.forEach((h, i) => {
      const cell = ws.getCell(1, i + 1)
      cell.value = h
      cell.font = boldFont
      cell.fill = headerFill
      cell.border = thinBorder
      cell.numFmt = 'General'
    })

    ws.getColumn(1).width = 22
    ws.getColumn(2).width = 18
    ws.getColumn(3).width = 28
    ws.getColumn(4).width = 12

    items.forEach((item, idx) => {
      const r = idx + 2
      const a = ws.getCell(r, 1)
      a.value = String(item.codigo || '')
      a.numFmt = '@'
      a.font = normalFont

      const b = ws.getCell(r, 2)
      b.value = Number(item.cantidad) || 0
      b.numFmt = 'General'
      b.font = normalFont
      b.alignment = { horizontal: 'center' }

      const c = ws.getCell(r, 3)
      c.value = Number(item.ultimo_costo || item.costo) || 0
      c.numFmt = '#,##0.00'
      c.font = normalFont

      const d = ws.getCell(r, 4)
      d.value = Number(item.descuento) || 0
      d.numFmt = '#,##0.00'
      d.font = normalFont
    })

    const lastRow = items.length + 1
    ws.autoFilter = { from: 'A1', to: `D${lastRow}` }

    const excelBuf = await wb.xlsx.writeBuffer()

    // Patch workbook.xml to inject _xlnm._FilterDatabase - required by NEO
    const zip = await JSZip.loadAsync(excelBuf)
    const patchedWorkbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><fileVersion appName="xl" lastEdited="4" lowestEdited="4" rupBuild="4505"/><workbookPr defaultThemeVersion="124226"/><bookViews><workbookView xWindow="240" yWindow="15" windowWidth="16095" windowHeight="9660"/></bookViews><sheets><sheet name="Orden" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Orden!$A$1:$D$${lastRow}</definedName></definedNames><calcPr calcId="124519" fullCalcOnLoad="1"/></workbook>`

    zip.file('xl/workbook.xml', patchedWorkbook)
    const patchedBuf = await zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' })

    const ns = (proveedor || 'orden').replace(/[\/\\?*[\]]/g, '-').substring(0, 40)
    const fecha = new Date().toISOString().slice(0, 10)
    return new Response(patchedBuf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="OC_${ns}_${fecha}.xlsx"`
      }
    })
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
