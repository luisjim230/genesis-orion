-- ============================================================================
-- Panel de Incomodidad · fix de correctitud (KPI 1 y KPI 3)
-- ----------------------------------------------------------------------------
-- BUG 1 (KPI1 Capital muerto): productos recién ingresados (nunca facturados,
--   fuera de incomodidad_mv_sku) se clasificaban como "muerto" con edad 9999.
--   Ej: mueble Y028-80 ingresó el 08-jul y salía como inventario muerto.
--   Causa: no se usaba la fecha de registro del producto. Ahora la fecha de
--   nacimiento = la más antigua conocida entre venta facturada, primera compra,
--   fecha_registro y ultima_compra de neo_lista_items. Además la última venta
--   toma el máximo entre facturas y el ultima_venta que reporta NEO (si NEO
--   registró una venta más reciente que las facturas sincronizadas, se respeta).
--
-- BUG 2 (KPI3 Ventas perdidas): "días en cero" mostraba el día del mes (10)
--   para TODOS los SKU por igual. Ahora se estima por SKU con los días desde la
--   última venta (tope 30), que varía producto por producto.
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
     -- nacimiento = la fecha más antigua conocida del SKU
     least(
        s.nacimiento,
        case when l.fecha_registro ~ '^\d{4}-\d{2}-\d{2}' then left(l.fecha_registro,10)::date end,
        case when l.ultima_compra  ~ '^\d{4}-\d{2}-\d{2}' then left(l.ultima_compra,10)::date  end
     ) as nacimiento,
     -- última venta = la evidencia más reciente (facturas o NEO)
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
     x.nacimiento,
     (x.nacimiento is not null) as edad_confiable,
     x.ult_venta,
     case when x.nacimiento is not null then (current_date - x.nacimiento) else 9999 end as edad_dias,
     case when x.ult_venta is not null then (current_date - x.ult_venta)
          when x.nacimiento is not null then (current_date - x.nacimiento)
          else 9999 end as dias_sin_venta
  from x
)
select y.codigo, y.descripcion, y.proveedor, y.existencia, y.costo_sin_imp, y.capital,
   y.nacimiento, y.edad_confiable, y.ult_venta, y.edad_dias, y.dias_sin_venta,
   round(least(1.0, y.dias_sin_venta::numeric / nullif(y.edad_dias,0)), 3) as pct_vida_sin_vender,
   case
     when y.edad_confiable and y.edad_dias <= 60 then 'recien_nacido'
     when y.edad_dias between 61 and 120 and y.dias_sin_venta >= 60 then 'observacion'
     when y.edad_dias > 120 and y.dias_sin_venta between 121 and 180 then 'lento'
     when y.edad_dias > 180 and y.dias_sin_venta > 180 then 'muerto'
     else 'vivo'
   end as estado
from y;

create or replace view incomodidad_ventas_perdidas as
with q as (
  select m.codigo,
     coalesce(nullif(trim(m.nombre),''), m.codigo) as descripcion,
     m.categoria, m.marca,
     coalesce(s.rev_180,0)/180.0 as venta_diaria,
     s.ult_venta
  from neo_minimos_maximos m
  left join incomodidad_mv_sku s on s.codigo_interno = m.codigo
  where m.activo='Sí' and coalesce(m.existencias,0) <= 0
)
select codigo, descripcion, categoria, marca,
   round(venta_diaria) as venta_diaria_prom,
   least(greatest((current_date - ult_venta), 0), 30) as dias_cero_aprox,
   round(venta_diaria * least(greatest((current_date - ult_venta), 0), 30)) as venta_perdida_est
from q
order by venta_perdida_est desc nulls last;

grant select on incomodidad_capital_muerto  to anon, authenticated;
grant select on incomodidad_ventas_perdidas to anon, authenticated;
