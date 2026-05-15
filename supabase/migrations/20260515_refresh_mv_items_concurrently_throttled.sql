-- Refresh CONCURRENTLY + throttle de 5 min para refresh_mv_items_por_vend_mes.
-- Antes: REFRESH MATERIALIZED VIEW bloqueaba todas las lecturas ~2 min.
-- Si se acumulaban llamadas (downloader + frontend), el DB quedaba colgado.

CREATE UNIQUE INDEX IF NOT EXISTS mv_items_uniq_cod_vend_mes
  ON public.mv_items_por_vend_mes (codigo_interno, vendedor, mes);

CREATE TABLE IF NOT EXISTS public.mv_refresh_state (
  view_name text PRIMARY KEY,
  last_refresh timestamptz NOT NULL DEFAULT 'epoch'
);

INSERT INTO public.mv_refresh_state (view_name, last_refresh)
VALUES ('mv_items_por_vend_mes', 'epoch')
ON CONFLICT (view_name) DO NOTHING;

DROP FUNCTION IF EXISTS public.refresh_mv_items_por_vend_mes();

CREATE FUNCTION public.refresh_mv_items_por_vend_mes()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '0'
AS $function$
DECLARE
  last_ts timestamptz;
  got_lock boolean;
BEGIN
  SELECT last_refresh INTO last_ts
    FROM public.mv_refresh_state
    WHERE view_name = 'mv_items_por_vend_mes'
    FOR UPDATE SKIP LOCKED;

  IF last_ts IS NULL THEN
    RETURN 'skipped: ya hay un refresh en curso';
  END IF;

  IF now() - last_ts < interval '5 minutes' THEN
    RETURN 'skipped: refrescada hace ' || extract(epoch FROM (now() - last_ts))::int || 's';
  END IF;

  got_lock := pg_try_advisory_xact_lock(hashtext('refresh_mv_items_por_vend_mes'));
  IF NOT got_lock THEN
    RETURN 'skipped: otro refresh en curso';
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_items_por_vend_mes;

  UPDATE public.mv_refresh_state
    SET last_refresh = now()
    WHERE view_name = 'mv_items_por_vend_mes';

  RETURN 'refreshed';
END;
$function$;
