'use client'

export async function generarPDFOrden({ numeroSol, proveedor, items, fecha }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = 210
  const NAVY = [26, 54, 93]; const WHITE = [255,255,255]; const BLACK = [20,20,20]; const GRAY = [100,100,100]; const LIGHT = [240,240,240]
  const hoy = fecha || new Date().toLocaleDateString('es-CR',{day:'2-digit',month:'2-digit',year:'numeric'})
  const parts = hoy.split('/'); const dia=parts[0]||''; const mes=parts[1]||''; const anio=parts[2]||''
  const fmtN=(n)=>Number(n).toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})+' CRC'
  // Header bar
  doc.setFillColor(...NAVY); doc.rect(0,0,W,18,'F')
  doc.setTextColor(...WHITE); doc.setFontSize(8); doc.setFont('helvetica','normal')
  doc.text('| corporacionrojimo@gmail.com',W/2+5,7,{align:'center'})
  doc.text('+506 22941212',W/2+5,12,{align:'center'})
  // Logo text
  doc.setTextColor(...NAVY); doc.setFontSize(20); doc.setFont('helvetica','bold')
  doc.text('DEPOSITO JIMENEZ',20,35)
  doc.setFillColor(237,110,46); doc.rect(20,38,60,1.5,'F')
  // OC box
  doc.setTextColor(...BLACK); doc.setFontSize(12); doc.setFont('helvetica','bold')
  doc.text('Orden de compra No',125,27)
  if(numeroSol){doc.setFontSize(10);doc.setFont('helvetica','normal');doc.text(numeroSol,162,34,{align:'center'})}
  const tX=118,tY=36,tW=75,tH=12,col=tW/3
  doc.setFillColor(...NAVY); doc.rect(tX,tY,tW,6,'F')
  doc.setTextColor(...WHITE); doc.setFontSize(7); doc.setFont('helvetica','bold')
  doc.text('DIA',tX+col*0+col/2,tY+4.2,{align:'center'})
  doc.text('MES',tX+col*1+col/2,tY+4.2,{align:'center'})
  doc.text('AÑO',tX+col*2+col/2,tY+4.2,{align:'center'})
  doc.setFillColor(...WHITE); doc.rect(tX,tY+6,tW,tH-6,'F')
  doc.setDrawColor(...NAVY); doc.setLineWidth(0.3); doc.rect(tX,tY,tW,tH)
  doc.line(tX+col,tY,tX+col,tY+tH); doc.line(tX+col*2,tY,tX+col*2,tY+tH)
  doc.setTextColor(...BLACK); doc.setFontSize(10); doc.setFont('helvetica','bold')
  doc.text(dia,tX+col*0+col/2,tY+10.5,{align:'center'})
  doc.text(mes,tX+col*1+col/2,tY+10.5,{align:'center'})
  doc.text(anio,tX+col*2+col/2,tY+10.5,{align:'center'})
  // Empresa info
  let y=54
  doc.setFontSize(9);doc.setFont('helvetica','bold');doc.setTextColor(...BLACK)
  doc.text('Corporacion Rojimo S.A.',20,y); y+=5
  doc.setFont('helvetica','normal');doc.setTextColor(...GRAY);doc.setFontSize(8)
  doc.text('Cedula Juridica No3101317661',20,y); y+=4
  doc.text('300 sur de la Iglesia de Ipis de Goicoechea, bodegas color naranja',20,y)
  // Proveedor
  y+=12; doc.setFontSize(10);doc.setTextColor(...BLACK);doc.setFont('helvetica','bold')
  doc.text('PROVEEDOR:',20,y); doc.setFont('helvetica','normal'); doc.text(' '+(proveedor||''),48,y)
  doc.setDrawColor(...BLACK);doc.setLineWidth(0.3);doc.line(20,y+1.5,W-20,y+1.5)
  y+=10; doc.setFont('helvetica','bold'); doc.text('TELEFONO:',20,y); doc.line(20,y+1.5,W-20,y+1.5)
  y+=10; doc.text('DIRECCION:',20,y); doc.line(20,y+1.5,W-20,y+1.5)
  // Tabla productos
  y+=12
  const cols=[{l:'CANTIDAD',w:22,a:'center'},{l:'CODIGO',w:35,a:'center'},{l:'DESCRIPCION',w:73,a:'left'},{l:'PRECIO',w:27,a:'right'},{l:'TOTAL',w:13,a:'right'}]
  const rowH=6; const tableX=20
  doc.setFillColor(...NAVY); doc.rect(tableX,y,W-40,rowH,'F')
  doc.setTextColor(...WHITE);doc.setFontSize(7.5);doc.setFont('helvetica','bold')
  let cx=tableX
  for(const c of cols){const tx=c.a==='right'?cx+c.w-2:c.a==='center'?cx+c.w/2:cx+2;doc.text(c.l,tx,y+4.2,{align:c.a==='left'?'left':c.a});cx+=c.w}
  y+=rowH
  doc.setFont('helvetica','normal');doc.setFontSize(8)
  for(let i=0;i<items.length;i++){
    const item=items[i]; const qty=Number(item.cantidad)||0
    const precio=Number(item.costo||item.costo_unitario||item.precio||0); const total=qty*precio
    if(i%2===0){doc.setFillColor(248,248,248);doc.rect(tableX,y,W-40,rowH*2,'F')}
    doc.setTextColor(...BLACK); cx=tableX
    const vals=[{v:qty.toFixed(2),a:'center'},{v:String(item.codigo),a:'center'},{v:item.nombre||String(item.codigo),a:'left'},{v:fmtN(precio),a:'right'},{v:fmtN(total),a:'right'}]
    for(let j=0;j<cols.length;j++){
      const c=cols[j];const v=vals[j];const tx=v.a==='right'?cx+c.w-2:v.a==='center'?cx+c.w/2:cx+2
      if(j===2){const lines=doc.splitTextToSize(v.v,c.w-4);doc.text(lines[0],tx,y+4,{align:'left'});if(lines[1])doc.text(lines[1],tx,y+8,{align:'left'})}
      else{doc.text(v.v,tx,y+4,{align:v.a==='left'?'left':v.a})}
      cx+=c.w
    }
    y+=rowH*2
  }
  doc.setDrawColor(...LIGHT);doc.setLineWidth(0.2)
  // Totales
  y+=6; const subtotal=items.reduce((s,i)=>s+(Number(i.cantidad)||0)*(Number(i.costo||i.costo_unitario||i.precio||0)),0)
  doc.setFontSize(8);doc.setFont('helvetica','bold');doc.setTextColor(...BLACK)
  doc.text('Valor en letras:',20,y)
  const totX=120,totW=70
  const totRows=[{l:'Subtotal:',v:fmtN(subtotal)},{l:'Descuentos:',v:fmtN(0)},{l:'IVA:',v:fmtN(0)}]
  let ty=y
  for(const row of totRows){
    doc.setFont('helvetica','normal');doc.setFontSize(8.5)
    doc.text(row.l,totX,ty+4);doc.text(row.v,totX+totW-2,ty+4,{align:'right'})
    doc.setDrawColor(...LIGHT);doc.setLineWidth(0.2);doc.rect(totX,ty,totW,7);ty+=7
  }
  doc.setFillColor(...NAVY);doc.rect(totX,ty,totW,8,'F')
  doc.setTextColor(...WHITE);doc.setFont('helvetica','bold');doc.setFontSize(9)
  doc.text('TOTAL:',totX+2,ty+5.5);doc.text(fmtN(subtotal),totX+totW-2,ty+5.5,{align:'right'})
  // Campos
  y+=8; doc.setTextColor(...BLACK);doc.setFont('helvetica','bold');doc.setFontSize(8.5)
  doc.text('Observaciones:',20,y+4);doc.setDrawColor(...LIGHT);doc.rect(20,y,90,7)
  y+=10;doc.setFont('helvetica','bold');doc.text('Hecho por:',20,y);doc.line(38,y+0.5,90,y+0.5)
  y+=7;doc.text('Recibido por:',20,y);doc.line(41,y+0.5,90,y+0.5)
  // Footer
  const footY=277
  doc.setFillColor(...NAVY);doc.rect(0,footY,W,20,'F')
  doc.setTextColor(...WHITE);doc.setFontSize(6.5);doc.setFont('helvetica','normal')
  const ft='Emitida conforme lo establecido en la resolucion de Facturacion Electronica, No. DGT-R-48-2016 del siete de octubre de dos mil dieciseis de la Direccion General de Tributacion'
  doc.text(doc.splitTextToSize(ft,W-20),W/2,footY+5,{align:'center'})
  doc.setFontSize(6);doc.text('Deposito a la cuenta: NA  Cedula juridica: 3101317661.',W/2,footY+13,{align:'center'})
  return doc
}
