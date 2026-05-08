-- ============================================================
-- Migración: Módulo Pricing
-- Fecha: 2026-05-08
-- ============================================================
-- Crea:
--   1) RPC pricing_dataset(start_date, end_date) -> agregado por SKU
--   2) RPC pricing_productos_muertos(dias_min) -> SKUs sin venta con stock
--   3) Tabla pricing_alertas_log -> historial de alertas enviadas
--   4) Tabla pricing_thresholds_skus -> umbrales personalizados por SKU
-- ============================================================
-- INSTRUCCIONES: Ejecutar en Supabase SQL Editor (o ya aplicada via MCP).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) RPC: pricing_dataset
-- ────────────────────────────────────────────────────────────
-- Devuelve un agregado por SKU para el período pedido,
-- excluye TRANSPORTE/RUTEO y netea devoluciones.
-- ────────────────────────────────────────────────────────────
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
    MAX(to_date(fecha,'DD/MM/YYYY')) AS ultima_venta,
    AVG(precio_unitario::numeric) AS precio_promedio,
    COUNT(*)::int AS lineas
  FROM neo_items_facturados
  WHERE fecha ~ '^\d{2}/\d{2}/\d{4}$'
    AND to_date(fecha,'DD/MM/YYYY') BETWEEN p_start AND p_end
    AND codigo_interno NOT IN ('TRANSPORTE','RUTEO0557','42069','351100300990594','351100300991165')
  GROUP BY codigo_interno
),
ult_venta_global AS (
  SELECT codigo_interno, MAX(to_date(fecha,'DD/MM/YYYY')) AS uvr
  FROM neo_items_facturados
  WHERE fecha ~ '^\d{2}/\d{2}/\d{4}$'
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
  uv.uvr                                                     AS ultima_venta_real,
  v.lineas,
  ROUND(COALESCE(s.exist_inv, c.existencias, 0)::numeric, 2) AS existencias,
  ROUND(COALESCE(s.ultimo_costo, c.costo_sin_imp)::numeric, 2) AS ultimo_costo,
  ROUND(c.precio_con_imp::numeric, 2)                        AS precio_lista,
  s.ubicacion
FROM ventas v
LEFT JOIN catalogo c ON c.codigo_interno = v.codigo_interno
LEFT JOIN stock s    ON s.codigo         = v.codigo_interno
LEFT JOIN ult_venta_global uv ON uv.codigo_interno = v.codigo_interno;
$$;

GRANT EXECUTE ON FUNCTION pricing_dataset(DATE, DATE) TO authenticated, anon, service_role;

-- ────────────────────────────────────────────────────────────
-- 2) RPC: pricing_productos_muertos
-- ────────────────────────────────────────────────────────────
-- Devuelve SKUs con stock > 0 que no han vendido en los últimos N días.
-- ────────────────────────────────────────────────────────────
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
  SELECT codigo_interno, MAX(to_date(fecha,'DD/MM/YYYY')) AS uv
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

-- ────────────────────────────────────────────────────────────
-- 3) Tabla: pricing_alertas_log
-- ────────────────────────────────────────────────────────────
-- Historial de alertas de erosión de margen enviadas.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_alertas_log (
  id                  BIGSERIAL PRIMARY KEY,
  fecha_alerta        DATE NOT NULL DEFAULT CURRENT_DATE,
  codigo_interno      TEXT NOT NULL,
  nombre              TEXT,
  categoria           TEXT,
  margen_baseline_pct NUMERIC,
  margen_actual_pct   NUMERIC,
  caida_pp            NUMERIC,
  venta_periodo       NUMERIC,
  utilidad_periodo    NUMERIC,
  enviada_telegram    BOOLEAN DEFAULT FALSE,
  notas               TEXT,
  creado_en           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_alertas_fecha ON pricing_alertas_log(fecha_alerta DESC);
CREATE INDEX IF NOT EXISTS idx_pricing_alertas_sku   ON pricing_alertas_log(codigo_interno);

ALTER TABLE pricing_alertas_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_alertas_select ON pricing_alertas_log;
CREATE POLICY pricing_alertas_select ON pricing_alertas_log
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS pricing_alertas_service ON pricing_alertas_log;
CREATE POLICY pricing_alertas_service ON pricing_alertas_log
  FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 4) Tabla: pricing_thresholds_skus
-- ────────────────────────────────────────────────────────────
-- Umbrales personalizados de margen mínimo aceptable por SKU.
-- Default: si no hay registro, se usa margen_baseline_90d - 3pp.
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_thresholds_skus (
  codigo_interno      TEXT PRIMARY KEY,
  margen_minimo_pct   NUMERIC NOT NULL,
  comentario          TEXT,
  actualizado_por     TEXT,
  actualizado_en      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pricing_thresholds_skus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pricing_thresholds_all ON pricing_thresholds_skus;
CREATE POLICY pricing_thresholds_all ON pricing_thresholds_skus
  FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'authenticated' OR auth.role() = 'service_role');
