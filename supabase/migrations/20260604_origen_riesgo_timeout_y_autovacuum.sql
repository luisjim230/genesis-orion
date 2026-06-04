-- ============================================================
-- Migración: Origen → arreglar "canceling statement due to statement timeout"
-- Fecha: 2026-06-04
-- ============================================================
-- sol_riesgo_quiebre tarda ~6s y, bajo carga (durante los syncs), se pasaba
-- del statement_timeout del rol (anon) y PostgREST devolvía el error. Las
-- funciones de Pricing (pricing_dataset/_json) ya traían SET statement_timeout
-- = 60s; las de Origen no. Se les agrega el mismo margen.
--
-- Causa de la lentitud: neo_items_facturados se reescribe a diario (el sync
-- borra+reinserta el mes abierto), dejando la visibility map desactualizada
-- → el Index Only Scan hacía decenas de miles de heap fetches (~5.8s). Un
-- VACUUM lo bajó a ~1.9s. Para que se mantenga, se afina el autovacuum de esa
-- tabla para que corra más seguido.
-- ============================================================

ALTER FUNCTION public.sol_riesgo_quiebre(numeric, integer, text) SET statement_timeout = '60s';
ALTER FUNCTION public.sol_analisis_origen(integer) SET statement_timeout = '60s';

-- Mantener fresca la visibility map de la tabla que más se reescribe.
ALTER TABLE public.neo_items_facturados SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.05
);
