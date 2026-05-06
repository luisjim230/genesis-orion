import { createClient } from '@supabase/supabase-js'
import { ejecutarMatch } from '../../lib/procesar-match.js'
let _supabase; function supabase() { if (!_supabase) _supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); return _supabase; }
export async function POST(req) {
  try {
    const { dias } = await req.json()
    // Ejecutar match antes de calcular tránsito para reflejar compras recientes
    try { await ejecutarMatch(); } catch(_) {}
    const { data: latest } = await supabase().from('neo_minimos_maximos').select('fecha_carga,periodo_reporte').order('fecha_carga',{ascending:false}).limit(1)
    if (!latest?.length) return Response.json({error:'Sin datos'},{status:404})
    const fc = latest[0].fecha_carga
    const periodo = latest[0].periodo_reporte || fc?.slice(0,10) || ''
    let todos=[], offset=0
    while(true){
      const {data:chunk}=await supabase().from('neo_minimos_maximos').select('codigo,nombre,categoria,minimo,existencias,maximo,ultimo_proveedor,ultimo_costo,moneda,promedio_mensual,estatus').eq('fecha_carga',fc).range(offset,offset+999)
      if(!chunk?.length) break; todos=todos.concat(chunk); if(chunk.length<1000) break; offset+=1000
    }
    const {data:tData}=await supabase().from('ordenes_compra_items').select('codigo,cantidad_ordenada,cantidad_recibida,estado_item').in('estado_item',['pendiente','parcial'])
    const tMap={}, tUnidades={}
    for(const i of (tData||[])){
      const c=String(i.codigo||'').trim()
      const p=Math.max((parseFloat(i.cantidad_ordenada)||0)-(parseFloat(i.cantidad_recibida)||0),0)
      if(c&&p>0){ tMap[c]=(tMap[c]||0)+p }
    }
    const totalUnidades=Object.values(tMap).reduce((s,v)=>s+v,0)
    const diasNum=parseInt(dias)||22
    const resultados=[]
    for(const item of todos){
      const prom=parseFloat(item.promedio_mensual)||0, exist=parseFloat(item.existencias)||0
      const cod=String(item.codigo||'').trim(), transito=tMap[cod]||0
      const sug=(prom/30)*diasNum, aBruto=Math.max(sug-exist,0), aNeto=Math.max(aBruto-transito,0), cant=Math.ceil(aNeto)
      if(cant<=0) continue
      const tCubre=aBruto>0&&transito>=aBruto
      let alerta='🟢 Óptimo'
      if(exist<=0&&prom<=0) alerta='🟡 Prestar atención'
      else if(exist<=0&&tCubre) alerta='🟠 En tránsito'
      else if(exist<=0&&transito>0) alerta='🔴 Bajo stock 🚢'
      else if(exist<=0) alerta='🔴 Bajo stock'
      else if(transito>0) alerta='🔴 Bajo stock 🚢'
      else alerta='🔴 Bajo stock'
      resultados.push({codigo:item.codigo,nombre:item.nombre,categoria:item.categoria,proveedor:item.ultimo_proveedor||'Sin proveedor',existencias:exist,promedio_mensual:prom,ultimo_costo:parseFloat(item.ultimo_costo)||0,moneda:item.moneda||'CRC',transito,cantidad:cant,alerta})
    }
    const {data:pData}=await supabase().from('proveedores_pausados').select('proveedor,motivo')
    return Response.json({resultados,pausados:(pData||[]).map(p=>p.proveedor),fechaCarga:fc,periodo,total:todos.length,transitoProductos:Object.keys(tMap).length,transitoUnidades:Math.round(totalUnidades)})
  } catch(e){return Response.json({error:e.message},{status:500})}
}
