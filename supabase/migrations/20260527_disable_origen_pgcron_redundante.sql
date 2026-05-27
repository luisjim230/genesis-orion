-- ============================================================
-- Desactiva el pg_cron `sol_refresh_derivados` (introducido en #115)
-- Fecha: 2026-05-27
-- ============================================================
-- Motivo: el job corría cada 5 minutos e intentaba
--   REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_items_por_vend_mes
-- que sobre neo_items_facturados (776k filas / 524 MB) tarda ~200s. En el
-- worker de pg_cron reventaba por statement timeout (~173s) y, mientras corría,
-- saturaba la instancia (chica) de Supabase: las demás consultas —incluido el
-- refresh de sesión que hace el middleware— se pasaban del statement_timeout de
-- 8-10s y la app entera respondía 504 (MIDDLEWARE_INVOCATION_TIMEOUT).
-- Además fallaba el 100% de las corridas ("job startup timeout"), así que en la
-- práctica no refrescaba nada.
--
-- El refresh diario de las 4 vistas derivadas ya lo hace el workflow
-- .github/workflows/refresh-all.yml (5am Costa Rica, fuera de horario laboral),
-- que ahora además avisa por Telegram si alguna falla. Por eso este job en-base
-- es redundante y se deja DESACTIVADO de forma permanente.
--
-- Para reactivarlo en el futuro (NO recomendado sin optimizar antes el refresh
-- de mv_items_por_vend_mes y sin un guard de no-solape), habría que volver a
-- programarlo con cron.schedule().
-- ============================================================

DO $$
BEGIN
  PERFORM cron.unschedule('sol_refresh_derivados');
EXCEPTION WHEN OTHERS THEN
  -- Ya estaba desprogramado: no hay nada que hacer.
  NULL;
END $$;
