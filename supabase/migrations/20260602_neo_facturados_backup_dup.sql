-- Respaldo COMPLETO de neo_items_facturados antes de limpiar los duplicados
-- acumulados por el sync (ver 20260602_neo_facturados_dedup_cleanup.sql).
--
-- Causa raíz: el job nocturno reinsertaba el mes abierto cada corrida. El
-- constraint único es (factura, codigo_interno, bodega); como `bodega` viene
-- NULL en muchas líneas y Postgres trata NULL como distinto en índices únicos,
-- el upsert no deduplicaba esas filas y se acumulaban decenas de copias por
-- período 'YYYY-MM' (mayo 2026: 90 cargas, +104%).
--
-- Este respaldo es una copia 1:1 de la tabla al momento de la limpieza. NO se
-- borra hasta que Luis confirme que todos los módulos siguen OK. Para revertir
-- la limpieza:
--   TRUNCATE public.neo_items_facturados;
--   INSERT INTO public.neo_items_facturados
--     SELECT * FROM public.neo_items_facturados_backup_20260602;

CREATE TABLE IF NOT EXISTS public.neo_items_facturados_backup_20260602 AS
SELECT * FROM public.neo_items_facturados;
