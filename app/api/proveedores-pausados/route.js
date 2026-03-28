import { createClient } from '@supabase/supabase-js'
let _sb; function sb() { if (!_sb) _sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY); return _sb; }
export async function POST(req){
  try{
    const {accion,proveedor,motivo}=await req.json()
    if(accion==='pausar'){await sb().from('proveedores_pausados').upsert({proveedor,motivo:motivo||''});return Response.json({ok:true})}
    if(accion==='reactivar'){await sb().from('proveedores_pausados').delete().eq('proveedor',proveedor);return Response.json({ok:true})}
    if(accion==='listar'){const{data}=await sb().from('proveedores_pausados').select('proveedor,motivo');return Response.json({pausados:data||[]})}
    return Response.json({error:'Acción desconocida'},{status:400})
  }catch(e){return Response.json({error:e.message},{status:500})}
}
