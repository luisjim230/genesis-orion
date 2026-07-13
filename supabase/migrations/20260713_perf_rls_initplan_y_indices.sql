-- ============================================================
-- Limpieza de rendimiento de la base (avisos del linter de Supabase)
-- Fecha: 2026-07-13
-- ============================================================
-- No cambia el freezing (eso ya se arregló en 20260713_refresh_sin_bloquear_lecturas)
-- ni el acceso de nadie: son optimizaciones puras.
--
-- A) auth_rls_initplan (20 policies): auth.role()/auth.uid() se re-evaluaba una
--    vez POR FILA. Envolverlo en (select ...) hace que Postgres lo calcule UNA
--    sola vez por query (initplan). Mismo resultado, mismo acceso, más rápido en
--    escaneos grandes. Ref: supabase.com/docs/guides/database/postgres/row-level-security#call-functions-with-select
-- B) unindexed_foreign_keys (7): índice de cobertura en la columna de cada FK.
-- C) duplicate_index (1 seguro): idx_hermes_items_proforma_fast es idéntico a
--    idx_hermes_items_proforma y no respalda ninguna constraint. Los otros
--    duplicados (meta_insights_daily, social_metricas) respaldan constraints
--    UNIQUE: se dejan (el ahorro es nulo y tocarlos podría romper upserts).
-- ============================================================

-- ── A) Envolver auth.*() en (select ...) — no cambia el acceso ───────────────
ALTER POLICY ga4_cache_select        ON public.ga4_metrics_cache     USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY ga4_cache_service       ON public.ga4_metrics_cache     USING ((select auth.role()) = 'service_role'::text)  WITH CHECK ((select auth.role()) = 'service_role'::text);
ALTER POLICY "usuario lee su perfil" ON public.genesis_usuarios      USING ((select auth.uid())  = user_id);
ALTER POLICY internal_devices_select ON public.internal_team_devices USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY internal_devices_service ON public.internal_team_devices USING ((select auth.role()) = 'service_role'::text) WITH CHECK ((select auth.role()) = 'service_role'::text);
ALTER POLICY internal_devices_update ON public.internal_team_devices USING ((select auth.role()) = 'authenticated'::text) WITH CHECK ((select auth.role()) = 'authenticated'::text);
ALTER POLICY pricing_alertas_select  ON public.pricing_alertas_log    USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY pricing_alertas_service ON public.pricing_alertas_log    USING ((select auth.role()) = 'service_role'::text)  WITH CHECK ((select auth.role()) = 'service_role'::text);
ALTER POLICY pricing_thresholds_all  ON public.pricing_thresholds_skus USING (((select auth.role()) = 'authenticated'::text) OR ((select auth.role()) = 'service_role'::text)) WITH CHECK (((select auth.role()) = 'authenticated'::text) OR ((select auth.role()) = 'service_role'::text));
ALTER POLICY short_links_insert      ON public.short_links            WITH CHECK ((select auth.role()) = 'authenticated'::text);
ALTER POLICY short_links_select      ON public.short_links            USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY short_links_service     ON public.short_links            USING ((select auth.role()) = 'service_role'::text)  WITH CHECK ((select auth.role()) = 'service_role'::text);
ALTER POLICY tlc_partidas_admin      ON public.tlc_china_partidas     USING ((select auth.role()) = 'service_role'::text)  WITH CHECK ((select auth.role()) = 'service_role'::text);
ALTER POLICY utm_campaigns_insert    ON public.utm_campaigns          WITH CHECK ((select auth.role()) = 'authenticated'::text);
ALTER POLICY utm_campaigns_select    ON public.utm_campaigns          USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY utm_campaigns_service   ON public.utm_campaigns          USING ((select auth.role()) = 'service_role'::text)  WITH CHECK ((select auth.role()) = 'service_role'::text);
ALTER POLICY utm_campaigns_update    ON public.utm_campaigns          USING ((select auth.role()) = 'authenticated'::text) WITH CHECK ((select auth.role()) = 'authenticated'::text);
ALTER POLICY utm_links_history_insert  ON public.utm_links_history    WITH CHECK ((select auth.role()) = 'authenticated'::text);
ALTER POLICY utm_links_history_select  ON public.utm_links_history    USING ((select auth.role()) = 'authenticated'::text);
ALTER POLICY utm_links_history_service ON public.utm_links_history    USING ((select auth.role()) = 'service_role'::text)  WITH CHECK ((select auth.role()) = 'service_role'::text);

-- ── B) Índices de cobertura para las 7 FK sin índice ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_cp_alertas_factura_id            ON public.cp_alertas(factura_id);
CREATE INDEX IF NOT EXISTS idx_cp_facturas_archivo_id           ON public.cp_facturas(archivo_id);
CREATE INDEX IF NOT EXISTS idx_cp_pagos_comprobante_archivo_id  ON public.cp_pagos(comprobante_archivo_id);
CREATE INDEX IF NOT EXISTS idx_encomiendas_zonas_empresa_id     ON public.encomiendas_zonas(empresa_id);
CREATE INDEX IF NOT EXISTS idx_genesis_usuarios_user_id         ON public.genesis_usuarios(user_id);
CREATE INDEX IF NOT EXISTS idx_meta_adsets_campaign_id          ON public.meta_adsets(campaign_id);
CREATE INDEX IF NOT EXISTS idx_profecias_aprobaciones_orden_compra_id ON public.profecias_aprobaciones(orden_compra_id);

-- ── C) Índice duplicado seguro (no unique, sin constraint) ───────────────────
DROP INDEX IF EXISTS public.idx_hermes_items_proforma_fast;
