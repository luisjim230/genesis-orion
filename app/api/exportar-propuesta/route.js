import ExcelJS from 'exceljs'
export async function POST(req) {
  try {
    const {resultados}=await req.json()
    const wb=new ExcelJS.Workbook()
    const ws1=wb.addWorksheet('Sugerencia de Compras del Día')
    ws1.columns=[
      {header:'Último proveedor',key:'proveedor',width:42},
      {header:'Código',key:'codigo',width:22},
      {header:'Nombre',key:'nombre',width:52},
      {header:'Alerta',key:'alerta',width:24},
      {header:'Existencias',key:'existencias',width:13},
      {header:'Promedio mensual',key:'promedio_mensual',width:17},
      {header:'Cantidad a comprar',key:'cantidad',width:18},
      {header:'Último costo',key:'ultimo_costo',width:16},
    ]
    ws1.getRow(1).eachCell(c=>{c.font={bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9E6FF'}};c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}})
    const sorted=[...resultados].sort((a,b)=>(a.proveedor||'').localeCompare(b.proveedor||''))
    for(const r of sorted) ws1.addRow({proveedor:r.proveedor,codigo:r.codigo,nombre:r.nombre,alerta:r.alerta,existencias:r.existencias,promedio_mensual:r.promedio_mensual,cantidad:r.cantidad,ultimo_costo:r.ultimo_costo})
    ws1.getColumn('existencias').numFmt='#,##0'
    ws1.getColumn('promedio_mensual').numFmt='#,##0.00'
    ws1.getColumn('cantidad').numFmt='#,##0'
    ws1.getColumn('ultimo_costo').numFmt='#,##0.00'
    const ws2=wb.addWorksheet('Resumen por Proveedor')
    ws2.columns=[{header:'Último proveedor',key:'proveedor',width:42},{header:'Productos',key:'productos',width:12}]
    ws2.getRow(1).eachCell(c=>{c.font={bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFD9F2E6'}};c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}})
    const resumen={}
    for(const r of resultados){if(!resumen[r.proveedor])resumen[r.proveedor]=0;resumen[r.proveedor]++}
    for(const [prov,count] of Object.entries(resumen).sort()) ws2.addRow({proveedor:prov,productos:count})
    const buf=await wb.xlsx.writeBuffer()
    const fecha=new Date().toISOString().slice(0,10)
    return new Response(buf,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="Sugerencia_Compras_${fecha}.xlsx"`}})
  } catch(e){return Response.json({error:e.message},{status:500})}
}
