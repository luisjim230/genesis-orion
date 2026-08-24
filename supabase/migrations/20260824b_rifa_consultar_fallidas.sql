-- Consultar acciones informa las facturas fallidas (con motivo) para que el
-- cliente vea en "Mis acciones" por qué una factura no sumó (ej. menor a ₡25.000).
-- Además, el robot deja un mensaje de fallo más claro (incluye el mínimo).
create or replace function public.rifa_consultar_acciones(p_cedula text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v record; v_pend int; v_fallidas jsonb;
begin
  select count(*) into v_pend from rifa_pendientes where cedula = trim(p_cedula) and estado='pendiente';
  select coalesce(jsonb_agg(jsonb_build_object(
           'monto', monto_declarado, 'factura', ult_factura, 'motivo', ultimo_error)
           order by fecha_creacion desc), '[]'::jsonb)
    into v_fallidas
    from rifa_pendientes
    where cedula = trim(p_cedula) and estado='fallida'
      and fecha_creacion > now() - interval '30 days';
  select * into v from rifa_saldos where cedula = trim(p_cedula);
  if not found then
    return jsonb_build_object('encontrado', false, 'pendientes', v_pend, 'fallidas', v_fallidas);
  end if;
  return jsonb_build_object('encontrado', true, 'nombre', v.nombre,
    'acciones', v.acciones, 'ya_gano', v.ya_gano, 'pendientes', v_pend, 'fallidas', v_fallidas);
end; $$;
grant execute on function public.rifa_consultar_acciones(text) to anon, authenticated;

create or replace function public.rifa_procesar_pendientes()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  p record; v_r jsonb; v_estado text; v_msg text;
  v_activa text; v_ok int := 0; v_fail int := 0; v_wait int := 0;
begin
  select valor into v_activa from rifa_config where clave='activa';
  for p in select * from rifa_pendientes where estado = 'pendiente' order by fecha_creacion asc loop
    update rifa_pendientes set intentos = intentos + 1 where id = p.id;
    if coalesce(v_activa,'true') <> 'true' then v_wait := v_wait + 1; continue; end if;
    v_r := public.rifa_intentar_credito(p.cedula, p.nombre, p.telefono, p.ult_factura, p.monto_declarado);
    v_estado := v_r->>'estado';
    if v_estado = 'ok' then
      update rifa_pendientes set estado='procesada', registro_id=(v_r->>'registro_id')::bigint,
        fecha_procesada=now(), ultimo_error=null where id = p.id;
      v_ok := v_ok + 1;
    elsif v_estado in ('duplicada','monto_bajo','datos') then
      v_msg := case v_estado
        when 'duplicada' then 'Esta factura ya estaba registrada.'
        when 'monto_bajo' then 'No suma acciones: el monto es menor al mínimo de ₡'||coalesce(v_r->>'minimo','25000')||'.'
        else 'Datos incompletos.' end;
      update rifa_pendientes set estado='fallida', ultimo_error=v_msg where id = p.id;
      v_fail := v_fail + 1;
    else
      if now() - p.fecha_creacion > interval '24 hours' then
        update rifa_pendientes set estado='fallida',
          ultimo_error='No encontramos esta factura en el sistema. Revisá el número y el monto.' where id = p.id;
        v_fail := v_fail + 1;
      else
        update rifa_pendientes set ultimo_error='Aún no aparece en el sistema.' where id = p.id;
        v_wait := v_wait + 1;
      end if;
    end if;
  end loop;
  return jsonb_build_object('acreditadas', v_ok, 'fallidas', v_fail, 'en_espera', v_wait);
end; $$;
revoke all on function public.rifa_procesar_pendientes() from public;
