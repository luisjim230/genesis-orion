import ExcelJS from 'exceljs'

export async function POST(req) {
  try {
    const {items, proveedor} = await req.json()
    const wb = new ExcelJS.Workbook()
    wb.creator = 'Genesis'
    const ws = wb.addWorksheet('Orden')

    // Headers - plain strings, no column-level formats
    ws.getCell('A1').value = 'Código'
    ws.getCell('B1').value = 'Cantidad comprada'
    ws.getCell('C1').value = 'Costo unitario de la compra'
    ws.getCell('D1').value = 'Descuento'

    // Style headers
    ;['A1','B1','C1','D1'].forEach(addr => {
      const c = ws.getCell(addr)
      c.font = {bold: true}
      c.fill = {type: 'pattern', pattern: 'solid', fgColor: {argb: 'FFF2F2F2'}}
      c.border = {top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}
    })

    // Data rows
    items.forEach((i, idx) => {
      const row = idx + 2
      const cellA = ws.getCell(`A${row}`)
      cellA.value = String(i.codigo || '')
      cellA.numFmt = '@'

      ws.getCell(`B${row}`).value = Number(i.cantidad) || 0
      ws.getCell(`C${row}`).value = Number(i.ultimo_costo || i.costo) || 0
      ws.getCell(`C${row}`).numFmt = '#,##0.00'
      ws.getCell(`D${row}`).value = Number(i.descuento) || 0
    })

    // Column widths
    ws.getColumn('A').width = 22
    ws.getColumn('B').width = 18
    ws.getColumn('C').width = 28
    ws.getColumn('D').width = 12

    const buf = await wb.xlsx.writeBuffer()
    const ns = (proveedor || 'orden').replace(/[\/\\?*[\]]/g, '-').substring(0, 40)
    const fecha = new Date().toISOString().slice(0, 10)
    return new Response(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="OC_${ns}_${fecha}.xlsx"`
      }
    })
  } catch(e) {
    return Response.json({error: e.message}, {status: 500})
  }
}
