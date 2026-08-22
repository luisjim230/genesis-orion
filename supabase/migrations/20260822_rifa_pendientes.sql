-- ────────────────────────────────────────────────────────────────────────────
-- Rifa de Motos — Cola de facturas PENDIENTES.
-- La sync NEO → Supabase no es en tiempo real: si el cliente registra apenas
-- sale de caja, su factura todavía no está para hacer match. En vez de darle
-- error, guardamos sus datos en una cola y un robot (pg_cron) reintenta el match
-- cada 30 min hasta acreditar las acciones (o marcarla fallida tras 24 h).
-- ────────────────────────────────────────────────────────────────────────────

create table if not exists public.rifa_pendientes (
  id              bigint generated always as identity primary key,
  cedula          text not null,
  nombre          text,
  telefono        text,
  ult_factura     text not null,     -- dígitos tal como los ingresó el cliente
  monto_declarado numeric not null,
  estado          text not null default 'pendiente',  -- pendiente | procesada | fallida
  intentos        int not null default 0,
  ultimo_error    text,
  registro_id     bigint,
  fecha_creacion  timestamptz default now(),
  fecha_procesada timestamptz
);
create index if not exists rifa_pendientes_estado_idx on public.rifa_pendientes (estado);
create index if not exists rifa_pendientes_cedula_idx on public.rifa_pendientes (cedula);

alter table public.rifa_pendientes enable row level security;

-- ── Núcleo reutilizable: intenta acreditar una factura y devuelve el estado ───
-- No valida activa/corte (eso lo hace el llamador) ni toca la cola de pendientes.
-- estado: ok | no_match | duplicada | monto_bajo | datos
create or replace function public.rifa_intentar_credito(
  p_cedula text, p_nombre text, p_telefono text, p_ult_factura text, p_monto numeric)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_ced text := trim(p_cedula);
  v_dig int; v_tol numeric; v_col_accion numeric;
  v_mult_pat numeric; v_mult_web numeric; v_vend_web text;
  v_factura text; v_monto_real numeric; v_vendedor text;
  v_base numeric; v_mult numeric; v_acciones numeric; v_reg_id bigint;
  v_patroc boolean := false; v_patroc_prod boolean := false;
  v_credix boolean := false; v_web boolean := false; v_provs jsonb;
  v_solo_dig text := regexp_replace(coalesce(p_ult_factura,''), '\D', '', 'g');
begin
  if v_ced is null or length(v_ced) < 5 then return jsonb_build_object('estado','datos'); end if;
  if v_solo_dig = '' or p_monto is null or p_monto <= 0 then return jsonb_build_object('estado','datos'); end if;

  select valor::int     into v_dig        from rifa_config where clave='digitos_factura';
  select valor::numeric into v_tol        from rifa_config where clave='tolerancia_monto_pct';
  select valor::numeric into v_col_accion from rifa_config where clave='colones_por_accion';
  select valor::numeric into v_mult_pat   from rifa_config where clave='bono_patrocinador_mult';
  select valor::numeric into v_mult_web   from rifa_config where clave='bono_web_mult';
  select valor          into v_vend_web   from rifa_config where clave='vendedor_web';

  with lineas as (
    select distinct on (f.factura, f.codigo_interno, f.fecha_real, f.cantidad_facturada, f.cantidad_devuelta)
      f.factura, f.total
    from neo_items_facturados f
    where right(f.factura, v_dig) = right(v_solo_dig, v_dig)),
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

revoke all on function public.rifa_intentar_credito(text,text,text,text,numeric) from public;

-- ── RPC pública: registrar factura (acredita ya, o encola si aún no aparece) ──
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
    -- Encolar (evitando duplicar un pendiente idéntico ya en cola)
    if not exists (
      select 1 from rifa_pendientes
      where cedula = v_ced and estado = 'pendiente'
        and regexp_replace(coalesce(ult_factura,''),'\D','','g') = v_solo_dig
        and abs(monto_declarado - p_monto) < 1
    ) then
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

-- ── Robot: procesa la cola de pendientes ─────────────────────────────────────
create or replace function public.rifa_procesar_pendientes()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  p record; v_r jsonb; v_estado text;
  v_activa text; v_ok int := 0; v_fail int := 0; v_wait int := 0;
begin
  select valor into v_activa from rifa_config where clave='activa';

  for p in select * from rifa_pendientes where estado = 'pendiente' order by fecha_creacion asc loop
    update rifa_pendientes set intentos = intentos + 1 where id = p.id;

    -- Si la rifa está apagada, no acreditamos: dejamos en cola.
    if coalesce(v_activa,'true') <> 'true' then v_wait := v_wait + 1; continue; end if;

    v_r := public.rifa_intentar_credito(p.cedula, p.nombre, p.telefono, p.ult_factura, p.monto_declarado);
    v_estado := v_r->>'estado';

    if v_estado = 'ok' then
      update rifa_pendientes
        set estado='procesada', registro_id=(v_r->>'registro_id')::bigint,
            fecha_procesada=now(), ultimo_error=null
        where id = p.id;
      v_ok := v_ok + 1;
    elsif v_estado in ('duplicada','monto_bajo','datos') then
      update rifa_pendientes
        set estado='fallida',
            ultimo_error = case v_estado
              when 'duplicada' then 'La factura ya estaba registrada.'
              when 'monto_bajo' then 'El monto no alcanza el mínimo para una acción.'
              else 'Datos incompletos.' end
        where id = p.id;
      v_fail := v_fail + 1;
    else
      -- no_match: sigue esperando, salvo que ya pasaron 24 h → fallida
      if now() - p.fecha_creacion > interval '24 hours' then
        update rifa_pendientes
          set estado='fallida', ultimo_error='La factura no apareció en el sistema en 24 horas.'
          where id = p.id;
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

-- ── RPC pública: consultar acciones (ahora informa pendientes en proceso) ─────
create or replace function public.rifa_consultar_acciones(p_cedula text)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v record; v_pend int;
begin
  select count(*) into v_pend from rifa_pendientes where cedula = trim(p_cedula) and estado='pendiente';
  select * into v from rifa_saldos where cedula = trim(p_cedula);
  if not found then
    return jsonb_build_object('encontrado', false, 'pendientes', v_pend);
  end if;
  return jsonb_build_object('encontrado', true, 'nombre', v.nombre,
    'acciones', v.acciones, 'ya_gano', v.ya_gano, 'pendientes', v_pend);
end; $$;

grant execute on function public.rifa_consultar_acciones(text) to anon, authenticated;

-- ── Programar el robot cada 30 minutos ───────────────────────────────────────
select cron.schedule('rifa_procesar_pendientes', '*/30 * * * *',
  $$ select public.rifa_procesar_pendientes(); $$);
