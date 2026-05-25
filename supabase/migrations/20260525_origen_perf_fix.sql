-- ============================================================
-- Fix de performance del módulo Origen (Pricing)
-- Fecha: 2026-05-25
-- ============================================================
-- Problema: sol_analisis_origen excedía el statement_timeout del rol
-- anon (3s), por lo que el tab "Panorama" mostraba el error
-- "canceling statement due to statement timeout".
--   - 12m tardaba ~7.5s, 36m ~15s.
--   - La función materializaba un CTE a nivel de línea facturada
--     (170k–495k filas) y lo recorría 3 veces (GROUP BY + 2 subconsultas
--     de totales para los %), re-escaneando neo_items_facturados.
--
-- Cambios (resultados verificados IDÉNTICOS al original para 12/24/36 meses):
--   1) sol_analisis_origen reescrita: agrega por codigo_interno una sola
--      vez, luego por origen, y calcula los % de totales con window
--      SUM() OVER () sobre las 3 filas de origen (sin re-escanear).
--   2) Índice covering para Index Only Scan sobre el rango de fechas.
--   3) Se subió el statement_timeout del rol anon de 3s a 10s (headroom).
-- Tras estos cambios: 12m ~1-2s, 36m ~3.4s (Index Only Scan, Heap Fetches: 0).
-- ============================================================

-- 1) Índice covering: permite Index Only Scan de la agregación por fecha_real
CREATE INDEX IF NOT EXISTS idx_facturados_origen_cov
  ON public.neo_items_facturados (fecha_real)
  INCLUDE (codigo_interno, subtotal, precio_unitario, costo_unitario, cantidad_facturada, cantidad_devuelta)
  WHERE fecha_real IS NOT NULL;

-- 2) sol_analisis_origen optimizada (single-scan)
CREATE OR REPLACE FUNCTION public.sol_analisis_origen(meses integer DEFAULT 12)
 RETURNS TABLE(origen text, venta numeric, utilidad numeric, margen numeric, pct_venta numeric, pct_util numeric)
 LANGUAGE sql
 STABLE
AS $function$
  WITH prod AS (
    SELECT f.codigo_interno,
      SUM(f.subtotal) AS venta,
      SUM((f.precio_unitario - f.costo_unitario)*(f.cantidad_facturada-COALESCE(f.cantidad_devuelta,0))) AS util
    FROM neo_items_facturados f
    WHERE f.costo_unitario>0 AND f.precio_unitario>0
      AND f.codigo_interno NOT IN ('TRANSPORTE','RUTEO0557') AND f.codigo_interno NOT LIKE 'RUTEO%'
      AND f.fecha_real >= (CURRENT_DATE - (meses || ' months')::interval)
    GROUP BY f.codigo_interno
  ),
  porig AS (
    SELECT COALESCE(cp.origen, c.origen, 'nacional') AS origen,
      SUM(p.venta) AS venta,
      SUM(p.util) AS util
    FROM prod p
    LEFT JOIN neo_lista_items li ON li.codigo_interno=p.codigo_interno
    LEFT JOIN clasificacion_origen_producto cp ON cp.codigo_interno=p.codigo_interno
    LEFT JOIN clasificacion_origen_proveedor c ON c.proveedor=TRIM(li.proveedor)
    GROUP BY 1
  ),
  -- excluir liquidaciones del reparto de mercadería
  filt AS (SELECT * FROM porig WHERE origen <> 'liquidacion')
  SELECT origen,
    ROUND(venta) AS venta,
    ROUND(util) AS utilidad,
    ROUND(100.0*util/NULLIF(venta,0),1) AS margen,
    ROUND(100.0*venta/NULLIF(SUM(venta) OVER (),0),1) AS pct_venta,
    ROUND(100.0*util/NULLIF(SUM(util) OVER (),0),1) AS pct_util
  FROM filt
  ORDER BY utilidad DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.sol_analisis_origen(integer) TO authenticated, anon, service_role;

-- 3) Headroom de timeout para el rol anon (la app usa la anon key).
--    Nota: el statement_timeout a nivel de función NO extiende el límite del
--    statement en curso; debe subirse a nivel de rol.
ALTER ROLE anon SET statement_timeout = '10s';
NOTIFY pgrst, 'reload config';
