-- bi_recalcular_resumen: tolera fechas de NEO en DD/MM/YYYY (legacy) y YYYY-MM-DD HH:MM:SS (nuevo).
-- Antes la función reventaba al toparse con un timestamp ISO en neo_items_facturados.fecha o
-- neo_lista_items.ultima_compra, dejando bi_resumen_producto congelado en 2026-03-27.

CREATE OR REPLACE FUNCTION public.bi_recalcular_resumen()
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  d90  date := CURRENT_DATE - INTERVAL '90 days';
  d180 date := CURRENT_DATE - INTERVAL '180 days';
  d60  date := CURRENT_DATE - INTERVAL '60 days';
  d30  date := CURRENT_DATE - INTERVAL '30 days';
BEGIN
  TRUNCATE bi_resumen_producto;

  INSERT INTO bi_resumen_producto (
    codigo_interno, nombre, categoria, proveedor, existencias, costo_unitario,
    capital_invertido, venta_total_90d, venta_mensual_90d, venta_total_180d,
    venta_mensual_180d, margen_pct, meses_cobertura, ultima_venta, ultima_compra,
    tendencia_pct, clasificacion, actualizado_en
  )
  WITH fact AS (
    SELECT
      codigo_interno,
      CASE
        WHEN fecha ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(left(fecha,10), 'DD/MM/YYYY')
        WHEN fecha ~ '^\d{4}-\d{2}-\d{2}' THEN to_date(left(fecha,10), 'YYYY-MM-DD')
      END AS f,
      cantidad_facturada::numeric - COALESCE(cantidad_devuelta::numeric,0) AS qty,
      cantidad_facturada::numeric AS qty_f,
      subtotal::numeric AS revenue,
      costo_unitario::numeric AS cu
    FROM neo_items_facturados
  ),
  primera AS (
    SELECT codigo_interno, MIN(f) AS primera_venta FROM fact WHERE f IS NOT NULL GROUP BY codigo_interno
  ),
  v90 AS (
    SELECT codigo_interno,
      SUM(qty) AS total,
      SUM(revenue) AS revenue,
      SUM(cu * qty) AS costo_total
    FROM fact WHERE f >= d90 GROUP BY codigo_interno
  ),
  v180 AS (
    SELECT codigo_interno, SUM(qty) AS total
    FROM fact WHERE f >= d180 GROUP BY codigo_interno
  ),
  uv AS (
    SELECT codigo_interno, MAX(f) AS ultima_venta FROM fact WHERE f IS NOT NULL GROUP BY codigo_interno
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
      i.existencias::numeric AS exist,
      i.costo_sin_imp::numeric AS costo_unit,
      CASE
        WHEN i.ultima_compra ~ '^\d{2}/\d{2}/\d{4}' THEN to_date(left(i.ultima_compra,10),'DD/MM/YYYY')
        WHEN i.ultima_compra ~ '^\d{4}-\d{2}-\d{2}' THEN to_date(left(i.ultima_compra,10),'YYYY-MM-DD')
        ELSE NULL
      END AS ultima_compra_d
    FROM neo_lista_items i
    WHERE i.activo = 'Sí' AND i.codigo_interno != 'TRANSPORTE'
      AND i.item IS NOT NULL AND btrim(i.item) != ''
  )
  SELECT
    l.codigo_interno, l.item, NULL::text, l.proveedor,
    l.exist, l.costo_unit,
    l.exist * l.costo_unit,
    COALESCE(v90.total, 0),
    CASE WHEN COALESCE(v90.total, 0) > 0 THEN
      ROUND(v90.total / GREATEST((CURRENT_DATE - GREATEST(p.primera_venta, d90))::numeric / 30.0, 1), 1)
    ELSE 0 END,
    COALESCE(v180.total, 0),
    CASE WHEN COALESCE(v180.total, 0) > 0 THEN
      ROUND(v180.total / GREATEST((CURRENT_DATE - GREATEST(p.primera_venta, d180))::numeric / 30.0, 1), 1)
    ELSE 0 END,
    CASE WHEN COALESCE(v90.revenue, 0) > 0
      THEN ROUND(((v90.revenue - v90.costo_total) / v90.revenue * 100)::numeric, 1)
      ELSE 0 END,
    CASE WHEN COALESCE(v90.total, 0) > 0 THEN
      ROUND((l.exist / (v90.total / GREATEST((CURRENT_DATE - GREATEST(p.primera_venta, d90))::numeric / 30.0, 1)))::numeric, 1)
    ELSE 999 END,
    uv.ultima_venta,
    l.ultima_compra_d,
    CASE WHEN COALESCE(t.v30prev, 0) > 0
      THEN ROUND(((t.v30 - t.v30prev) / t.v30prev * 100)::numeric, 1)
      ELSE 0 END,
    CASE
      WHEN l.exist <= 0 THEN 'sin_stock'
      WHEN p.primera_venta >= d60 THEN 'normal'
      WHEN COALESCE(v90.total, 0) = 0
        AND (l.ultima_compra_d IS NULL OR l.ultima_compra_d < d60)
        THEN 'muerto'
      WHEN COALESCE(v90.total, 0) = 0 THEN 'normal'
      WHEN p.primera_venta < d90
        AND (l.exist / NULLIF(v90.total / GREATEST((CURRENT_DATE - GREATEST(p.primera_venta, d90))::numeric / 30.0, 1), 0)) > 6 THEN 'sobrestock'
      WHEN (l.exist / NULLIF(v90.total / GREATEST((CURRENT_DATE - GREATEST(p.primera_venta, d90))::numeric / 30.0, 1), 0)) < 2 THEN 'reforzar'
      ELSE 'normal'
    END,
    now()
  FROM lista l
  LEFT JOIN v90 ON v90.codigo_interno = l.codigo_interno
  LEFT JOIN v180 ON v180.codigo_interno = l.codigo_interno
  LEFT JOIN uv  ON uv.codigo_interno  = l.codigo_interno
  LEFT JOIN primera p ON p.codigo_interno = l.codigo_interno
  LEFT JOIN tend t ON t.codigo_interno = l.codigo_interno;
END;
$function$;
