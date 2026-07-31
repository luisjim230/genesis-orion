-- ============================================================================
-- Panel de Incomodidad · fix de rendimiento (statement timeout)
-- ----------------------------------------------------------------------------
-- incomodidad_gasto_fijo / _cuentas_detectadas / _perdidas_inv_mensual hacían
-- seq scan de neo_movimientos_contables (602K filas) con un cast fecha::timestamp
-- no-sargable → ~7s, por encima del statement_timeout del rol anon.
--
-- Solución: materializar el neto mensual por cuenta contable (pocas cuentas ×
-- ~18 meses = miles de filas) y reconstruir esas 3 vistas sobre la MV. La MV se
-- refresca en cada sync junto a incomodidad_mv_sku.
-- ============================================================================

drop materialized view if exists incomodidad_mv_cuentas_mes cascade;
create materialized view incomodidad_mv_cuentas_mes as
select
   cuenta_contable,
   date_trunc('month', fecha::timestamp)::date                              as mes,
   sum(coalesce(debe_contabilidad,0) - coalesce(haber_contabilidad,0))      as neto
from neo_movimientos_contables
where coalesce(observaciones_asiento,'') not ilike '%Periodo Fiscal%'
  and fecha is not null
group by 1, 2;

create unique index if not exists incomodidad_mv_cuentas_mes_pk
  on incomodidad_mv_cuentas_mes (cuenta_contable, mes);

-- refresh_incomodidad_mv_sku ahora refresca AMBAS MV (sku + cuentas_mes).
-- El dispatcher trigger_refresh_all_on_sync ya llama a esta función.
create or replace function public.refresh_incomodidad_mv_sku()
returns void language plpgsql security definer set statement_timeout to 0 as $$
begin
  begin refresh materialized view concurrently incomodidad_mv_sku;
  exception when others then refresh materialized view incomodidad_mv_sku; end;
  begin refresh materialized view concurrently incomodidad_mv_cuentas_mes;
  exception when others then refresh materialized view incomodidad_mv_cuentas_mes; end;
end $$;

-- ── Vistas reconstruidas sobre la MV mensual ─────────────────────────────────
create or replace view incomodidad_cuentas_detectadas as
with rango as (
  select (date_trunc('month', current_date) - interval '12 months')::date as d12,
          date_trunc('month', current_date)::date                          as dfin
),
mov as (
  select m.cuenta_contable,
     sum(m.neto)  as neto,
     count(*)     as meses
  from incomodidad_mv_cuentas_mes m, rango
  where m.cuenta_contable ~ '^(70-30|70-80|77-|90-)'
    and m.mes >= rango.d12 and m.mes < rango.dfin
  group by m.cuenta_contable
)
select
   m.cuenta_contable,
   round(m.neto / 12)          as avg_mes,
   m.meses,
   coalesce(c.incluir, false)  as incluir,
   coalesce(c.es_fijo, false)  as es_fijo,
   (c.cuenta_contable is null) as sin_clasificar
from mov m
left join incomodidad_cuentas_gasto c on c.cuenta_contable = m.cuenta_contable
order by m.cuenta_contable;

create or replace view incomodidad_gasto_fijo as
with rango as (
  select  date_trunc('month', current_date)::date                          as dfin,
         (date_trunc('month', current_date) - interval '12 months')::date  as d12,
         (date_trunc('month', current_date) - interval '3 months')::date   as d3
),
incl as (select cuenta_contable from incomodidad_cuentas_gasto where incluir),
base12 as (
  select coalesce(sum(m.neto),0) / 12.0 as v
  from incomodidad_mv_cuentas_mes m, rango
  where m.cuenta_contable in (select cuenta_contable from incl)
    and m.mes >= rango.d12 and m.mes < rango.dfin
),
base3 as (
  select coalesce(sum(m.neto),0) / 3.0 as v
  from incomodidad_mv_cuentas_mes m, rango
  where m.cuenta_contable in (select cuenta_contable from incl)
    and m.mes >= rango.d3 and m.mes < rango.dfin
),
nuevos as (
  select coalesce(sum(
      g.monto_mensual * greatest(0,
        12 - ( extract(year  from age(date_trunc('month',current_date), date_trunc('month',g.fecha_inicio)))*12
             + extract(month from age(date_trunc('month',current_date), date_trunc('month',g.fecha_inicio))) )
      ) / 12.0
  ),0) as ajuste
  from incomodidad_gastos_nuevos g
  where g.activo and g.fecha_inicio <= current_date
)
select round(base12.v) as base_12m, round(base3.v) as base_3m,
   round(nuevos.ajuste) as ajuste_nuevos,
   round(base12.v + nuevos.ajuste) as gasto_fijo_auto,
   round(coalesce((select costos_fijos_override from incomodidad_config where id=1), base12.v + nuevos.ajuste)) as gasto_fijo_final,
   (base3.v > base12.v * 1.10) as crecimiento
from base12, base3, nuevos;

create or replace view incomodidad_perdidas_inv_mensual as
with rango as (
  select (date_trunc('month', current_date) - interval '11 months')::date as d0
)
select
   to_char(m.mes, 'YYYY-MM') as mes,
   round(sum(m.neto) filter (where m.cuenta_contable ~ '^77-10-01')) as mermas,
   round(sum(m.neto) filter (where m.cuenta_contable ~ '^77-10-02')) as autoconsumo,
   round(sum(m.neto) filter (where m.cuenta_contable ~ '^77-10-03')) as diferencias,
   round(sum(m.neto)) as total
from incomodidad_mv_cuentas_mes m, rango
where m.cuenta_contable ~ '^77-10-0[123]'
  and m.mes >= rango.d0
group by m.mes
order by m.mes;

grant select on incomodidad_mv_cuentas_mes       to anon, authenticated;
grant select on incomodidad_cuentas_detectadas   to anon, authenticated;
grant select on incomodidad_gasto_fijo           to anon, authenticated;
grant select on incomodidad_perdidas_inv_mensual to anon, authenticated;
