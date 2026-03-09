import ExcelJS from 'exceljs'

export async function POST(req) {
  try {
    const {items, proveedor} = await req.json()
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Orden')

    // Headers
    const headers = ['Código', 'Cantidad comprada', 'Costo unitario de la compra', 'Descuento']
    headers.forEach((h, i) => {
      const cell = ws.getCell(1, i + 1)
      cell.value = h
      cell.font = { bold: true, name: 'Calibri', size: 11 }
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } }
      cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } }
      cell.numFmt = 'General'
    })

    // Column widths
    ws.getColumn(1).width = 22
    ws.getColumn(2).width = 18
    ws.getColumn(3).width = 28
    ws.getColumn(4).width = 12

    // Data rows
    items.forEach((item, idx) => {
      const r = idx + 2
      const cellA = ws.getCell(r, 1)
      cellA.value = String(item.codigo || '')
      cellA.numFmt = '@'
      cellA.font = { name: 'Calibri', size: 11 }

      const cellB = ws.getCell(r, 2)
      cellB.value = Number(item.cantidad) || 0
      cellB.numFmt = 'General'
      cellB.font = { name: 'Calibri', size: 11 }
      cellB.alignment = { horizontal: 'center' }

      const cellC = ws.getCell(r, 3)
      cellC.value = Number(item.ultimo_costo || item.costo) || 0
      cellC.numFmt = '#,##0.00'
      cellC.font = { name: 'Calibri', size: 11 }

      const cellD = ws.getCell(r, 4)
      cellD.value = Number(item.descuento) || 0
      cellD.numFmt = '#,##0.00'
      cellD.font = { name: 'Calibri', size: 11 }
    })

    // AutoFilter - required by NEO to recognize the file
    ws.autoFilter = { from: 'A1', to: `D${items.length + 1}` }

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
    return Response.json({ error: e.message }, { status: 500 })
  }
}
