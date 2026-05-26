-- ============================================================
-- Riesgo de Quiebre (módulo Origen): parámetro de período
-- Fecha: 2026-05-26
-- ============================================================
-- Agrega el parámetro `meses` (default 12) a sol_riesgo_quiebre_importado
-- para poder elegir el lapso de tiempo de la venta/utilidad desde la UI
-- (botones 12m / 24m / 36m), igual que Panorama.
--   - Con meses=12 los resultados son IDÉNTICOS al original (verificado).
--   - El semáforo, cobertura y existencias son métricas actuales
--     (de bi_resumen_producto) y no dependen del período.
-- Se elimina el overload viejo de 1 argumento para evitar ambigüedad en PostgREST.
-- ============================================================

DROP FUNCTION IF EXISTS public.sol_riesgo_quiebre_importado(numeric);

CREATE OR REPLACE FUNCTION public.sol_riesgo_quiebre_importado(util_min numeric DEFAULT 200000, meses integer DEFAULT 12)
 RETURNS TABLE(codigo_interno text, producto text, proveedor text, lead_dias integer, venta_12m numeric, utilidad_12m numeric, margen_pct numeric, existencias numeric, meses_cobertura numeric, semaforo text, orden_urgencia integer)
 LANGUAGE sql
 STABLE
AS $function$
  WITH util AS (
    SELECT f.codigo_interno,
      SUM(f.subtotal) AS venta_12m,
      SUM((f.precio_unitario-f.costo_unitario)*(f.cantidad_facturada-COALESCE(f.cantidad_devuelta,0))) AS util_12m
    FROM neo_items_facturados f
    WHERE f.fecha_real >= (CURRENT_DATE - (meses || ' months')::interval)
      AND f.costo_unitario>0 AND f.precio_unitario>0
      AND f.codigo_interno NOT IN ('TRANSPORTE','RUTEO0557') AND f.codigo_interno NOT LIKE 'RUTEO%'
    GROUP BY f.codigo_interno
  ),
  base AS (
    SELECT u.codigo_interno, b.nombre AS producto, lt.proveedor, lt.lead_time_dias AS lead_dias,
      ROUND(u.venta_12m) AS venta_12m, ROUND(u.util_12m) AS utilidad_12m,
      ROUND(100.0*u.util_12m/NULLIF(u.venta_12m,0)) AS margen_pct,
      COALESCE(b.existencias,0) AS existencias,
      CASE WHEN COALESCE(b.meses_cobertura,999) >= 999 THEN NULL ELSE ROUND(b.meses_cobertura,1) END AS meses_cobertura,
      lt.lead_time_dias/30.0 AS lead_meses,
      b.meses_cobertura AS cob_raw
    FROM util u
    JOIN neo_lista_items li ON li.codigo_interno=u.codigo_interno
    LEFT JOIN clasificacion_origen_producto cp ON cp.codigo_interno=u.codigo_interno
    JOIN proveedores_leadtime lt ON UPPER(TRIM(lt.proveedor))=UPPER(TRIM(li.proveedor)) AND lt.tipo='extranjero'
    LEFT JOIN bi_resumen_producto b ON b.codigo_interno=u.codigo_interno
    WHERE u.util_12m > util_min
      AND COALESCE(cp.origen,'importado') <> 'liquidacion'
  )
  SELECT codigo_interno, producto, proveedor, lead_dias, venta_12m, utilidad_12m,
    margen_pct, existencias, meses_cobertura,
    CASE
      WHEN COALESCE(cob_raw,0) >= 90 THEN 'Exceso'
      WHEN COALESCE(cob_raw,0) <= lead_meses THEN 'CRITICO'
      WHEN COALESCE(cob_raw,0) <= lead_meses*1.5 THEN 'Alerta'
      ELSE 'OK'
    END AS semaforo,
    CASE
      WHEN COALESCE(cob_raw,0) <= lead_meses THEN 0
      WHEN COALESCE(cob_raw,0) <= lead_meses*1.5 THEN 1
      WHEN COALESCE(cob_raw,0) >= 90 THEN 3
      ELSE 2
    END AS orden_urgencia
  FROM base
  ORDER BY orden_urgencia, utilidad_12m DESC;
$function$;

GRANT EXECUTE ON FUNCTION public.sol_riesgo_quiebre_importado(numeric, integer) TO authenticated, anon, service_role;
