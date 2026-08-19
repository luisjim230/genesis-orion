-- ─────────────────────────────────────────────────────────────────────────────
-- Disk IO: bi_recalcular_resumen dejaba de barrer las 786k filas completas
--
-- La versión anterior armaba un CTE `fact` con TODA neo_items_facturados y le
-- aplicaba dos regex + to_date() a la columna de texto `fecha` fila por fila.
-- Resultado: seq scan de 603 MB (~30 s y ~4 M bloques leídos) en cada corrida.
--
-- La tabla ya tiene `fecha_real` (date, poblada al 100 %, 2022-01-03 → hoy) con
-- índices:
--   idx_facturados_codigo_fecha_real (codigo_interno, fecha_real)
--   idx_facturados_origen_cov        (fecha_real) INCLUDE (codigo_interno,
--       subtotal, precio_unitario, costo_unitario, cantidad_facturada,
--       cantidad_devuelta)
-- Con eso: primera/última venta salen por index-only scan, y las ventanas de
-- 90/180/60 días leen solo el rango de fechas (índice de cobertura, sin tocar
-- el heap). Mismos números de salida, una fracción del IO.
--
-- Se le agrega además el throttle de _mv_debe_refrescar (3 h): la app la
-- llamaba ~40 veces por día desde botones y uploads.
-- ─────────────────────────────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.bi_recalcular_resumen();
CREATE OR REPLACE FUNCTION public.bi_recalcular_resumen(p_force boolean DEFAULT false)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET statement_timeout TO '0'
SET search_path TO public
AS $$
DECLARE
  d90  date := CURRENT_DATE - INTERVAL '90 days';
  d180 date := CURRENT_DATE - INTERVAL '180 days';
  d60  date := CURRENT_DATE - INTERVAL '60 days';
  d30  date := CURRENT_DATE - INTERVAL '30 days';
BEGIN
  IF NOT public._mv_debe_refrescar('bi_resumen_producto', interval '3 hours', p_force) THEN
    RETURN 'skipped';
  END IF;

  TRUNCATE bi_resumen_producto;

  INSERT INTO bi_resumen_producto (
    codigo_interno, nombre, categoria, proveedor, existencias, costo_unitario,
    capital_invertido, venta_total_90d, venta_mensual_90d, venta_total_180d,
    venta_mensual_180d, margen_pct, meses_cobertura, ultima_venta, ultima_compra,
    tendencia_pct, clasificacion, actualizado_en
  )
  WITH hist AS (
    -- Historia completa, pero por index-only scan sobre (codigo_interno, fecha_real).
    SELECT codigo_interno,
           MIN(fecha_real) AS primera_venta,
           MAX(fecha_real) AS ultima_venta
      FROM neo_items_facturados
     WHERE fecha_real IS NOT NULL
     GROUP BY codigo_interno
  ),
  fact AS (
    -- Solo los últimos 180 días: entra por idx_facturados_origen_cov.
    SELECT
      codigo_interno,
      fecha_real AS f,
      cantidad_facturada::numeric - COALESCE(cantidad_devuelta::numeric, 0) AS qty,
      cantidad_facturada::numeric AS qty_f,
      subtotal::numeric AS revenue,
      costo_unitario::numeric AS cu
    FROM neo_items_facturados
    WHERE fecha_real IS NOT NULL AND fecha_real >= d180
  ),
  v90 AS (
    SELECT codigo_interno,
      SUM(qty)      AS total,
      SUM(revenue)  AS revenue,
      SUM(cu * qty) AS costo_total
    FROM fact WHERE f >= d90 GROUP BY codigo_interno
  ),
  v180 AS (
    SELECT codigo_interno, SUM(qty) AS total
    FROM fact GROUP BY codigo_interno
  ),
  tend AS (
    SELECT codigo_interno,
      SUM(CASE WHEN f >= d30 THEN qty_f ELSE 0 END) AS v30,
      SUM(CASE WHEN f <  d30 THEN qty_f ELSE 0 END) AS v30prev
    FROM fact WHERE f >= d60 GROUP BY codigo_interno
  ),
  lista AS (
    SELECT
      i.codigo_interno, i.item, i.proveedor,
      COALESCE(mm.existencias, i.existencias)::numeric AS exist,
      i.costo_sin_imp::numeric AS costo_unit,
      CASE
        WHEN i.ultima_compra ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(left(i.ultima_compra,10),'DD/MM/YYYY')
        WHEN i.ultima_compra ~ '^\d{4}-\d{2}-\d{2}' THEN to_date(left(i.ultima_compra,10),'YYYY-MM-DD')
        ELSE NULL
      END AS ultima_compra_d
    FROM neo_lista_items i
    LEFT JOIN neo_minimos_maximos mm ON mm.codigo = i.codigo_interno
    WHERE i.activo = 'Sí' AND i.codigo_interno != 'TRANSPORTE'
      AND i.item IS NOT NULL AND btrim(i.item) != ''
  )
  SELECT
    l.codigo_interno, l.item, NULL::text, l.proveedor,
    l.exist, l.costo_unit,
    l.exist * l.costo_unit,
    COALESCE(v90.total, 0),
    CASE WHEN COALESCE(v90.total, 0) > 0 THEN
      ROUND(v90.total / GREATEST((CURRENT_DATE - GREATEST(h.primera_venta, d90))::numeric / 30.0, 1), 1)
    ELSE 0 END,
    COALESCE(v180.total, 0),
    CASE WHEN COALESCE(v180.total, 0) > 0 THEN
      ROUND(v180.total / GREATEST((CURRENT_DATE - GREATEST(h.primera_venta, d180))::numeric / 30.0, 1), 1)
    ELSE 0 END,
    CASE WHEN COALESCE(v90.revenue, 0) > 0
      THEN ROUND(((v90.revenue - v90.costo_total) / v90.revenue * 100)::numeric, 1)
      ELSE 0 END,
    CASE WHEN COALESCE(v90.total, 0) > 0 THEN
      ROUND((l.exist / (v90.total / GREATEST((CURRENT_DATE - GREATEST(h.primera_venta, d90))::numeric / 30.0, 1)))::numeric, 1)
    ELSE 999 END,
    h.ultima_venta,
    l.ultima_compra_d,
    CASE WHEN COALESCE(t.v30prev, 0) > 0
      THEN ROUND(((t.v30 - t.v30prev) / t.v30prev * 100)::numeric, 1)
      ELSE 0 END,
    CASE
      WHEN l.exist <= 0 THEN 'sin_stock'
      WHEN h.primera_venta >= d60 THEN 'normal'
      WHEN COALESCE(v90.total, 0) = 0
        AND (l.ultima_compra_d IS NULL OR l.ultima_compra_d < d60)
        THEN 'muerto'
      WHEN COALESCE(v90.total, 0) = 0 THEN 'normal'
      WHEN h.primera_venta < d90
        AND (l.exist / NULLIF(v90.total / GREATEST((CURRENT_DATE - GREATEST(h.primera_venta, d90))::numeric / 30.0, 1), 0)) > 6 THEN 'sobrestock'
      WHEN (l.exist / NULLIF(v90.total / GREATEST((CURRENT_DATE - GREATEST(h.primera_venta, d90))::numeric / 30.0, 1), 0)) < 2 THEN 'reforzar'
      ELSE 'normal'
    END,
    now()
  FROM lista l
  LEFT JOIN v90  ON v90.codigo_interno  = l.codigo_interno
  LEFT JOIN v180 ON v180.codigo_interno = l.codigo_interno
  LEFT JOIN hist h ON h.codigo_interno  = l.codigo_interno
  LEFT JOIN tend t ON t.codigo_interno  = l.codigo_interno;

  UPDATE public.mv_refresh_state SET last_refresh = now()
   WHERE view_name = 'bi_resumen_producto';

  RETURN 'refreshed';
END;
$$;

GRANT EXECUTE ON FUNCTION public.bi_recalcular_resumen(boolean) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
