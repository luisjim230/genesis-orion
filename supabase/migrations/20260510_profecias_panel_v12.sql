-- ============================================================
-- Migración: profecias_panel v1.2
-- Fecha: 2026-05-10
-- ============================================================
-- Cambios respecto a v1.1:
--   1) JOIN con profecias_aprobaciones para exponer estado_aprobacion,
--      cantidad_aprobada, aprobacion_id, aprobado_en, orden_compra_id.
--   2) Excluir items con TRANSPORTE / PATROCINIO (gastos / servicios)
--      del análisis — no son SKUs físicos.
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS profecias_panel CASCADE;

CREATE MATERIALIZED VIEW profecias_panel AS
WITH
cfg AS (
  SELECT * FROM profecias_config WHERE id = 1
),
facturas_sku AS (
  SELECT
    codigo_interno, factura, fecha_real,
    SUM(GREATEST(COALESCE(cantidad_facturada,0) - COALESCE(cantidad_devuelta,0), 0)) AS unidades_factura
  FROM neo_items_facturados
  WHERE codigo_interno IS NOT NULL AND fecha_real IS NOT NULL AND COALESCE(cantidad_facturada, 0) > 0
  GROUP BY codigo_interno, factura, fecha_real
),
medianas AS (
  SELECT codigo_interno,
    PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY unidades_factura) AS mediana_factura,
    COUNT(*) AS num_facturas
  FROM facturas_sku GROUP BY codigo_interno
),
outliers_marcados AS (
  SELECT fs.codigo_interno, fs.factura, fs.fecha_real, fs.unidades_factura,
    CASE WHEN m.num_facturas >= 5 AND m.mediana_factura >= 1 AND fs.unidades_factura > 3 * m.mediana_factura THEN TRUE ELSE FALSE END AS es_outlier
  FROM facturas_sku fs JOIN medianas m USING (codigo_interno)
),
ventas_agg AS (
  SELECT om.codigo_interno,
    MIN(om.fecha_real) AS primera_venta, MAX(om.fecha_real) AS ultima_venta,
    SUM(CASE WHEN om.fecha_real >= CURRENT_DATE - INTERVAL '30 days'  THEN om.unidades_factura ELSE 0 END) AS u_30d,
    SUM(CASE WHEN om.fecha_real >= CURRENT_DATE - INTERVAL '90 days'  THEN om.unidades_factura ELSE 0 END) AS u_90d,
    SUM(CASE WHEN om.fecha_real >= CURRENT_DATE - INTERVAL '180 days' THEN om.unidades_factura ELSE 0 END) AS u_180d,
    SUM(CASE WHEN om.fecha_real >= CURRENT_DATE - INTERVAL '30 days'  AND NOT om.es_outlier THEN om.unidades_factura ELSE 0 END) AS u_aj_30d,
    SUM(CASE WHEN om.fecha_real >= CURRENT_DATE - INTERVAL '90 days'  AND NOT om.es_outlier THEN om.unidades_factura ELSE 0 END) AS u_aj_90d,
    SUM(CASE WHEN om.fecha_real >= CURRENT_DATE - INTERVAL '180 days' AND NOT om.es_outlier THEN om.unidades_factura ELSE 0 END) AS u_aj_180d,
    BOOL_OR(om.fecha_real >= CURRENT_DATE - INTERVAL '90 days' AND om.es_outlier) AS tiene_outliers_90d
  FROM outliers_marcados om GROUP BY om.codigo_interno
),
leadtime_dedupe AS (
  SELECT DISTINCT ON (UPPER(TRIM(proveedor))) UPPER(TRIM(proveedor)) AS prov_key, lead_time_dias, tipo
  FROM proveedores_leadtime WHERE activo = TRUE
  ORDER BY UPPER(TRIM(proveedor)), lead_time_dias ASC
),
aprob_activa AS (
  -- Última aprobación activa (aprobado o ya en_orden) por SKU
  SELECT DISTINCT ON (codigo_interno)
    codigo_interno, id AS aprobacion_id, estado, cantidad_aprobada, aprobado_en, orden_compra_id
  FROM profecias_aprobaciones
  WHERE estado IN ('aprobado','en_orden')
  ORDER BY codigo_interno, aprobado_en DESC
),
base AS (
  SELECT
    mm.codigo                                                       AS codigo_interno,
    mm.nombre                                                       AS item,
    mm.categoria, mm.marca, mm.tipo                                 AS tipo_item,
    COALESCE(NULLIF(TRIM(mm.ultimo_proveedor), ''), 'SIN PROVEEDOR') AS ultimo_proveedor,
    COALESCE(mm.existencias, 0)::numeric                            AS existencias,
    COALESCE(mm.ultimo_costo, 0)::numeric                           AS ultimo_costo,
    COALESCE(mm.moneda, 'CRC')                                      AS moneda,
    COALESCE(mm.minimo, 0)::numeric                                 AS minimo,
    COALESCE(mm.maximo, 0)::numeric                                 AS maximo,
    COALESCE(mm.promedio_mensual, 0)::numeric                       AS promedio_mensual_neo,
    pl.lead_time_dias, pl.tipo                                      AS tipo_proveedor,
    va.primera_venta, va.ultima_venta,
    COALESCE(va.u_30d, 0)::numeric AS u_30d, COALESCE(va.u_90d, 0)::numeric AS u_90d, COALESCE(va.u_180d, 0)::numeric AS u_180d,
    COALESCE(va.u_aj_30d, 0)::numeric AS u_aj_30d, COALESCE(va.u_aj_90d, 0)::numeric AS u_aj_90d, COALESCE(va.u_aj_180d, 0)::numeric AS u_aj_180d,
    COALESCE(va.tiene_outliers_90d, FALSE) AS tiene_outliers_90d,
    me.mediana_factura, me.num_facturas,
    es.clasificacion_manual, es.ciclo_pedido_dias AS ciclo_override, es.safety_stock_dias AS safety_override, es.notas AS notas_estado,
    EXISTS (SELECT 1 FROM items_ocultos_compras oc WHERE oc.codigo = mm.codigo) AS oculto_compras,
    EXISTS (SELECT 1 FROM proveedores_pausados pp WHERE UPPER(TRIM(pp.proveedor)) = UPPER(TRIM(COALESCE(mm.ultimo_proveedor, '')))) AS proveedor_pausado,
    aa.aprobacion_id, aa.estado AS estado_aprobacion_raw, aa.cantidad_aprobada, aa.aprobado_en, aa.orden_compra_id
  FROM neo_minimos_maximos mm
  LEFT JOIN ventas_agg va           ON va.codigo_interno = mm.codigo
  LEFT JOIN medianas me             ON me.codigo_interno = mm.codigo
  LEFT JOIN leadtime_dedupe pl      ON pl.prov_key       = UPPER(TRIM(COALESCE(mm.ultimo_proveedor, '')))
  LEFT JOIN profecias_estado_skus es ON es.codigo_interno = mm.codigo
  LEFT JOIN aprob_activa aa          ON aa.codigo_interno = mm.codigo
  WHERE mm.activo = 'Sí'
    AND COALESCE(mm.nombre, '')    NOT ILIKE '%transporte%'
    AND COALESCE(mm.nombre, '')    NOT ILIKE '%patrocinio%'
    AND COALESCE(mm.categoria, '') NOT ILIKE '%transporte%'
    AND COALESCE(mm.categoria, '') NOT ILIKE '%patrocinio%'
),
calc AS (
  SELECT b.*, COALESCE(b.lead_time_dias, 30) AS lead_time_eff, COALESCE(b.tipo_proveedor, 'nacional') AS tipo_prov_eff,
    CASE WHEN b.primera_venta IS NULL THEN 0 ELSE GREATEST(1, (CURRENT_DATE - b.primera_venta))::int END AS dias_vida_calc
  FROM base b
),
calc_vel AS (
  SELECT c.*,
    CASE WHEN c.dias_vida_calc < 7  THEN NULL ELSE c.u_30d  / GREATEST(LEAST(30,  c.dias_vida_calc), 1)::numeric * 30 END AS velocidad_30d_raw,
    CASE WHEN c.dias_vida_calc < 14 THEN NULL ELSE c.u_90d  / GREATEST(LEAST(90,  c.dias_vida_calc), 1)::numeric * 30 END AS velocidad_90d_raw,
    CASE WHEN c.dias_vida_calc < 30 THEN NULL ELSE c.u_180d / GREATEST(LEAST(180, c.dias_vida_calc), 1)::numeric * 30 END AS velocidad_180d_raw,
    CASE WHEN c.dias_vida_calc < 7  THEN NULL ELSE c.u_aj_30d  / GREATEST(LEAST(30,  c.dias_vida_calc), 1)::numeric * 30 END AS velocidad_aj_30d_raw,
    CASE WHEN c.dias_vida_calc < 14 THEN NULL ELSE c.u_aj_90d  / GREATEST(LEAST(90,  c.dias_vida_calc), 1)::numeric * 30 END AS velocidad_aj_90d_raw,
    CASE WHEN c.dias_vida_calc < 30 THEN NULL ELSE c.u_aj_180d / GREATEST(LEAST(180, c.dias_vida_calc), 1)::numeric * 30 END AS velocidad_aj_180d_raw
  FROM calc c
),
calc2 AS (
  SELECT c.*,
    CASE
      WHEN c.dias_vida_calc = 0 OR c.primera_venta IS NULL THEN 'sin_ventas'
      WHEN c.dias_vida_calc <= 30 THEN 'recien_nacido'
      WHEN c.dias_vida_calc <= 90 THEN 'validacion'
      WHEN c.dias_vida_calc <= 180 THEN 'joven'
      ELSE 'maduro'
    END AS madurez,
    CASE WHEN c.velocidad_180d_raw > 0 THEN ROUND(((c.velocidad_90d_raw - c.velocidad_180d_raw) / c.velocidad_180d_raw * 100)::numeric, 2) ELSE 0 END AS tendencia_pct
  FROM calc_vel c
),
calc3 AS (
  SELECT c.*,
    CASE
      WHEN c.dias_vida_calc < 7 THEN NULL
      WHEN c.madurez = 'sin_ventas' THEN 0
      WHEN c.madurez = 'recien_nacido' THEN COALESCE(c.velocidad_aj_30d_raw, c.velocidad_30d_raw) * (SELECT factor_recien_nacido_conservador FROM cfg)
      WHEN c.madurez = 'validacion'    THEN COALESCE(c.velocidad_aj_90d_raw, c.velocidad_90d_raw, c.velocidad_aj_30d_raw, c.velocidad_30d_raw)
      WHEN c.madurez = 'joven'         THEN COALESCE(c.velocidad_aj_90d_raw, c.velocidad_90d_raw) * 0.7 + COALESCE(c.velocidad_aj_180d_raw, c.velocidad_180d_raw, c.velocidad_aj_90d_raw, c.velocidad_90d_raw) * 0.3
      WHEN c.madurez = 'maduro' THEN
        CASE
          WHEN c.tendencia_pct > 20  THEN COALESCE(c.velocidad_aj_90d_raw, c.velocidad_90d_raw) * (1 + LEAST(c.tendencia_pct * 0.005, 0.3))
          WHEN c.tendencia_pct < -20 THEN COALESCE(c.velocidad_aj_180d_raw, c.velocidad_180d_raw)
          ELSE COALESCE(c.velocidad_aj_90d_raw, c.velocidad_90d_raw) * 0.6 + COALESCE(c.velocidad_aj_180d_raw, c.velocidad_180d_raw) * 0.4
        END
    END AS demanda_base
  FROM calc2 c
),
calc4 AS (
  SELECT c.*,
    CASE
      WHEN c.demanda_base IS NULL THEN NULL
      WHEN c.clasificacion_manual = 'en_promocion'         THEN c.demanda_base * (SELECT factor_ajuste_promocion FROM cfg)
      WHEN c.clasificacion_manual = 'dormido_discontinuar' THEN 0
      ELSE c.demanda_base
    END AS demanda_proyectada,
    COALESCE(c.safety_override,
      CASE c.tipo_prov_eff WHEN 'extranjero' THEN (SELECT safety_stock_dias_extranjero FROM cfg) ELSE (SELECT safety_stock_dias_nacional FROM cfg) END
    ) AS safety_stock_dias,
    COALESCE(c.ciclo_override,
      CASE c.tipo_prov_eff WHEN 'extranjero' THEN (SELECT ciclo_pedido_dias_extranjero FROM cfg) ELSE (SELECT ciclo_pedido_dias_nacional FROM cfg) END
    ) AS ciclo_pedido_dias
  FROM calc3 c
),
calc5 AS (
  SELECT c.*,
    CASE WHEN c.demanda_proyectada IS NULL THEN NULL ELSE ROUND(((c.lead_time_eff + c.safety_stock_dias) / 30.0 * c.demanda_proyectada)::numeric, 2) END AS punto_reorden,
    CASE WHEN c.demanda_proyectada IS NULL THEN NULL ELSE ROUND(GREATEST(0, (c.lead_time_eff + c.safety_stock_dias + c.ciclo_pedido_dias) / 30.0 * c.demanda_proyectada - c.existencias)::numeric, 2) END AS cantidad_sugerida,
    CASE WHEN c.demanda_proyectada IS NULL OR c.demanda_proyectada = 0 THEN NULL ELSE ROUND((c.existencias / c.demanda_proyectada)::numeric, 2) END AS meses_cobertura
  FROM calc4 c
)
SELECT
  c.codigo_interno, c.item, c.categoria, c.marca, c.tipo_item, c.ultimo_proveedor,
  c.tipo_prov_eff AS tipo_proveedor, c.lead_time_eff AS lead_time_dias,
  c.existencias, c.ultimo_costo, c.moneda, c.minimo, c.maximo, c.promedio_mensual_neo,
  c.primera_venta, c.ultima_venta, c.dias_vida_calc AS dias_vida,
  ROUND(c.u_30d::numeric, 0) AS vendido_30d, ROUND(c.u_90d::numeric, 0) AS vendido_90d, ROUND(c.u_180d::numeric, 0) AS vendido_180d,
  c.u_30d, c.u_90d, c.u_180d,
  ROUND(c.velocidad_30d_raw::numeric,  2) AS velocidad_30d,
  ROUND(c.velocidad_90d_raw::numeric,  2) AS velocidad_90d,
  ROUND(c.velocidad_180d_raw::numeric, 2) AS velocidad_180d,
  ROUND(c.velocidad_aj_30d_raw::numeric,  2) AS velocidad_ajustada_30d,
  ROUND(c.velocidad_aj_90d_raw::numeric,  2) AS velocidad_ajustada_90d,
  ROUND(c.velocidad_aj_180d_raw::numeric, 2) AS velocidad_ajustada_180d,
  c.tendencia_pct, c.madurez,
  COALESCE(c.clasificacion_manual, 'normal') AS clasificacion_manual, c.notas_estado,
  CASE WHEN c.demanda_proyectada IS NULL THEN NULL ELSE ROUND(c.demanda_proyectada::numeric, 2) END AS demanda_proyectada,
  c.safety_stock_dias, c.ciclo_pedido_dias, c.punto_reorden, c.cantidad_sugerida, c.meses_cobertura,
  (c.dias_vida_calc < 7) AS datos_insuficientes, c.tiene_outliers_90d AS tiene_outliers,
  ROUND(c.mediana_factura::numeric, 2) AS mediana_factura, c.num_facturas,
  CASE
    WHEN c.demanda_proyectada IS NULL                   THEN 'gris_sin_datos'
    WHEN c.demanda_proyectada = 0 AND c.existencias = 0 THEN 'gris_sin_datos'
    WHEN c.demanda_proyectada = 0 AND c.existencias > 0 THEN 'gris_sin_demanda'
    WHEN c.existencias = 0                              THEN 'rojo_critico'
    WHEN c.existencias < (c.lead_time_eff / 30.0 * c.demanda_proyectada) THEN 'rojo'
    WHEN c.existencias < c.punto_reorden                THEN 'amarillo'
    WHEN c.meses_cobertura > 12                         THEN 'gris_excedente'
    ELSE 'verde'
  END AS semaforo,
  CASE
    WHEN c.dias_vida_calc < 7        THEN 'manual'
    WHEN c.madurez = 'sin_ventas'    THEN 'manual'
    WHEN c.madurez = 'recien_nacido' THEN 'manual'
    WHEN c.madurez = 'validacion'    THEN 'baja'
    WHEN c.madurez = 'joven'         THEN 'media'
    WHEN c.madurez = 'maduro'        THEN 'alta'
  END AS confianza,
  (c.ultima_venta IS NOT NULL AND (CURRENT_DATE - c.ultima_venta) > (SELECT dias_alerta_stockout FROM cfg) AND c.existencias = 0) AS bandera_stockout,
  (c.ultima_venta IS NOT NULL AND (CURRENT_DATE - c.ultima_venta) > (SELECT dias_alerta_descontinuar FROM cfg) AND c.existencias > 0) AS bandera_discontinuar,
  c.oculto_compras, c.proveedor_pausado,
  COALESCE(c.estado_aprobacion_raw, 'sin_decidir') AS estado_aprobacion,
  c.aprobacion_id, c.cantidad_aprobada, c.aprobado_en, c.orden_compra_id,
  NOW() AS calculado_en
FROM calc5 c;

CREATE UNIQUE INDEX idx_profecias_panel_codigo    ON profecias_panel(codigo_interno);
CREATE INDEX        idx_profecias_panel_proveedor ON profecias_panel(ultimo_proveedor);
CREATE INDEX        idx_profecias_panel_semaforo  ON profecias_panel(semaforo);
CREATE INDEX        idx_profecias_panel_madurez   ON profecias_panel(madurez);
CREATE INDEX        idx_profecias_panel_categoria ON profecias_panel(categoria);
CREATE INDEX        idx_profecias_panel_estadoap  ON profecias_panel(estado_aprobacion);

CREATE OR REPLACE FUNCTION refresh_profecias_panel()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY profecias_panel;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION refresh_profecias_panel() TO authenticated, anon;
GRANT SELECT ON profecias_panel TO authenticated, anon;
