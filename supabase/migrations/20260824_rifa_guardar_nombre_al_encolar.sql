-- Fix: al encolar una factura pendiente, guardar YA la identidad del participante
-- (nombre + teléfono), aunque las acciones se acrediten después. Antes el nombre
-- quedaba solo en rifa_pendientes y el participante podía quedar como 'Sin nombre'.
create or replace function public.rifa_registrar_factura(
  p_cedula text, p_nombre text, p_telefono text, p_ult_factura text, p_monto numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_ced text := trim(p_cedula);
  v_activa text; v_corte text; v_r jsonb; v_estado text;
  v_solo_dig text := regexp_replace(coalesce(p_ult_factura,''), '\D', '', 'g');
begin
  if v_ced is null or length(v_ced) < 5 then
    return jsonb_build_object('ok', false, 'error', 'Cédula inválida.'); end if;
  if v_solo_dig = '' or p_monto is null or p_monto <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Faltan datos de la factura o el monto.'); end if;

  select valor into v_activa from rifa_config where clave='activa';
  if coalesce(v_activa,'true') <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'La rifa no está activa en este momento.'); end if;

  select valor into v_corte from rifa_config where clave='fecha_corte';
  if coalesce(v_corte,'') <> '' and now() > v_corte::timestamptz then
    return jsonb_build_object('ok', false, 'error', 'El período para acumular acciones ya cerró.'); end if;

  v_r := public.rifa_intentar_credito(p_cedula, p_nombre, p_telefono, p_ult_factura, p_monto);
  v_estado := v_r->>'estado';

  if v_estado = 'ok' then
    return jsonb_build_object('ok', true, 'pendiente', false,
      'acciones_ganadas', (v_r->>'acciones_ganadas')::numeric,
      'base', (v_r->>'base')::numeric, 'multiplicador', (v_r->>'multiplicador')::numeric,
      'patrocinador', (v_r->>'patrocinador')::boolean, 'es_web', (v_r->>'es_web')::boolean,
      'saldo', (v_r->>'saldo')::numeric);
  elsif v_estado = 'duplicada' then
    return jsonb_build_object('ok', false, 'error', 'Esta factura ya fue registrada anteriormente.');
  elsif v_estado = 'monto_bajo' then
    return jsonb_build_object('ok', false,
      'error', 'El monto de la factura no alcanza el mínimo para una acción (₡'||(v_r->>'minimo')||').');
  elsif v_estado = 'no_match' then
    -- Guardar la identidad del participante desde ya (aunque las acciones lleguen luego)
    insert into rifa_participantes (cedula, nombre, telefono)
    values (v_ced, coalesce(nullif(trim(p_nombre),''),'Sin nombre'), nullif(trim(p_telefono),''))
    on conflict (cedula) do update
      set nombre   = coalesce(nullif(trim(excluded.nombre),''), rifa_participantes.nombre),
          telefono = coalesce(excluded.telefono, rifa_participantes.telefono);

    if not exists (
      select 1 from rifa_pendientes
      where cedula = v_ced and estado = 'pendiente'
        and regexp_replace(coalesce(ult_factura,''),'\D','','g') = v_solo_dig
        and abs(monto_declarado - p_monto) < 1) then
      insert into rifa_pendientes (cedula, nombre, telefono, ult_factura, monto_declarado)
      values (v_ced, nullif(trim(p_nombre),''), nullif(trim(p_telefono),''), v_solo_dig, p_monto);
    end if;
    return jsonb_build_object('ok', true, 'pendiente', true,
      'mensaje', 'Recibimos tu factura. Tus acciones se acreditan solas en un rato (puede tardar hasta ~2 horas mientras la factura entra al sistema). No tenés que hacer nada más — revisá "Mis acciones" más tarde.');
  else
    return jsonb_build_object('ok', false, 'error', 'Faltan datos de la factura o el monto.');
  end if;
end; $$;
grant execute on function public.rifa_registrar_factura(text,text,text,text,numeric) to anon, authenticated;
