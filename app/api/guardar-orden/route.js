import { createClient } from '@supabase/supabase-js'
let _sb; function sb() { if (!_sb) _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); return _sb; }
export async function POST(req){
  try{
    const {items,nombreLote,diasTribucion}=await req.json()
    const ahora=new Date().toISOString()
    const {data:orden}=await sb().from('ordenes_compra').insert({fecha_orden:ahora,nombre_lote:nombreLote,dias_tribucion:diasTribucion,total_productos:items.length,creado_en:ahora}).select().single()
    const rows=items.map(i=>({orden_id:orden.id,codigo:String(i.codigo||'').trim(),nombre:String(i.nombre||''),proveedor:String(i.proveedor||''),cantidad_ordenada:parseFloat(i.cantidad)||0,costo_unitario:parseFloat(i.costo_unitario||i.costo||i.ultimo_costo||i.precio)||0,descuento:parseFloat(i.descuento)||0,dias_tribucion:diasTribucion,cantidad_recibida:0,estado_item:'pendiente',creado_en:ahora}))
    await sb().from('ordenes_compra_items').insert(rows)
    return Response.json({ok:true,orden_id:orden.id})
  }catch(e){return Response.json({error:e.message},{status:500})}
}
