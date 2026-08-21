-- ────────────────────────────────────────────────────────────────────────────
-- Rifa de Motos — "Club de Acciones"
-- App hermana del Club del Enchapador. Reusa el matching de facturas NEO
-- (dígitos + monto) pero acumula ACCIONES para un sorteo en vez de puntos.
--
-- Reglas (todas configurables en rifa_config, sin tocar código):
--   base        = floor(monto_real / colones_por_accion)   (25.000 → 1 acción)
--   ×2 si la factura lleva producto de un proveedor patrocinador  (o pago Credix)
--   ×3 si la vendió el vendedor web (Vnidux)
--   gana el mayor (no se apilan)
-- ────────────────────────────────────────────────────────────────────────────

-- Config (clave/valor) ────────────────────────────────────────────────────────
create table if not exists public.rifa_config (
  clave       text primary key,
  valor       text,
  descripcion text
);

insert into public.rifa_config (clave, valor, descripcion) values
  ('digitos_factura',        '5',      'Últimos N dígitos de factura para el matching'),
  ('tolerancia_monto_pct',   '10',     'Tolerancia % del monto declarado vs real'),
  ('colones_por_accion',     '25000',  'Colones de compra que generan 1 acción'),
  ('bono_patrocinador_mult', '2',      'Multiplicador si la factura lleva producto patrocinador o pago Credix'),
  ('bono_web_mult',          '3',      'Multiplicador si la vendió el vendedor web'),
  ('vendedor_web',           'Vnidux', 'Nombre del vendedor que marca venta por la web'),
  ('fecha_corte',            '',       'ISO timestamp; vacío = sin corte. Después no cuentan facturas nuevas'),
  ('activa',                 'true',   'true/false: si la rifa acepta registros')
on conflict (clave) do nothing;

-- Participantes ───────────────────────────────────────────────────────────────
create table if not exists public.rifa_participantes (
  cedula         text primary key,
  nombre         text,
  telefono       text,
  estado         text default 'activo',
  fecha_registro timestamptz default now()
);

-- Registros de factura (1 por factura, acciones ganadas) ──────────────────────
create table if not exists public.rifa_registros (
  id              bigint generated always as identity primary key,
  cedula          text not null,
  factura         text not null unique,
  monto_declarado numeric,
  monto_real      numeric,
  base_acciones   numeric,
  multiplicador   numeric,
  acciones        numeric,
  tuvo_patrocinador boolean default false,
  es_web          boolean default false,
  vendedor        text,
  detalle         jsonb,
  fecha_registro  timestamptz default now()
);
create index if not exists rifa_registros_cedula_idx on public.rifa_registros (cedula);

-- Patrocinadores (para el ×2, la escala y el carrusel de logos) ───────────────
create table if not exists public.rifa_patrocinadores (
  id             bigint generated always as identity primary key,
  nombre         text not null,
  tier           text,
  aporte_colones numeric,
  neo_proveedor  text,               -- proveedor exacto en NEO (dispara el ×2); null = no vende productos
  detecta_credix boolean default false, -- true = se dispara ×2 si la factura pagó con Credix
  logo_url       text,
  activo         boolean default true,
  orden          int default 100
);

insert into public.rifa_patrocinadores (nombre, tier, aporte_colones, neo_proveedor, detecta_credix, orden) values
  ('ARSA',               'Diamante',    2500000, 'DISTRIBUIDORA ARGUEDAS Y SALAS',                 false, 1),
  ('COFERSA',            'Oro',          625000, 'CONSORCIO FERRETERO DE SAN JOSE',                false, 2),
  ('MFA',                'Oro',          625000, 'MFA MAYOREO FERRETERIA Y ACABADOS',              false, 3),
  ('Impersa',            'Oro',          625000, 'IMPERSA SA',                                     false, 4),
  ('Credix',             'Plata',        300000, null,                                             true,  5),
  ('Macopa',             'Plata',        300000, 'INSTALACIONES Y SERVICIOS MACOPA',              false, 6),
  ('Mayoreo del Istmo',  'Plata',        300000, 'MAYOREO DEL ISTMO',                             false, 7),
  ('Tornicentro',        'Bronce',       200000, 'TORNICENTRO INVERSIONES INDUSTRIALES GANA GANA', false, 8),
  ('Megalíneas',         'Bronce',       200000, 'MEGALINEAS SA',                                  false, 9),
  ('Carbone',            'Bronce',       200000, 'DISTRIBUIDORA CARBONE CR',                       false, 10),
  ('Ebisa',              'Colaborador',  100000, 'EBISA GLOBAL BRAND SA',                          false, 11),
  ('Ternium',            'Colaborador',  100000, 'TERNIUM INTERNACIONAL COSTA RICA',               false, 12),
  ('DHF',                'Colaborador',   50000, 'DISTRIBUIDORA HERMANOS FUENTES',                 false, 13)
on conflict do nothing;

-- Ganadores del sorteo (excluidos de sorteos siguientes) ──────────────────────
create table if not exists public.rifa_ganadores (
  id      bigint generated always as identity primary key,
  cedula  text not null,
  nombre  text,
  premio  text,
  ronda   int,
  seed    text,
  nota    text,
  fecha   timestamptz default now()
);

-- Vista de saldos (acciones por participante) ─────────────────────────────────
create or replace view public.rifa_saldos as
select
  m.cedula, m.nombre, m.telefono, m.estado, m.fecha_registro,
  coalesce((select sum(r.acciones) from public.rifa_registros r where r.cedula = m.cedula), 0) as acciones,
  exists (select 1 from public.rifa_ganadores g where g.cedula = m.cedula) as ya_gano
from public.rifa_participantes m;

-- RLS: cerrado al público. RPC (security definer) y admin (service role). ─────
alter table public.rifa_config          enable row level security;
alter table public.rifa_participantes    enable row level security;
alter table public.rifa_registros        enable row level security;
alter table public.rifa_patrocinadores   enable row level security;
alter table public.rifa_ganadores        enable row level security;

-- ── RPC pública: consultar acciones ──────────────────────────────────────────
create or replace function public.rifa_consultar_acciones(p_cedula text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare v record;
begin
  select * into v from rifa_saldos where cedula = trim(p_cedula);
  if not found then
    return jsonb_build_object('encontrado', false);
  end if;
  return jsonb_build_object(
    'encontrado', true, 'nombre', v.nombre,
    'acciones', v.acciones, 'ya_gano', v.ya_gano);
end;
$$;

-- ── RPC pública: registrar factura y acreditar acciones ──────────────────────
create or replace function public.rifa_registrar_factura(
  p_cedula text, p_nombre text, p_telefono text, p_ult_factura text, p_monto numeric)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_ced        text := trim(p_cedula);
  v_dig        int;
  v_tol        numeric;
  v_col_accion numeric;
  v_mult_pat   numeric;
  v_mult_web   numeric;
  v_vend_web   text;
  v_corte      text;
  v_activa     text;
  v_factura    text;
  v_monto_real numeric;
  v_vendedor   text;
  v_base       numeric;
  v_mult       numeric;
  v_acciones   numeric;
  v_patroc     boolean := false;
  v_patroc_prod boolean := false;
  v_credix     boolean := false;
  v_web        boolean := false;
  v_provs      jsonb;
  v_solo_dig   text := regexp_replace(coalesce(p_ult_factura,''), '\D', '', 'g');
begin
  if v_ced is null or length(v_ced) < 5 then
    return jsonb_build_object('ok', false, 'error', 'Cédula inválida.');
  end if;
  if v_solo_dig = '' or p_monto is null or p_monto <= 0 then
    return jsonb_build_object('ok', false, 'error', 'Faltan datos de la factura o el monto.');
  end if;

  select valor into v_activa     from rifa_config where clave='activa';
  if coalesce(v_activa,'true') <> 'true' then
    return jsonb_build_object('ok', false, 'error', 'La rifa no está activa en este momento.');
  end if;

  select valor::int     into v_dig        from rifa_config where clave='digitos_factura';
  select valor::numeric into v_tol        from rifa_config where clave='tolerancia_monto_pct';
  select valor::numeric into v_col_accion from rifa_config where clave='colones_por_accion';
  select valor::numeric into v_mult_pat   from rifa_config where clave='bono_patrocinador_mult';
  select valor::numeric into v_mult_web   from rifa_config where clave='bono_web_mult';
  select valor          into v_vend_web   from rifa_config where clave='vendedor_web';
  select valor          into v_corte      from rifa_config where clave='fecha_corte';

  if coalesce(v_corte,'') <> '' and now() > v_corte::timestamptz then
    return jsonb_build_object('ok', false, 'error', 'El período para acumular acciones ya cerró.');
  end if;

  -- Resolver la factura completa por dígitos + monto (más cercana dentro de tolerancia)
  with lineas as (
    select distinct on (f.factura, f.codigo_interno, f.fecha_real, f.cantidad_facturada, f.cantidad_devuelta)
      f.factura, f.total
    from neo_items_facturados f
    where right(f.factura, v_dig) = right(v_solo_dig, v_dig)
  ),
  totales as (select factura, sum(total) as total_factura from lineas group by factura)
  select factura, total_factura into v_factura, v_monto_real
  from totales
  where abs(total_factura - p_monto) <= greatest(p_monto * v_tol/100.0, 3000)
  order by abs(total_factura - p_monto) asc
  limit 1;

  if v_factura is null then
    return jsonb_build_object('ok', false,
      'error', 'No encontramos una factura con esos dígitos y ese monto. Revisá el número y el total. Recordá que puede tardar hasta 1 hora en aparecer.');
  end if;

  if exists (select 1 from rifa_registros where factura = v_factura) then
    return jsonb_build_object('ok', false, 'error', 'Esta factura ya fue registrada anteriormente.');
  end if;

  -- Base de acciones por monto
  v_base := floor(v_monto_real / nullif(v_col_accion,0));
  if coalesce(v_base,0) < 1 then
    return jsonb_build_object('ok', false,
      'error', 'El monto de la factura no alcanza el mínimo para una acción (₡'||v_col_accion||').');
  end if;

  -- ¿Producto de proveedor patrocinador? (mapea codigo_interno → proveedor)
  select
    exists (
      select 1
      from neo_items_facturados f
      join lateral (
        select trim(proveedor) as prov from neo_lista_items       where codigo_interno = f.codigo_interno
        union
        select trim(proveedor) as prov from neo_inventario_proveedor where codigo_interno = f.codigo_interno
      ) pv on true
      join rifa_patrocinadores rp
        on rp.activo and rp.neo_proveedor is not null and trim(rp.neo_proveedor) = pv.prov
      where f.factura = v_factura
    ),
    coalesce((
      select jsonb_agg(distinct rp.nombre)
      from neo_items_facturados f
      join lateral (
        select trim(proveedor) as prov from neo_lista_items       where codigo_interno = f.codigo_interno
        union
        select trim(proveedor) as prov from neo_inventario_proveedor where codigo_interno = f.codigo_interno
      ) pv on true
      join rifa_patrocinadores rp
        on rp.activo and rp.neo_proveedor is not null and trim(rp.neo_proveedor) = pv.prov
      where f.factura = v_factura
    ), '[]'::jsonb)
  into v_patroc_prod, v_provs;

  -- ¿Pago Credix? (observaciones de la factura) — solo si Credix está activo
  if exists (select 1 from rifa_patrocinadores where activo and detecta_credix) then
    v_credix := coalesce((
      select bool_or(observaciones ilike '%credix%')
      from neo_consolidado_facturas where factura = v_factura), false);
  end if;

  -- ¿Venta web? (vendedor = vendedor_web)
  select bool_or(trim(f.vendedor) = trim(v_vend_web)), max(f.vendedor)
  into v_web, v_vendedor
  from neo_items_facturados f where f.factura = v_factura;
  v_web := coalesce(v_web, false);

  v_patroc := v_patroc_prod or v_credix;

  -- Multiplicador: gana el mayor aplicable
  v_mult := greatest(
    1,
    case when v_web    then coalesce(v_mult_web,1) else 1 end,
    case when v_patroc then coalesce(v_mult_pat,1) else 1 end);

  v_acciones := v_base * v_mult;

  -- Alta/actualización del participante
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
     jsonb_build_object(
       'base', v_base, 'monto_real', v_monto_real, 'colones_por_accion', v_col_accion,
       'multiplicador', v_mult, 'patrocinador', v_patroc, 'patrocinador_por', v_provs,
       'credix', v_credix, 'web', v_web, 'vendedor', v_vendedor));

  return jsonb_build_object(
    'ok', true,
    'acciones_ganadas', v_acciones,
    'base', v_base,
    'multiplicador', v_mult,
    'patrocinador', v_patroc,
    'es_web', v_web,
    'saldo', (select acciones from rifa_saldos where cedula = v_ced));
end;
$$;

-- Permisos: las RPC públicas se llaman con la anon key desde /rifa
grant execute on function public.rifa_consultar_acciones(text) to anon, authenticated;
grant execute on function public.rifa_registrar_factura(text, text, text, text, numeric) to anon, authenticated;
