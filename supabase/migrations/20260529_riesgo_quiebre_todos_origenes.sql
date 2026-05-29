-- ============================================================
-- Riesgo de Quiebre (módulo Origen): soportar TODOS los orígenes
-- Fecha: 2026-05-29
-- ============================================================
-- Problema: sol_riesgo_quiebre_importado hacía un JOIN forzado contra
-- proveedores_leadtime con tipo='extranjero', por lo que el análisis de
-- quiebre SOLO mostraba proveedores internacionales. Los proveedores
-- nacionales y la categoría "combo" quedaban afuera, aun cuando ya tienen
-- lead time cargado (22 nacionales) o clasificación (88 nacional, 3 combo).
--
-- Solución: nueva función generalizada `sol_riesgo_quiebre` que:
--   1) Determina el origen de cada producto con la misma lógica que Panorama:
--      override por producto > clasificación del proveedor > 'nacional'.
--   2) Trae el lead time por proveedor con LEFT JOIN (cualquier tipo, activo),
--      con default de 8 días si el proveedor no tiene lead time cargado.
--   3) Acepta un parámetro `origen_filtro` ('todos' | 'nacional' | 'importado'
--      | 'combo') para acotar el análisis desde la UI.
--   4) Devuelve también la columna `origen`.
-- Se excluyen liquidaciones igual que antes. El semáforo/cobertura usan las
-- mismas reglas (cobertura actual vs lead time en meses).
--
-- La función vieja sol_riesgo_quiebre_importado se mantiene por compatibilidad.
-- ============================================================

CREATE OR REPLACE FUNCTION public.sol_riesgo_quiebre(
  util_min numeric DEFAULT 200000,
  meses integer DEFAULT 12,
  origen_filtro text DEFAULT 'todos'
)
 RETURNS TABLE(codigo_interno text, producto text, proveedor text, origen text, lead_dias integer, venta_12m numeric, utilidad_12m numeric, margen_pct numeric, existencias numeric, meses_cobertura numeric, semaforo text, orden_urgencia integer)
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
  -- 1 fila por proveedor normalizado (evita multiplicar filas si hubiera duplicados)
  leadtimes AS (
    SELECT UPPER(TRIM(proveedor)) AS pkey, MAX(lead_time_dias) AS lead_time_dias
    FROM proveedores_leadtime
    WHERE COALESCE(activo, true)
    GROUP BY 1
  ),
  base AS (
    SELECT u.codigo_interno,
      COALESCE(b.nombre, li.item) AS producto,
      li.proveedor,
      COALESCE(cp.origen, c.origen, 'nacional') AS origen,
      COALESCE(lt.lead_time_dias, 8) AS lead_dias,
      ROUND(u.venta_12m) AS venta_12m, ROUND(u.util_12m) AS utilidad_12m,
      ROUND(100.0*u.util_12m/NULLIF(u.venta_12m,0)) AS margen_pct,
      COALESCE(b.existencias,0) AS existencias,
      CASE WHEN COALESCE(b.meses_cobertura,999) >= 999 THEN NULL ELSE ROUND(b.meses_cobertura,1) END AS meses_cobertura,
      COALESCE(lt.lead_time_dias, 8)/30.0 AS lead_meses,
      b.meses_cobertura AS cob_raw
    FROM util u
    JOIN neo_lista_items li ON li.codigo_interno=u.codigo_interno
    LEFT JOIN clasificacion_origen_producto cp ON cp.codigo_interno=u.codigo_interno
    LEFT JOIN clasificacion_origen_proveedor c ON UPPER(TRIM(c.proveedor))=UPPER(TRIM(li.proveedor))
    LEFT JOIN leadtimes lt ON lt.pkey=UPPER(TRIM(li.proveedor))
    LEFT JOIN bi_resumen_producto b ON b.codigo_interno=u.codigo_interno
    WHERE u.util_12m > util_min
      AND COALESCE(cp.origen, c.origen, 'nacional') <> 'liquidacion'
      AND (origen_filtro = 'todos' OR COALESCE(cp.origen, c.origen, 'nacional') = origen_filtro)
  )
  SELECT codigo_interno, producto, proveedor, origen, lead_dias, venta_12m, utilidad_12m,
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

GRANT EXECUTE ON FUNCTION public.sol_riesgo_quiebre(numeric, integer, text) TO authenticated, anon, service_role;
NOTIFY pgrst, 'reload config';
