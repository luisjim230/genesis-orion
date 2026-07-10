-- ============================================================================
-- Panel de Incomodidad · fix statement timeout en incomodidad_meta
-- ----------------------------------------------------------------------------
-- incomodidad_meta hacía max(fecha_carga) sobre neo_items_facturados (766K) y
-- neo_movimientos_contables (602K). Bajo el rol anon (statement_timeout 10s)
-- esos max() sobre las tablas grandes tardaban >10s → 500, y como el frontend
-- carga todas las vistas con Promise.all, un solo timeout tumbaba el panel
-- entero ("No se pudieron cargar los datos. canceling statement due to
-- statement timeout").
--
-- El timestamp "datos al:" se saca ahora sólo de tablas chicas (neo_lista_items
-- y neo_minimos_maximos, 4326 filas c/u) que se sincronizan en cada carga.
-- ============================================================================

create or replace view incomodidad_meta as
select greatest(
   coalesce((select max(fecha_carga) from neo_lista_items),      'epoch'::timestamptz),
   coalesce((select max(fecha_carga) from neo_minimos_maximos),  'epoch'::timestamptz)
) as datos_al;

grant select on incomodidad_meta to anon, authenticated;
