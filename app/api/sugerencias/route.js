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
    // Min/max: items que NEO tiene bajo control (~400)
    const minmaxByCod = {}
    {
      let off=0
      while(true){
        const {data:chunk}=await supabase().from('neo_minimos_maximos').select('codigo,nombre,categoria,minimo,existencias,maximo,ultimo_proveedor,ultimo_costo,moneda,promedio_mensual,estatus').eq('fecha_carga',fc).range(off,off+999)
        if(!chunk?.length) break
        for(const r of chunk){
          const k=String(r.codigo||'').trim().toUpperCase()
          if(k && !minmaxByCod[k]) minmaxByCod[k]=r
        }
        if(chunk.length<1000) break; off+=1000
      }
    }
    // Catálogo completo (~4200 items activos)
    const {data:listaLatest}=await supabase().from('neo_lista_items').select('fecha_carga').order('fecha_carga',{ascending:false}).limit(1)
    const fcLista=listaLatest?.[0]?.fecha_carga
    let listaRows=[]
    if(fcLista){
      let off=0
      while(true){
        const {data:chunk}=await supabase().from('neo_lista_items').select('codigo_interno,item,categoria,proveedor,existencias,costo_sin_imp,moneda_costo').eq('fecha_carga',fcLista).eq('activo','Sí').range(off,off+999)
        if(!chunk?.length) break; listaRows=listaRows.concat(chunk); if(chunk.length<1000) break; off+=1000
      }
    }
    // Promedio mensual real (últimos 6m) para items sin min/max
    try { await supabase().rpc('refresh_mv_consumo_mensual') } catch(_) {}
    const consumoByCod={}
    {
      let off=0
      while(true){
        const {data:chunk}=await supabase().from('mv_consumo_mensual').select('codigo,promedio_mensual').range(off,off+999)
        if(!chunk?.length) break
        for(const r of chunk){
          const k=String(r.codigo||'').trim().toUpperCase()
          if(k) consumoByCod[k]=parseFloat(r.promedio_mensual)||0
        }
        if(chunk.length<1000) break; off+=1000
      }
    }
    // Merge: base = catálogo completo
    const todos=[]
    const seenCod=new Set()
    for(const li of listaRows){
      const codRaw=String(li.codigo_interno||'').trim()
      if(!codRaw) continue
      const k=codRaw.toUpperCase()
      if(seenCod.has(k)) continue
      seenCod.add(k)
      const mm=minmaxByCod[k]
      const promMinmax=parseFloat(mm?.promedio_mensual)||0
      const promReal=consumoByCod[k]||0
      todos.push({
        codigo: codRaw,
        nombre: mm?.nombre || li.item || '',
        categoria: mm?.categoria || li.categoria || null,
        minimo: mm?.minimo ?? 0,
        maximo: mm?.maximo ?? 0,
        existencias: mm?.existencias ?? li.existencias ?? 0,
        ultimo_proveedor: mm?.ultimo_proveedor || (li.proveedor||'').trim() || null,
        ultimo_costo: mm?.ultimo_costo ?? li.costo_sin_imp ?? 0,
        moneda: mm?.moneda || li.moneda_costo || 'CRC',
        promedio_mensual: promMinmax > 0 ? promMinmax : promReal,
      })
    }
    for(const mm of Object.values(minmaxByCod)){
      const k=String(mm.codigo||'').trim().toUpperCase()
      if(k && !seenCod.has(k)){ seenCod.add(k); todos.push(mm) }
    }
    const {data:tData}=await supabase().from('ordenes_compra_items').select('codigo,cantidad_ordenada,cantidad_recibida,estado_item').in('estado_item',['pendiente','parcial'])
    const tMap={}, tUnidades={}
    for(const i of (tData||[])){
      const c=String(i.codigo||'').trim()
      const p=Math.max((parseFloat(i.cantidad_ordenada)||0)-(parseFloat(i.cantidad_recibida)||0),0)
      if(c&&p>0){ tMap[c]=(tMap[c]||0)+p }
    }
    const totalUnidades=Object.values(tMap).reduce((s,v)=>s+v,0)
    const diasNum=parseInt(dias)||36
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
