-- ============================================================================
-- Módulo: Panel de Incomodidad  (prefijo incomodidad_)
-- ----------------------------------------------------------------------------
-- KPIs que el dueño revisa cada mañana. Toda la lógica pesada vive en SQL;
-- el frontend (/incomodidad) sólo lee vistas.
--
-- KPI 1  Capital muerto (con edad del producto)          -> incomodidad_capital_muerto(+_resumen)
-- KPI 2  GMROI por proveedor y global                    -> incomodidad_gmroi
-- KPI 3  Ventas perdidas por quiebre                      -> incomodidad_ventas_perdidas
-- KPI 4  Cohortes de ingreso (sell-through)              -> incomodidad_cohortes
-- KPI 5  Punto de equilibrio del mes en vivo             -> incomodidad_equilibrio(+_gasto_fijo/_detalle)
-- KPI 6  Pérdidas de inventario                          -> incomodidad_perdidas_inv_mensual(+_resumen)
--
-- Reglas de datos aplicadas (verificadas contra datos reales, jul-2026):
--   * neo_items_facturados: dedup DISTINCT ON (factura, codigo_interno,
--     fecha_real, cantidad_facturada, cantidad_devuelta); SIEMPRE fecha_real.
--   * neo_lista_items: un solo snapshot vigente por codigo_interno.
--   * neo_minimos_maximos: activo='Sí'.
--   * neo_movimientos_contables: EXCLUIR asientos de cierre fiscal
--     (observaciones_asiento ILIKE '%Periodo Fiscal%'); gasto = debe - haber.
--   * Fecha de nacimiento del SKU = LEAST(MIN(fecha_real) facturado,
--     MIN(fecha_dt) compra). Los SKU cuyo nacimiento coincide con la fecha
--     más antigua de la base son "veteranos" (edad_confiable = false).
--
-- El cálculo por SKU (766K líneas facturadas) se materializa en
-- incomodidad_mv_sku y se refresca junto al resto de vistas en cada sync.
-- ============================================================================

-- ── Tablas de configuración (editables desde la pantalla del módulo) ─────────
create table if not exists incomodidad_config (
  id                    int primary key default 1,
  margen_bruto_objetivo numeric not null default 0.38,
  costos_fijos_override  numeric,               -- si tiene valor, gana sobre el automático
  updated_at            timestamptz not null default now(),
  constraint incomodidad_config_singleton check (id = 1)
);
insert into incomodidad_config (id) values (1) on conflict (id) do nothing;

create table if not exists incomodidad_cuentas_gasto (
  cuenta_contable text primary key,
  incluir         boolean not null default true,
  es_fijo         boolean not null default true,
  nota            text,
  updated_at      timestamptz not null default now()
);

create table if not exists incomodidad_gastos_nuevos (
  id            bigserial primary key,
  concepto      text not null,
  monto_mensual numeric not null,
  fecha_inicio  date not null,
  activo        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Semilla de gastos nuevos recurrentes (ajuste auto-extinguible desde jul-2026)
insert into incomodidad_gastos_nuevos (concepto, monto_mensual, fecha_inicio)
select * from (values
  ('Dietas junta directiva',                     2000000::numeric, date '2026-07-01'),
  ('Alquiler adicional partes relacionadas',     2000000::numeric, date '2026-07-01'),
  ('Aumentos salariales familiares (con cargas)', 3795000::numeric, date '2026-07-01')
) v(concepto, monto_mensual, fecha_inicio)
where not exists (select 1 from incomodidad_gastos_nuevos);

-- Semilla de clasificación de cuentas (decisión ya tomada; reversible en la UI).
-- INCLUIR: 70-30-* (planilla, alquileres, servicios, seguros, marchamos,
--   viáticos, mant. propiedades/vehículos, encomiendas, publicidad),
--   70-80-* (depreciación), 90-* (intereses/comisiones/leasing).
-- EXCLUIR: renta (70-30-31), insumos/fertilizantes (70-30-36), alimentos
--   animales (70-30-40-01), multas (70-30-45-11) y todo 77-* (pérdidas de
--   inventario -> KPI 6).
insert into incomodidad_cuentas_gasto (cuenta_contable, incluir, es_fijo)
select distinct cuenta_contable,
   case
     when cuenta_contable ~ '^70-30-31( |$)'    then false
     when cuenta_contable ~ '^70-30-36( |$)'    then false
     when cuenta_contable ~ '^70-30-40-01( |$)' then false
     when cuenta_contable ~ '^70-30-45-11( |$)' then false
     when cuenta_contable ~ '^77-'              then false
     when cuenta_contable ~ '^(70-30|70-80|90-)' then true
     else false
   end,
   case
     when cuenta_contable ~ '^70-30-31( |$)'    then false
     when cuenta_contable ~ '^70-30-36( |$)'    then false
     when cuenta_contable ~ '^70-30-40-01( |$)' then false
     when cuenta_contable ~ '^70-30-45-11( |$)' then false
     when cuenta_contable ~ '^77-'              then false
     when cuenta_contable ~ '^(70-30|70-80|90-)' then true
     else false
   end
from neo_movimientos_contables
where cuenta_contable ~ '^(70-30|70-80|77-|90-)'
on conflict (cuenta_contable) do nothing;

-- RLS: acceso de escritura sólo vía API route (service_role). Las vistas
-- (owner=postgres) leen estas tablas sin problema.
alter table incomodidad_config          enable row level security;
alter table incomodidad_cuentas_gasto   enable row level security;
alter table incomodidad_gastos_nuevos   enable row level security;

-- ── Materialized view por SKU (base de los KPI 1, 2, 3, 4) ───────────────────
drop materialized view if exists incomodidad_mv_sku cascade;
create materialized view incomodidad_mv_sku as
with ded as materialized (
  select distinct on (factura, codigo_interno, fecha_real, cantidad_facturada, cantidad_devuelta)
     codigo_interno,
     fecha_real,
     coalesce(cantidad_facturada,0) - coalesce(cantidad_devuelta,0)                       as qn,
     coalesce(precio_unitario,0)                                                          as pu,
     coalesce(precio_unitario,0) - coalesce(costo_unitario,0)                             as margen_u
  from neo_items_facturados
  where codigo_interno is not null and fecha_real is not null
),
gmin as (select min(fecha_real) as g from ded),
compras_nac as (
  select codigo_interno, min(fecha_dt) as nac_compra
  from neo_compras_historico
  where codigo_interno is not null and fecha_dt is not null
  group by codigo_interno
),
base as (
  select d.codigo_interno,
     min(d.fecha_real)                                                          as nac_fact,
     max(d.fecha_real)                                                          as ult_venta,
     sum(d.qn)                                                                  as unidades_tot,
     sum(d.qn)            filter (where d.fecha_real >= current_date - 365)     as unidades_365,
     sum(d.qn * d.margen_u) filter (where d.fecha_real >= current_date - 365)   as ub_365,
     sum(d.qn * d.pu)     filter (where d.fecha_real >= current_date - 180)     as rev_180
  from ded d
  group by d.codigo_interno
),
nac as (
  select b.*,
     least(b.nac_fact, coalesce(c.nac_compra, b.nac_fact)) as nacimiento
  from base b
  left join compras_nac c using (codigo_interno)
),
win as (
  select d.codigo_interno,
     sum(d.qn) filter (where d.fecha_real <= n.nacimiento + 30) as unidades_30,
     sum(d.qn) filter (where d.fecha_real <= n.nacimiento + 60) as unidades_60,
     sum(d.qn) filter (where d.fecha_real <= n.nacimiento + 90) as unidades_90
  from ded d
  join nac n using (codigo_interno)
  group by d.codigo_interno
)
select
   n.codigo_interno,
   n.nacimiento,
   n.ult_venta,
   n.unidades_tot,
   coalesce(n.unidades_365,0) as unidades_365,
   coalesce(n.ub_365,0)       as ub_365,
   coalesce(n.rev_180,0)      as rev_180,
   coalesce(w.unidades_30,0)  as unidades_30,
   coalesce(w.unidades_60,0)  as unidades_60,
   coalesce(w.unidades_90,0)  as unidades_90,
   (n.nacimiento > (select g from gmin)) as edad_confiable
from nac n
left join win w using (codigo_interno)
with no data;

create unique index if not exists incomodidad_mv_sku_pk on incomodidad_mv_sku (codigo_interno);

-- Función de refresco (statement_timeout 0: la dedup sobre 766K líneas tarda ~1 min)
create or replace function public.refresh_incomodidad_mv_sku()
returns void
language plpgsql
security definer
set statement_timeout to 0
as $$
begin
  begin
    refresh materialized view concurrently incomodidad_mv_sku;
  exception when others then
    refresh materialized view incomodidad_mv_sku;
  end;
end $$;

-- ── KPI 1 · Capital muerto por SKU ───────────────────────────────────────────
-- Sólo SKU con existencia > 0 y capital > 0. Un producto NO puede ser "muerto"
-- si acaba de nacer (edad <= 60 y edad_confiable => 🟢 recién nacido).
create or replace view incomodidad_capital_muerto as
with x as (
  select
     l.codigo_interno                                              as codigo,
     coalesce(nullif(trim(l.descripcion),''), l.item)              as descripcion,
     nullif(trim(l.proveedor),'')                                  as proveedor,
     l.existencias                                                 as existencia,
     l.costo_sin_imp,
     round(l.existencias * l.costo_sin_imp)                        as capital,
     s.nacimiento,
     coalesce(s.edad_confiable, false)                             as edad_confiable,
     s.ult_venta,
     case when s.nacimiento is not null then (current_date - s.nacimiento)
          else 9999 end                                           as edad_dias,
     case when s.ult_venta is not null then (current_date - s.ult_venta)
          when s.nacimiento is not null then (current_date - s.nacimiento)
          else 9999 end                                           as dias_sin_venta
  from neo_lista_items l
  left join incomodidad_mv_sku s on s.codigo_interno = l.codigo_interno
  where coalesce(l.existencias,0) > 0 and coalesce(l.costo_sin_imp,0) > 0
)
select x.*,
   round(least(1.0, x.dias_sin_venta::numeric / nullif(x.edad_dias,0)), 3) as pct_vida_sin_vender,
   case
     when x.edad_confiable and x.edad_dias <= 60                                    then 'recien_nacido'
     when x.edad_dias between 61 and 120 and x.dias_sin_venta >= 60                 then 'observacion'
     when x.edad_dias > 120 and x.dias_sin_venta between 121 and 180               then 'lento'
     when x.edad_dias > 180 and x.dias_sin_venta > 180                             then 'muerto'
     else 'vivo'
   end as estado
from x;

create or replace view incomodidad_capital_muerto_resumen as
select
   coalesce(sum(capital) filter (where estado = 'muerto'),        0) as capital_muerto,
   coalesce(sum(capital) filter (where estado = 'lento'),         0) as capital_lento,
   coalesce(sum(capital) filter (where estado = 'observacion'),   0) as capital_observacion,
   coalesce(sum(capital) filter (where estado = 'recien_nacido'), 0) as capital_maduracion,
   coalesce(sum(capital) filter (where estado = 'vivo'),          0) as capital_vivo,
   coalesce(sum(capital),                                         0) as capital_total,
   count(*) filter (where estado = 'muerto')        as n_muerto,
   count(*) filter (where estado = 'lento')         as n_lento,
   count(*) filter (where estado = 'observacion')   as n_observacion,
   count(*) filter (where estado = 'recien_nacido') as n_maduracion
from incomodidad_capital_muerto;

-- ── KPI 2 · GMROI por proveedor y global ─────────────────────────────────────
create or replace view incomodidad_gmroi as
with base as (
  select
     coalesce(nullif(trim(l.proveedor),''), '(Sin proveedor)') as proveedor,
     sum(coalesce(s.ub_365,0))                                 as ub_365,
     sum(case when coalesce(l.existencias,0) > 0 and coalesce(l.costo_sin_imp,0) > 0
              then l.existencias * l.costo_sin_imp else 0 end) as inv_costo
  from neo_lista_items l
  left join incomodidad_mv_sku s on s.codigo_interno = l.codigo_interno
  group by 1
),
por_prov as (
  select proveedor, round(ub_365) as ub_365, round(inv_costo) as inv_costo,
     case when inv_costo > 0 then round((ub_365 / inv_costo)::numeric, 2) end as gmroi
  from base
  where inv_costo > 0 or ub_365 <> 0
),
global as (
  select '(GLOBAL)'::text as proveedor,
     round(sum(ub_365)) as ub_365, round(sum(inv_costo)) as inv_costo,
     case when sum(inv_costo) > 0 then round((sum(ub_365)/sum(inv_costo))::numeric, 2) end as gmroi
  from base
)
select *, false as es_global from por_prov
union all
select *, true  as es_global from global;

-- ── KPI 3 · Ventas perdidas por quiebre ──────────────────────────────────────
-- SKU activos con existencia = 0. Venta perdida = venta diaria promedio
-- (rev_180 / 180) × días transcurridos del mes (aproximación conservadora).
create or replace view incomodidad_ventas_perdidas as
select
   m.codigo,
   coalesce(nullif(trim(m.nombre),''), m.codigo)                     as descripcion,
   m.categoria,
   m.marca,
   round(coalesce(s.rev_180,0) / 180.0)                             as venta_diaria_prom,
   extract(day from current_date)::int                             as dias_cero_aprox,
   round((coalesce(s.rev_180,0) / 180.0) * extract(day from current_date)) as venta_perdida_est
from neo_minimos_maximos m
left join incomodidad_mv_sku s on s.codigo_interno = m.codigo
where m.activo = 'Sí' and coalesce(m.existencias,0) <= 0
order by venta_perdida_est desc nulls last;

-- ── KPI 4 · Cohortes de ingreso (sell-through por unidades) ──────────────────
create or replace view incomodidad_cohortes as
with sku as (
  select
     to_char(s.nacimiento, 'YYYY-MM')       as cohorte,
     s.unidades_30, s.unidades_60, s.unidades_90, s.unidades_tot,
     greatest(coalesce(l.existencias,0), 0) as existencia
  from incomodidad_mv_sku s
  left join neo_lista_items l on l.codigo_interno = s.codigo_interno
  where s.edad_confiable
    and s.nacimiento >= (date_trunc('month', current_date) - interval '12 months')::date
)
select
   cohorte,
   count(*)                                          as skus,
   round(100.0 * sum(unidades_30) / nullif(sum(unidades_tot + existencia),0), 1) as st30,
   round(100.0 * sum(unidades_60) / nullif(sum(unidades_tot + existencia),0), 1) as st60,
   round(100.0 * sum(unidades_90) / nullif(sum(unidades_tot + existencia),0), 1) as st90
from sku
group by cohorte
order by cohorte desc;

-- ── KPI 5 · Punto de equilibrio ──────────────────────────────────────────────
-- Cuentas de gasto detectadas (para la pantalla de configuración).
create or replace view incomodidad_cuentas_detectadas as
with rango as (
  select (date_trunc('month', current_date) - interval '12 months')::date as d12,
          date_trunc('month', current_date)::date                          as dfin
),
mov as (
  select v.cuenta_contable,
     sum(coalesce(v.debe_contabilidad,0) - coalesce(v.haber_contabilidad,0)) as neto,
     count(distinct to_char(v.fecha::timestamp, 'YYYY-MM'))                  as meses
  from neo_movimientos_contables v, rango
  where coalesce(v.observaciones_asiento,'') not ilike '%Periodo Fiscal%'
    and v.fecha::timestamp >= rango.d12 and v.fecha::timestamp < rango.dfin
    and v.cuenta_contable ~ '^(70-30|70-80|77-|90-)'
  group by v.cuenta_contable
)
select
   m.cuenta_contable,
   round(m.neto / 12)                        as avg_mes,
   m.meses,
   coalesce(c.incluir, false)                as incluir,
   coalesce(c.es_fijo, false)                as es_fijo,
   (c.cuenta_contable is null)               as sin_clasificar
from mov m
left join incomodidad_cuentas_gasto c on c.cuenta_contable = m.cuenta_contable
order by m.cuenta_contable;

-- Gasto fijo mensual: promedio móvil 12 meses de las cuentas incluidas +
-- ajuste auto-extinguible por gastos nuevos. base_3m para la alerta de
-- crecimiento (punto 3b del prompt).
create or replace view incomodidad_gasto_fijo as
with rango as (
  select  date_trunc('month', current_date)::date                          as dfin,
         (date_trunc('month', current_date) - interval '12 months')::date  as d12,
         (date_trunc('month', current_date) - interval '3 months')::date   as d3
),
incl as (select cuenta_contable from incomodidad_cuentas_gasto where incluir),
base12 as (
  select coalesce(sum(coalesce(v.debe_contabilidad,0) - coalesce(v.haber_contabilidad,0)),0) / 12.0 as v
  from neo_movimientos_contables v, rango
  where v.cuenta_contable in (select cuenta_contable from incl)
    and coalesce(v.observaciones_asiento,'') not ilike '%Periodo Fiscal%'
    and v.fecha::timestamp >= rango.d12 and v.fecha::timestamp < rango.dfin
),
base3 as (
  select coalesce(sum(coalesce(v.debe_contabilidad,0) - coalesce(v.haber_contabilidad,0)),0) / 3.0 as v
  from neo_movimientos_contables v, rango
  where v.cuenta_contable in (select cuenta_contable from incl)
    and coalesce(v.observaciones_asiento,'') not ilike '%Periodo Fiscal%'
    and v.fecha::timestamp >= rango.d3 and v.fecha::timestamp < rango.dfin
),
nuevos as (
  select coalesce(sum(
      g.monto_mensual * greatest(0,
        12 - ( extract(year  from age(date_trunc('month',current_date), date_trunc('month',g.fecha_inicio)))*12
             + extract(month from age(date_trunc('month',current_date), date_trunc('month',g.fecha_inicio))) )
      ) / 12.0
  ),0) as ajuste
  from incomodidad_gastos_nuevos g
  where g.activo and g.fecha_inicio <= current_date + interval '0 day'
)
select
   round(base12.v)                                             as base_12m,
   round(base3.v)                                              as base_3m,
   round(nuevos.ajuste)                                        as ajuste_nuevos,
   round(base12.v + nuevos.ajuste)                             as gasto_fijo_auto,
   round(coalesce((select costos_fijos_override from incomodidad_config where id=1),
                  base12.v + nuevos.ajuste))                   as gasto_fijo_final,
   (base3.v > base12.v * 1.10)                                 as crecimiento
from base12, base3, nuevos;

-- Desglose del gasto fijo por cuenta (top del detalle)
create or replace view incomodidad_gasto_detalle as
select cuenta_contable, avg_mes
from incomodidad_cuentas_detectadas
where incluir
order by avg_mes desc;

-- Equilibrio del mes en vivo
create or replace view incomodidad_equilibrio as
with gf as (select * from incomodidad_gasto_fijo),
cfg as (select coalesce(margen_bruto_objetivo, 0.38) as mbo from incomodidad_config where id=1),
ded as (
  select distinct on (factura, codigo_interno, fecha_real, cantidad_facturada, cantidad_devuelta)
     precio_unitario, cantidad_facturada, cantidad_devuelta
  from neo_items_facturados
  where fecha_real >= date_trunc('month', current_date)
),
ventas as (
  select coalesce(sum(precio_unitario * (coalesce(cantidad_facturada,0) - coalesce(cantidad_devuelta,0))),0) as venta_mes
  from ded
),
calc as (
  select
     gf.gasto_fijo_final,
     gf.base_12m, gf.base_3m, gf.ajuste_nuevos, gf.crecimiento,
     cfg.mbo                                                   as margen_bruto_objetivo,
     round(gf.gasto_fijo_final / nullif(cfg.mbo,0))            as equilibrio_ventas,
     round(ventas.venta_mes)                                  as venta_mes,
     extract(day from current_date)::int                      as dias_transcurridos,
     round(ventas.venta_mes / nullif(extract(day from current_date),0)) as promedio_diario
  from gf, cfg, ventas
)
select
   calc.*,
   round(100.0 * calc.venta_mes / nullif(calc.equilibrio_ventas,0), 1)      as pct_equilibrio,
   case when calc.promedio_diario > 0
        then ceil(calc.equilibrio_ventas::numeric / calc.promedio_diario)::int end as dia_cruce,
   round(calc.promedio_diario * extract(day from (date_trunc('month',current_date) + interval '1 month - 1 day'))) as proyeccion_mes
from calc;

-- ── KPI 6 · Pérdidas de inventario (77-10-01/02/03) ──────────────────────────
create or replace view incomodidad_perdidas_inv_mensual as
with rango as (
  select (date_trunc('month', current_date) - interval '11 months')::date as d0,
         (date_trunc('month', current_date) + interval '1 month')::date    as dfin
)
select
   to_char(v.fecha::timestamp, 'YYYY-MM') as mes,
   round(sum(case when v.cuenta_contable ~ '^77-10-01' then coalesce(v.debe_contabilidad,0)-coalesce(v.haber_contabilidad,0) else 0 end)) as mermas,
   round(sum(case when v.cuenta_contable ~ '^77-10-02' then coalesce(v.debe_contabilidad,0)-coalesce(v.haber_contabilidad,0) else 0 end)) as autoconsumo,
   round(sum(case when v.cuenta_contable ~ '^77-10-03' then coalesce(v.debe_contabilidad,0)-coalesce(v.haber_contabilidad,0) else 0 end)) as diferencias,
   round(sum(coalesce(v.debe_contabilidad,0)-coalesce(v.haber_contabilidad,0))) as total
from neo_movimientos_contables v, rango
where coalesce(v.observaciones_asiento,'') not ilike '%Periodo Fiscal%'
  and v.cuenta_contable ~ '^77-10-0[123]'
  and v.fecha::timestamp >= rango.d0 and v.fecha::timestamp < rango.dfin
group by 1
order by 1;

create or replace view incomodidad_perdidas_inv_resumen as
with s as (select * from incomodidad_perdidas_inv_mensual),
act as (select coalesce(total,0) as t from s where mes = to_char(current_date,'YYYY-MM')),
prev as (select avg(total) as p from s where mes <> to_char(current_date,'YYYY-MM'))
select
   coalesce((select t from act), 0)  as mes_actual,
   round(coalesce((select p from prev), 0)) as promedio_12m;

-- ── Meta (timestamp "datos al:") ─────────────────────────────────────────────
create or replace view incomodidad_meta as
select greatest(
   coalesce((select max(fecha_carga) from neo_lista_items),        'epoch'::timestamptz),
   coalesce((select max(fecha_carga) from neo_items_facturados),   'epoch'::timestamptz),
   coalesce((select max(fecha_carga) from neo_movimientos_contables),'epoch'::timestamptz)
) as datos_al;

-- ── Grants (lectura para el cliente anon del frontend) ───────────────────────
grant select on incomodidad_mv_sku                     to anon, authenticated;
grant select on incomodidad_capital_muerto             to anon, authenticated;
grant select on incomodidad_capital_muerto_resumen     to anon, authenticated;
grant select on incomodidad_gmroi                      to anon, authenticated;
grant select on incomodidad_ventas_perdidas            to anon, authenticated;
grant select on incomodidad_cohortes                   to anon, authenticated;
grant select on incomodidad_cuentas_detectadas         to anon, authenticated;
grant select on incomodidad_gasto_fijo                 to anon, authenticated;
grant select on incomodidad_gasto_detalle              to anon, authenticated;
grant select on incomodidad_equilibrio                 to anon, authenticated;
grant select on incomodidad_perdidas_inv_mensual       to anon, authenticated;
grant select on incomodidad_perdidas_inv_resumen       to anon, authenticated;
grant select on incomodidad_meta                       to anon, authenticated;

-- ── Hook en el dispatcher de refresco automático (cada sync) ─────────────────
-- Añade el refresco de incomodidad_mv_sku a la función que ya refresca el
-- resto de vistas derivadas cuando un downloader marca un sync exitoso.
create or replace function public.trigger_refresh_all_on_sync()
returns trigger
language plpgsql
security definer
as $$
declare
  last_ts timestamptz;
begin
  if new.exitoso is not true then return new; end if;
  if new.ultima_sync is not distinct from old.ultima_sync then return new; end if;

  select last_refresh into last_ts
    from public.mv_refresh_state
    where view_name = 'refresh_all_dispatcher'
    for update skip locked;

  if last_ts is null or now() - last_ts < interval '3 minutes' then
    return new;
  end if;

  update public.mv_refresh_state
    set last_refresh = now()
    where view_name = 'refresh_all_dispatcher';

  begin perform public.refresh_mv_consumo_mensual();
  exception when others then raise warning 'refresh_mv_consumo_mensual: %', sqlerrm; end;

  begin perform public.refresh_mv_items_por_vend_mes();
  exception when others then raise warning 'refresh_mv_items_por_vend_mes: %', sqlerrm; end;

  begin perform public.refresh_profecias_panel();
  exception when others then raise warning 'refresh_profecias_panel: %', sqlerrm; end;

  begin perform public.bi_recalcular_resumen();
  exception when others then raise warning 'bi_recalcular_resumen: %', sqlerrm; end;

  begin perform public.refresh_incomodidad_mv_sku();
  exception when others then raise warning 'refresh_incomodidad_mv_sku: %', sqlerrm; end;

  return new;
exception when others then
  raise warning 'trigger_refresh_all_on_sync: %', sqlerrm;
  return new;
end $$;

-- NOTA: la MV se puebla por primera vez fuera de esta migración
-- (select public.refresh_incomodidad_mv_sku();) porque la dedup sobre 766K
-- líneas tarda ~1 min y no debe bloquear el apply.
