-- Índice por periodo_reporte para que el delete-before-insert del sync sea
-- instantáneo y confiable.
--
-- El sync idempotente (neo_items_facturados_downloader.py) hace
-- `DELETE FROM neo_items_facturados WHERE periodo_reporte = :periodo_abierto`
-- en cada corrida. Sin índice, ese DELETE escaneaba la tabla completa (~747k
-- filas) y se pasaba del statement_timeout (57014), salvándose recién en el
-- 3er reintento. Con este índice el borrado usa Index Scan (~1 ms) y no
-- depende de reintentos.
--
-- Aditivo y seguro: no modifica datos. CONCURRENTLY evita lockear escrituras
-- durante la creación.

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_facturados_periodo
  ON public.neo_items_facturados (periodo_reporte);
