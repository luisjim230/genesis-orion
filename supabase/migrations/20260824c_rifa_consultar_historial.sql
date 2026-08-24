-- Consultar acciones ahora devuelve también el historial de facturas que sumaron,
-- para que el cliente vea en su perfil de dónde salieron sus acciones.
create or replace function public.rifa_consultar_acciones(p_cedula text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v record; v_pend int; v_fallidas jsonb; v_hist jsonb;
begin
  select count(*) into v_pend from rifa_pendientes where cedula = trim(p_cedula) and estado='pendiente';

  select coalesce(jsonb_agg(jsonb_build_object(
           'monto', monto_declarado, 'factura', ult_factura, 'motivo', ultimo_error)
           order by fecha_creacion desc), '[]'::jsonb)
    into v_fallidas
    from rifa_pendientes
    where cedula = trim(p_cedula) and estado='fallida'
      and fecha_creacion > now() - interval '30 days';

  select coalesce(jsonb_agg(jsonb_build_object(
           'factura', right(factura,6), 'monto', monto_real, 'acciones', acciones,
           'es_web', es_web, 'patrocinador', tuvo_patrocinador, 'fecha', fecha_registro)
           order by fecha_registro desc), '[]'::jsonb)
    into v_hist
    from rifa_registros where cedula = trim(p_cedula);

  select * into v from rifa_saldos where cedula = trim(p_cedula);
  if not found then
    return jsonb_build_object('encontrado', false, 'pendientes', v_pend,
      'fallidas', v_fallidas, 'historial', '[]'::jsonb);
  end if;
  return jsonb_build_object('encontrado', true, 'nombre', v.nombre,
    'acciones', v.acciones, 'ya_gano', v.ya_gano, 'pendientes', v_pend,
    'fallidas', v_fallidas, 'historial', v_hist);
end; $$;
grant execute on function public.rifa_consultar_acciones(text) to anon, authenticated;
