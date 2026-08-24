-- Solo cuentan facturas con fecha_real >= fecha_desde (arranque de campaña).
-- Reduce colisiones (solo facturas de la campaña) y aliviana el match (rango de
-- fechas chico, usa idx_facturados_fecha_real). Vacío = sin filtro (pruebas).
insert into public.rifa_config (clave, valor, descripcion)
values ('fecha_desde','','Solo cuentan facturas desde esta fecha (YYYY-MM-DD). Vacío = todas')
on conflict (clave) do nothing;

create or replace function public.rifa_intentar_credito(
  p_cedula text, p_nombre text, p_telefono text, p_ult_factura text, p_monto numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_ced text := trim(p_cedula);
  v_tol numeric; v_col_accion numeric;
  v_mult_pat numeric; v_mult_web numeric; v_vend_web text; v_desde date;
  v_factura text; v_monto_real numeric; v_vendedor text;
  v_base numeric; v_mult numeric; v_acciones numeric; v_reg_id bigint;
  v_patroc boolean := false; v_patroc_prod boolean := false;
  v_credix boolean := false; v_web boolean := false; v_provs jsonb;
  v_solo_dig text := regexp_replace(coalesce(p_ult_factura,''), '\D', '', 'g');
  v_match6   text;
begin
  if v_ced is null or length(v_ced) < 5 then return jsonb_build_object('estado','datos'); end if;
  if v_solo_dig = '' or p_monto is null or p_monto <= 0 then return jsonb_build_object('estado','datos'); end if;

  select valor::numeric into v_tol        from rifa_config where clave='tolerancia_monto_pct';
  select valor::numeric into v_col_accion from rifa_config where clave='colones_por_accion';
  select valor::numeric into v_mult_pat   from rifa_config where clave='bono_patrocinador_mult';
  select valor::numeric into v_mult_web   from rifa_config where clave='bono_web_mult';
  select valor          into v_vend_web   from rifa_config where clave='vendedor_web';
  select nullif(trim(valor),'')::date into v_desde from rifa_config where clave='fecha_desde';

  v_match6 := lpad(right(v_solo_dig, 6), 6, '0');

  with lineas as (
    select distinct on (f.factura, f.codigo_interno, f.fecha_real, f.cantidad_facturada, f.cantidad_devuelta)
      f.factura, f.total
    from neo_items_facturados f
    where right(f.factura, 6) = v_match6
      and (v_desde is null or f.fecha_real >= v_desde)),
  totales as (select factura, sum(total) as total_factura from lineas group by factura)
  select factura, total_factura into v_factura, v_monto_real
  from totales
  where abs(total_factura - p_monto) <= greatest(p_monto * v_tol/100.0, 3000)
  order by abs(total_factura - p_monto) asc limit 1;

  if v_factura is null then return jsonb_build_object('estado','no_match'); end if;
  if exists (select 1 from rifa_registros where factura = v_factura) then
    return jsonb_build_object('estado','duplicada'); end if;

  v_base := floor(v_monto_real / nullif(v_col_accion,0));
  if coalesce(v_base,0) < 1 then
    return jsonb_build_object('estado','monto_bajo','minimo',v_col_accion); end if;

  select
    exists (
      select 1 from neo_items_facturados f
      join lateral (
        select trim(proveedor) as prov from neo_lista_items       where codigo_interno = f.codigo_interno
        union
        select trim(proveedor) as prov from neo_inventario_proveedor where codigo_interno = f.codigo_interno) pv on true
      join rifa_patrocinadores rp
        on rp.activo and rp.neo_proveedor is not null and trim(rp.neo_proveedor) = pv.prov
      where f.factura = v_factura),
    coalesce((
      select jsonb_agg(distinct rp.nombre)
      from neo_items_facturados f
      join lateral (
        select trim(proveedor) as prov from neo_lista_items       where codigo_interno = f.codigo_interno
        union
        select trim(proveedor) as prov from neo_inventario_proveedor where codigo_interno = f.codigo_interno) pv on true
      join rifa_patrocinadores rp
        on rp.activo and rp.neo_proveedor is not null and trim(rp.neo_proveedor) = pv.prov
      where f.factura = v_factura), '[]'::jsonb)
  into v_patroc_prod, v_provs;

  if exists (select 1 from rifa_patrocinadores where activo and detecta_credix) then
    v_credix := coalesce((
      select bool_or(observaciones ilike '%credix%')
      from neo_consolidado_facturas where factura = v_factura), false);
  end if;

  select bool_or(trim(f.vendedor) = trim(v_vend_web)), max(f.vendedor)
  into v_web, v_vendedor from neo_items_facturados f where f.factura = v_factura;
  v_web := coalesce(v_web, false);

  v_patroc := v_patroc_prod or v_credix;
  v_mult := greatest(1,
    case when v_web    then coalesce(v_mult_web,1) else 1 end,
    case when v_patroc then coalesce(v_mult_pat,1) else 1 end);
  v_acciones := v_base * v_mult;

  insert into rifa_participantes (cedula, nombre, telefono)
  values (v_ced, coalesce(nullif(trim(p_nombre),''),'Sin nombre'), nullif(trim(p_telefono),''))
  on conflict (cedula) do update
    set nombre   = coalesce(nullif(trim(excluded.nombre),''), rifa_participantes.nombre),
        telefono = coalesce(excluded.telefono, rifa_participantes.telefono);

  insert into rifa_registros
    (cedula, factura, monto_declarado, monto_real, base_acciones, multiplicador,
     acciones, tuvo_patrocinador, es_web, vendedor, detalle)
  values
    (v_ced, v_factura, p_monto, v_monto_real, v_base, v_mult,
     v_acciones, v_patroc, v_web, v_vendedor,
     jsonb_build_object('base', v_base, 'monto_real', v_monto_real, 'colones_por_accion', v_col_accion,
       'multiplicador', v_mult, 'patrocinador', v_patroc, 'patrocinador_por', v_provs,
       'credix', v_credix, 'web', v_web, 'vendedor', v_vendedor))
  returning id into v_reg_id;

  return jsonb_build_object('estado','ok','registro_id',v_reg_id,
    'acciones_ganadas', v_acciones, 'base', v_base, 'multiplicador', v_mult,
    'patrocinador', v_patroc, 'es_web', v_web,
    'saldo', (select acciones from rifa_saldos where cedula = v_ced));
end; $$;
revoke execute on function public.rifa_intentar_credito(text,text,text,text,numeric) from anon, authenticated, public;
