-- sol_duplicados_criticos(): cuenta duplicados REALES (por clave de negocio, sin
-- NULL) en las tablas críticas. Lo usa health_check.mjs (2x/día) para alertar por
-- Telegram si aparece duplicación (ej. dos procesos subiendo doble). Debe dar 0.
CREATE OR REPLACE FUNCTION public.sol_duplicados_criticos()
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT json_build_object(
    'facturados', (SELECT count(*)::int FROM (
        SELECT 1 FROM public.neo_items_facturados
        WHERE factura IS NOT NULL AND codigo_interno IS NOT NULL AND bodega IS NOT NULL
        GROUP BY factura, codigo_interno, bodega HAVING count(*) > 1) a),
    'movimientos', (SELECT count(*)::int FROM (
        SELECT 1 FROM public.neo_movimientos_contables
        WHERE asiento IS NOT NULL AND cuenta_contable IS NOT NULL
          AND debe_contabilidad IS NOT NULL AND haber_contabilidad IS NOT NULL
        GROUP BY asiento, cuenta_contable, debe_contabilidad, haber_contabilidad HAVING count(*) > 1) b),
    'lista', (SELECT count(*)::int FROM (
        SELECT 1 FROM public.neo_lista_items
        GROUP BY codigo_interno HAVING count(*) > 1) c)
  );
$$;
-- Las tablas son grandes; subimos el timeout para que el scan no se cancele.
ALTER FUNCTION public.sol_duplicados_criticos() SET statement_timeout = '120s';
