import ExcelJS from 'exceljs'
import JSZip from 'jszip'
export async function POST(req) {
  try {
    const {proveedores,lotes,nombre}=await req.json()
    const zip=new JSZip(), fecha=new Date().toISOString().slice(0,10)
    const makeXls=async(rows)=>{
      const wb=new ExcelJS.Workbook(), ws=wb.addWorksheet('Orden')
      ws.columns=[{header:'Código',key:'codigo',width:22},{header:'Cantidad comprada',key:'cantidad',width:18},{header:'Costo unitario de la compra',key:'costo',width:28},{header:'Descuento',key:'descuento',width:12}]
      ws.getRow(1).eachCell(c=>{c.font={bold:true};c.fill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F2F2'}};c.border={top:{style:'thin'},left:{style:'thin'},bottom:{style:'thin'},right:{style:'thin'}}})
      for(const i of rows) ws.addRow({codigo:String(i.codigo||''),cantidad:Number(i.cantidad)||0,costo:Number(i.ultimo_costo||i.costo)||0,descuento:Number(i.descuento)||0})
      ws.getColumn('cantidad').numFmt='#,##0'; ws.getColumn('costo').numFmt='#,##0.00'
      return await wb.xlsx.writeBuffer()
    }
    if(proveedores){
      for(const p of proveedores){
        const buf=await makeXls(p.items)
        zip.file(`OC_${p.nombre.replace(/[/\\?*[\]]/g,'-').substring(0,40)}_${fecha}.xlsx`,buf)
      }
    }
    if(lotes){
      for(const l of lotes){
        const buf=await makeXls(l.items)
        zip.file(l.nombre,buf)
      }
    }
    const zb=await zip.generateAsync({type:'nodebuffer',compression:'DEFLATE'})
    const fn=nombre||`Ordenes_${fecha}.zip`
    return new Response(zb,{headers:{'Content-Type':'application/zip','Content-Disposition':`attachment; filename="${fn}"`}})
  } catch(e){return Response.json({error:e.message},{status:500})}
}
