-- ============================================================================
-- Panel de Incomodidad · KPI1 no marca "muerto" lo que se recompró recién
-- ----------------------------------------------------------------------------
-- Un producto viejo que no rotaba pero que el dueño RECOMPRA hoy es una apuesta
-- fresca, no capital muerto. Antes sólo se miraba la fecha de nacimiento; ahora
-- si el SKU tiene una compra en los últimos 60 días NO se clasifica como
-- muerto/lento/observación (cae a "vivo"). "Maduración" queda sólo para
-- productos genuinamente nuevos (edad <= 60d). Los realmente muertos (sin venta
-- >180d Y sin recompra >60d) siguen marcados.
-- ============================================================================

create or replace view incomodidad_capital_muerto as
with x as (
  select
     l.codigo_interno as codigo,
     coalesce(nullif(trim(l.descripcion),''), l.item) as descripcion,
     nullif(trim(l.proveedor),'') as proveedor,
     l.existencias as existencia,
     l.costo_sin_imp,
     round(l.existencias * l.costo_sin_imp) as capital,
     least(
        s.nacimiento,
        case when l.fecha_registro ~ '^\d{4}-\d{2}-\d{2}' then left(l.fecha_registro,10)::date end,
        case when l.ultima_compra  ~ '^\d{4}-\d{2}-\d{2}' then left(l.ultima_compra,10)::date  end
     ) as nacimiento,
     case when l.ultima_compra ~ '^\d{4}-\d{2}-\d{2}' then left(l.ultima_compra,10)::date end as ult_compra,
     greatest(
        s.ult_venta,
        case when l.ultima_venta ~ '^\d{4}-\d{2}-\d{2}' then left(l.ultima_venta,10)::date end
     ) as ult_venta
  from neo_lista_items l
  left join incomodidad_mv_sku s on s.codigo_interno = l.codigo_interno
  where coalesce(l.existencias,0) > 0 and coalesce(l.costo_sin_imp,0) > 0
),
y as (
  select x.codigo, x.descripcion, x.proveedor, x.existencia, x.costo_sin_imp, x.capital,
     x.nacimiento, x.ult_venta,
     (x.nacimiento is not null) as edad_confiable,
     case when x.nacimiento is not null then (current_date - x.nacimiento) else 9999 end as edad_dias,
     case when x.ult_venta is not null then (current_date - x.ult_venta)
          when x.nacimiento is not null then (current_date - x.nacimiento)
          else 9999 end as dias_sin_venta,
     case when x.ult_compra is not null then (current_date - x.ult_compra) else 99999 end as dias_desde_compra
  from x
)
select y.codigo, y.descripcion, y.proveedor, y.existencia, y.costo_sin_imp, y.capital,
   y.nacimiento, y.edad_confiable, y.ult_venta, y.edad_dias, y.dias_sin_venta,
   round(least(1.0, y.dias_sin_venta::numeric / nullif(y.edad_dias,0)), 3) as pct_vida_sin_vender,
   case
     when y.edad_confiable and y.edad_dias <= 60 then 'recien_nacido'
     when y.dias_desde_compra <= 60 then 'vivo'            -- recompra reciente = apuesta fresca
     when y.edad_dias between 61 and 120 and y.dias_sin_venta >= 60 then 'observacion'
     when y.edad_dias > 120 and y.dias_sin_venta between 121 and 180 then 'lento'
     when y.edad_dias > 180 and y.dias_sin_venta > 180 then 'muerto'
     else 'vivo'
   end as estado
from y;

grant select on incomodidad_capital_muerto to anon, authenticated;
