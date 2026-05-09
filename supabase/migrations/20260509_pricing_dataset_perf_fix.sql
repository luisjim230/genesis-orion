-- ============================================================
-- Fix de performance del RPC pricing_dataset
-- Fecha: 2026-05-09
-- ============================================================
-- Problema: El RPC pricing_dataset hacía to_date(fecha,'DD/MM/YYYY')
-- por fila sobre 750k registros de neo_items_facturados, lo cual
-- impedía usar índices y excedía el statement_timeout de Supabase.
--
-- Cambios:
--   1) Índice de expresión INMUTABLE sobre la fecha derivada con
--      make_date+split_part (to_date es STABLE y no permite índice).
--   2) Índice compuesto (codigo_interno, fecha_real) por si futuras
--      queries lo necesitan.
--   3) pricing_dataset reescrita: usa la misma expresión que el índice,
--      elimina el CTE costoso `ult_venta_global` (que escaneaba toda
--      la historia y no se usaba en el frontend) y aplica
--      `SET statement_timeout TO '60s'` por las dudas.
--   4) pricing_productos_muertos también pasa a usar make_date.
-- ============================================================

-- 1) Índices de expresión inmutables
CREATE INDEX IF NOT EXISTS idx_facturados_fecha_real
  ON neo_items_facturados (
    (make_date(
      split_part(fecha,'/',3)::int,
      split_part(fecha,'/',2)::int,
      split_part(fecha,'/',1)::int
    ))
  )
  WHERE fecha ~ '^\d{2}/\d{2}/\d{4}$';

CREATE INDEX IF NOT EXISTS idx_facturados_codigo_fecha_real
  ON neo_items_facturados (
    codigo_interno,
    (make_date(
      split_part(fecha,'/',3)::int,
      split_part(fecha,'/',2)::int,
      split_part(fecha,'/',1)::int
    ))
  )
  WHERE fecha ~ '^\d{2}/\d{2}/\d{4}$';

-- 2) pricing_dataset reescrita
DROP FUNCTION IF EXISTS pricing_dataset(DATE, DATE);

CREATE OR REPLACE FUNCTION pricing_dataset(
  p_start DATE,
  p_end   DATE
)
RETURNS TABLE (
  codigo_interno      TEXT,
  nombre              TEXT,
  categoria           TEXT,
  marca               TEXT,
  proveedor           TEXT,
  qty_neta            NUMERIC,
  venta_neta          NUMERIC,
  costo_neto          NUMERIC,
  utilidad_neta       NUMERIC,
  margen_pct          NUMERIC,
  markup_pct          NUMERIC,
  precio_unit_prom    NUMERIC,
  costo_unit_prom     NUMERIC,
  ultima_venta_periodo DATE,
  ultima_venta_real   DATE,
  lineas              INT,
  existencias         NUMERIC,
  ultimo_costo        NUMERIC,
  precio_lista        NUMERIC,
  ubicacion           TEXT
)
LANGUAGE sql
STABLE
SET statement_timeout TO '60s'
AS $$
WITH ventas AS (
  SELECT
    codigo_interno,
    MAX(item) AS item_factura,
    MAX(marca) AS marca_factura,
    SUM(cantidad_facturada::numeric - COALESCE(cantidad_devuelta::numeric,0)) AS qty_neta,
    SUM(
      (subtotal::numeric - COALESCE(descuento::numeric,0))
      * (cantidad_facturada::numeric - COALESCE(cantidad_devuelta::numeric,0))
      / NULLIF(cantidad_facturada::numeric, 0)
    ) AS venta_neta,
    SUM(costo_unitario::numeric * (cantidad_facturada::numeric - COALESCE(cantidad_devuelta::numeric,0))) AS costo_neto,
    MAX(make_date(
      split_part(fecha,'/',3)::int,
      split_part(fecha,'/',2)::int,
      split_part(fecha,'/',1)::int
    )) AS ultima_venta,
    COUNT(*)::int AS lineas
  FROM neo_items_facturados
  WHERE fecha ~ '^\d{2}/\d{2}/\d{4}$'
    AND make_date(
      split_part(fecha,'/',3)::int,
      split_part(fecha,'/',2)::int,
      split_part(fecha,'/',1)::int
    ) BETWEEN p_start AND p_end
    AND codigo_interno NOT IN ('TRANSPORTE','RUTEO0557','42069','351100300990594','351100300991165')
  GROUP BY codigo_interno
),
catalogo AS (
  SELECT DISTINCT ON (codigo_interno)
    codigo_interno, item, categoria, marca, proveedor,
    costo_sin_imp, precio_con_imp, existencias
  FROM neo_lista_items
  ORDER BY codigo_interno, fecha_carga DESC NULLS LAST
),
stock AS (
  SELECT DISTINCT ON (codigo)
    codigo, nombre AS nombre_inv, existencias AS exist_inv,
    ultimo_costo, ubicacion
  FROM neo_minimos_maximos
  ORDER BY codigo, fecha_carga DESC NULLS LAST
)
SELECT
  v.codigo_interno,
  COALESCE(c.item, s.nombre_inv, v.item_factura)            AS nombre,
  COALESCE(c.categoria,'SIN CATEGORIA')                      AS categoria,
  COALESCE(c.marca, v.marca_factura)                         AS marca,
  c.proveedor,
  ROUND(v.qty_neta::numeric, 4)                              AS qty_neta,
  ROUND(v.venta_neta::numeric, 2)                            AS venta_neta,
  ROUND(v.costo_neto::numeric, 2)                            AS costo_neto,
  ROUND((v.venta_neta - v.costo_neto)::numeric, 2)           AS utilidad_neta,
  CASE WHEN v.venta_neta > 0
       THEN ROUND(((v.venta_neta - v.costo_neto)/v.venta_neta * 100)::numeric, 4)
  END                                                        AS margen_pct,
  CASE WHEN v.costo_neto > 0
       THEN ROUND(((v.venta_neta - v.costo_neto)/v.costo_neto * 100)::numeric, 4)
  END                                                        AS markup_pct,
  CASE WHEN v.qty_neta > 0
       THEN ROUND((v.venta_neta / v.qty_neta)::numeric, 2)
  END                                                        AS precio_unit_prom,
  CASE WHEN v.qty_neta > 0
       THEN ROUND((v.costo_neto / v.qty_neta)::numeric, 2)
  END                                                        AS costo_unit_prom,
  v.ultima_venta                                             AS ultima_venta_periodo,
  v.ultima_venta                                             AS ultima_venta_real,
  v.lineas,
  ROUND(COALESCE(s.exist_inv, c.existencias, 0)::numeric, 2) AS existencias,
  ROUND(COALESCE(s.ultimo_costo, c.costo_sin_imp)::numeric, 2) AS ultimo_costo,
  ROUND(c.precio_con_imp::numeric, 2)                        AS precio_lista,
  s.ubicacion
FROM ventas v
LEFT JOIN catalogo c ON c.codigo_interno = v.codigo_interno
LEFT JOIN stock s    ON s.codigo         = v.codigo_interno;
$$;

GRANT EXECUTE ON FUNCTION pricing_dataset(DATE, DATE) TO authenticated, anon, service_role;

-- 3) pricing_productos_muertos con la misma expresión inmutable
CREATE OR REPLACE FUNCTION pricing_productos_muertos(p_dias INT DEFAULT 180)
RETURNS TABLE (
  codigo_interno     TEXT,
  nombre             TEXT,
  categoria          TEXT,
  marca              TEXT,
  proveedor          TEXT,
  existencias        NUMERIC,
  ultimo_costo       NUMERIC,
  capital_inmovilizado NUMERIC,
  ultima_venta       DATE,
  dias_sin_venta     INT,
  ubicacion          TEXT,
  activo             TEXT
)
LANGUAGE sql
STABLE
SET statement_timeout TO '60s'
AS $$
WITH catalogo AS (
  SELECT DISTINCT ON (codigo_interno)
    codigo_interno, item, categoria, marca, proveedor,
    costo_sin_imp, existencias, activo
  FROM neo_lista_items
  ORDER BY codigo_interno, fecha_carga DESC NULLS LAST
),
stock AS (
  SELECT DISTINCT ON (codigo)
    codigo, nombre AS nombre_inv, existencias AS exist_inv,
    ultimo_costo, ubicacion
  FROM neo_minimos_maximos
  ORDER BY codigo, fecha_carga DESC NULLS LAST
),
ult_venta AS (
  SELECT codigo_interno,
         MAX(make_date(
           split_part(fecha,'/',3)::int,
           split_part(fecha,'/',2)::int,
           split_part(fecha,'/',1)::int
         )) AS uv
  FROM neo_items_facturados
  WHERE fecha ~ '^\d{2}/\d{2}/\d{4}$'
  GROUP BY codigo_interno
)
SELECT
  c.codigo_interno,
  COALESCE(c.item, s.nombre_inv)                            AS nombre,
  COALESCE(c.categoria,'SIN CATEGORIA')                      AS categoria,
  COALESCE(c.marca,'')                                       AS marca,
  c.proveedor,
  ROUND(COALESCE(s.exist_inv, c.existencias, 0)::numeric, 2) AS existencias,
  ROUND(COALESCE(s.ultimo_costo, c.costo_sin_imp, 0)::numeric, 2) AS ultimo_costo,
  ROUND((COALESCE(s.exist_inv, c.existencias, 0) * COALESCE(s.ultimo_costo, c.costo_sin_imp, 0))::numeric, 2) AS capital_inmovilizado,
  uv.uv                                                      AS ultima_venta,
  COALESCE((CURRENT_DATE - uv.uv), 99999)::int               AS dias_sin_venta,
  s.ubicacion,
  c.activo
FROM catalogo c
LEFT JOIN stock s   ON s.codigo = c.codigo_interno
LEFT JOIN ult_venta uv ON uv.codigo_interno = c.codigo_interno
WHERE c.codigo_interno NOT IN ('TRANSPORTE','RUTEO0557','42069','351100300990594','351100300991165')
  AND COALESCE(s.exist_inv, c.existencias, 0) > 0
  AND (uv.uv IS NULL OR (CURRENT_DATE - uv.uv) >= p_dias);
$$;

GRANT EXECUTE ON FUNCTION pricing_productos_muertos(INT) TO authenticated, anon, service_role;
