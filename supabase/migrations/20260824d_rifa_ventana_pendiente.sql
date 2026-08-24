-- El match/acreditación corre en la nube (pg_cron en Supabase), 24/7, independiente
-- de la Mac. Lo único que depende de la Mac es la sync NEO->Supabase que baja las
-- facturas. Para que un atraso de la sync no marque facturas como fallidas antes de
-- tiempo, la ventana de espera es configurable (default 48h).
insert into public.rifa_config (clave, valor, descripcion)
values ('horas_max_pendiente','48','Horas que el robot espera una factura antes de marcarla como no encontrada')
on conflict (clave) do nothing;

create or replace function public.rifa_procesar_pendientes()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  p record; v_r jsonb; v_estado text; v_msg text;
  v_activa text; v_horas numeric; v_ok int := 0; v_fail int := 0; v_wait int := 0;
begin
  select valor into v_activa from rifa_config where clave='activa';
  select valor::numeric into v_horas from rifa_config where clave='horas_max_pendiente';
  v_horas := coalesce(v_horas, 48);

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
      if now() - p.fecha_creacion > (v_horas || ' hours')::interval then
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
