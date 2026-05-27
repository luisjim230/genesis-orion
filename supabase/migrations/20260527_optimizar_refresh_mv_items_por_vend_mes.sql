-- ============================================================
-- Optimiza refresh_mv_items_por_vend_mes
-- Fecha: 2026-05-27
-- ============================================================
-- mv_items_por_vend_mes agrega ventas por (producto, vendedor, mes) sobre
-- neo_items_facturados (~776k filas). Su refresh tardaba 120-220s y era el que
-- más CPU clavaba durante el incidente.
--
-- Cambio: pasa de `REFRESH MATERIALIZED VIEW CONCURRENTLY` a `REFRESH` normal.
-- CONCURRENTLY hace el doble de trabajo (calcula todo + compara contra lo viejo
-- + aplica diferencias); el modo normal solo reconstruye → menos CPU y termina
-- antes. El job corre 1 vez al día (5am CR, vía refresh-all.yml, fuera de
-- horario), así que el lock breve de lectura durante el refresh no molesta.
--
-- IMPORTANTE: la consulta que define la vista NO se toca → el resultado es
-- idéntico (verificado: 337.992 filas y suma de monto sin cambios antes/después).
-- Se conservan los guards existentes: candado anti-solape (advisory xact lock),
-- debounce de 5 min y statement_timeout = 0.
-- ============================================================
CREATE OR REPLACE FUNCTION public.refresh_mv_items_por_vend_mes()
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

  REFRESH MATERIALIZED VIEW public.mv_items_por_vend_mes;

  UPDATE public.mv_refresh_state
    SET last_refresh = now()
    WHERE view_name = 'mv_items_por_vend_mes';

  RETURN 'refreshed';
END;
$function$;
