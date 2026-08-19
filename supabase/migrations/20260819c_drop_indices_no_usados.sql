-- Disk IO (escritura): neo_items_facturados recibe ~570 lotes de upsert por día
-- desde el sync de NEO. Cada índice extra se reescribe en cada uno de esos
-- upserts. Estos dos no los usa nadie (pg_stat_user_indexes, 5,5 meses de
-- estadísticas desde el 2026-03-05):
--
--   idx_facturados_fecha_codigo    31 scans · 24 MB  → redundante con
--                                  idx_facturados_fecha (13.666 scans)
--   idx_facturados_right5_factura   2 scans · 9 MB   → no lo referencia ni la
--                                  app ni ninguna función/vista de la base
--
-- Se conservan los trigram (item / codigo_interno): los usa la búsqueda de
-- productos de Comercial y Pricing con ilike '%...%'; sin ellos esa búsqueda
-- pasaría a barrer la tabla entera.
DROP INDEX IF EXISTS public.idx_facturados_fecha_codigo;
DROP INDEX IF EXISTS public.idx_facturados_right5_factura;
