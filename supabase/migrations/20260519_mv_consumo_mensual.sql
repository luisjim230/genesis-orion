-- Vista materializada con promedio mensual de ventas (últimos 6 meses) por código.
-- Suple el dato de promedio_mensual que NEO solo calcula para items con min/max,
-- así Compras puede armar órdenes y sugerencias para todo el catálogo (4200+ items).

CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_consumo_mensual AS
SELECT
  codigo_interno AS codigo,
  SUM(COALESCE(cantidad_facturada,0) - COALESCE(cantidad_devuelta,0)) / 6.0 AS promedio_mensual,
  SUM(COALESCE(cantidad_facturada,0) - COALESCE(cantidad_devuelta,0)) AS unidades_6m,
  COUNT(DISTINCT TO_CHAR(fecha_real, 'YYYY-MM')) AS meses_con_ventas
FROM public.neo_items_facturados
WHERE fecha_real >= (CURRENT_DATE - INTERVAL '6 months')
  AND fecha_real <= CURRENT_DATE
  AND codigo_interno IS NOT NULL
  AND TRIM(codigo_interno) <> ''
GROUP BY codigo_interno
HAVING SUM(COALESCE(cantidad_facturada,0) - COALESCE(cantidad_devuelta,0)) > 0;

CREATE UNIQUE INDEX IF NOT EXISTS mv_consumo_mensual_codigo_idx
  ON public.mv_consumo_mensual (codigo);

GRANT SELECT ON public.mv_consumo_mensual TO anon, authenticated;

INSERT INTO public.mv_refresh_state (view_name, last_refresh)
VALUES ('mv_consumo_mensual', 'epoch')
ON CONFLICT (view_name) DO NOTHING;

DROP FUNCTION IF EXISTS public.refresh_mv_consumo_mensual();

CREATE FUNCTION public.refresh_mv_consumo_mensual()
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
    WHERE view_name = 'mv_consumo_mensual'
    FOR UPDATE SKIP LOCKED;

  IF last_ts IS NULL THEN
    RETURN 'skipped: ya hay un refresh en curso';
  END IF;

  IF now() - last_ts < interval '5 minutes' THEN
    RETURN 'skipped: refrescada hace ' || extract(epoch FROM (now() - last_ts))::int || 's';
  END IF;

  got_lock := pg_try_advisory_xact_lock(hashtext('refresh_mv_consumo_mensual'));
  IF NOT got_lock THEN
    RETURN 'skipped: otro refresh en curso';
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_consumo_mensual;

  UPDATE public.mv_refresh_state
    SET last_refresh = now()
    WHERE view_name = 'mv_consumo_mensual';

  RETURN 'refreshed';
END;
$function$;

GRANT EXECUTE ON FUNCTION public.refresh_mv_consumo_mensual() TO anon, authenticated;
