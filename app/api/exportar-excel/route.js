import ExcelJS from 'exceljs'
export async function POST(req) {
  try {
    const {items,proveedor}=await req.json()
    const wb=new ExcelJS.Workbook(), ws=wb.addWorksheet('Orden')
    ws.columns=[{header:'Código',key:'codigo',width:22},{header:'Cantidad comprada',key:'cantidad',width:18},{header:'Costo unitario de la compra',key:'costo',width:28},{header:'Descuento',key:'descuento',width:12}]
    ws.getRow(1).eachCell(c=>{c.font={bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F2F2'}};c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}})
    for(const i of items) ws.addRow({codigo:String(i.codigo||''),cantidad:Number(i.cantidad)||0,costo:Number(i.ultimo_costo||i.costo)||0,descuento:Number(i.descuento)||0})
    ws.getColumn('cantidad').numFmt='#,##0'; ws.getColumn('costo').numFmt='#,##0.00'
    const buf=await wb.xlsx.writeBuffer()
    const ns=(proveedor||'orden').replace(/[/\\?*[\]]/g,'-').substring(0,40)
    const fecha=new Date().toISOString().slice(0,10)
    return new Response(buf,{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="OC_${ns}_${fecha}.xlsx"`}})
  } catch(e){return Response.json({error:e.message},{status:500})}
}
