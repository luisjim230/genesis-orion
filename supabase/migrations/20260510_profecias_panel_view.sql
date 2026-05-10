-- ============================================================
-- Migración: Vista materializada profecias_panel
-- Fecha: 2026-05-10
-- ============================================================
-- Núcleo de cálculo del módulo Profecías.
-- - Velocidades adaptativas (dividen por días de vida efectivos, no períodos fijos)
-- - Madurez por edad de catálogo
-- - Demanda proyectada según madurez + clasificación manual
-- - Punto de reorden, cantidad sugerida, semáforo, confianza
-- - Refresh CONCURRENTLY apto (índice UNIQUE en codigo_interno)
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS profecias_panel CASCADE;

CREATE MATERIALIZED VIEW profecias_panel AS
WITH
cfg AS (
  SELECT * FROM profecias_config WHERE id = 1
),
ventas_agg AS (
  SELECT
    codigo_interno,
    MIN(fecha_real) AS primera_venta,
    MAX(fecha_real) AS ultima_venta,
    SUM(CASE WHEN fecha_real >= CURRENT_DATE - INTERVAL '30 days'
             THEN GREATEST(COALESCE(cantidad_facturada,0) - COALESCE(cantidad_devuelta,0), 0) ELSE 0 END) AS u_30d,
    SUM(CASE WHEN fecha_real >= CURRENT_DATE - INTERVAL '90 days'
             THEN GREATEST(COALESCE(cantidad_facturada,0) - COALESCE(cantidad_devuelta,0), 0) ELSE 0 END) AS u_90d,
    SUM(CASE WHEN fecha_real >= CURRENT_DATE - INTERVAL '180 days'
             THEN GREATEST(COALESCE(cantidad_facturada,0) - COALESCE(cantidad_devuelta,0), 0) ELSE 0 END) AS u_180d
  FROM neo_items_facturados
  WHERE fecha_real IS NOT NULL
  GROUP BY codigo_interno
),
leadtime_dedupe AS (
  SELECT DISTINCT ON (UPPER(TRIM(proveedor)))
    UPPER(TRIM(proveedor)) AS prov_key,
    lead_time_dias,
    tipo
  FROM proveedores_leadtime
  WHERE activo = TRUE
  ORDER BY UPPER(TRIM(proveedor)), lead_time_dias ASC
),
base AS (
  SELECT
    mm.codigo                                                       AS codigo_interno,
    mm.nombre                                                       AS item,
    mm.categoria,
    mm.marca,
    mm.tipo                                                         AS tipo_item,
    COALESCE(NULLIF(TRIM(mm.ultimo_proveedor), ''), 'SIN PROVEEDOR') AS ultimo_proveedor,
    COALESCE(mm.existencias, 0)::numeric                            AS existencias,
    COALESCE(mm.ultimo_costo, 0)::numeric                           AS ultimo_costo,
    COALESCE(mm.moneda, 'CRC')                                      AS moneda,
    COALESCE(mm.minimo, 0)::numeric                                 AS minimo,
    COALESCE(mm.maximo, 0)::numeric                                 AS maximo,
    COALESCE(mm.promedio_mensual, 0)::numeric                       AS promedio_mensual_neo,
    pl.lead_time_dias,
    pl.tipo                                                         AS tipo_proveedor,
    va.primera_venta,
    va.ultima_venta,
    COALESCE(va.u_30d,  0)::numeric AS u_30d,
    COALESCE(va.u_90d,  0)::numeric AS u_90d,
    COALESCE(va.u_180d, 0)::numeric AS u_180d,
    es.clasificacion_manual,
    es.ciclo_pedido_dias            AS ciclo_override,
    es.safety_stock_dias            AS safety_override,
    es.notas                        AS notas_estado,
    EXISTS (SELECT 1 FROM items_ocultos_compras oc WHERE oc.codigo = mm.codigo)                                                               AS oculto_compras,
    EXISTS (SELECT 1 FROM proveedores_pausados pp WHERE UPPER(TRIM(pp.proveedor)) = UPPER(TRIM(COALESCE(mm.ultimo_proveedor, ''))))           AS proveedor_pausado
  FROM neo_minimos_maximos mm
  LEFT JOIN ventas_agg          va ON va.codigo_interno = mm.codigo
  LEFT JOIN leadtime_dedupe     pl ON pl.prov_key       = UPPER(TRIM(COALESCE(mm.ultimo_proveedor, '')))
  LEFT JOIN profecias_estado_skus es ON es.codigo_interno = mm.codigo
  WHERE mm.activo = 'Sí'
),
calc AS (
  SELECT
    b.*,
    COALESCE(b.lead_time_dias, 30)         AS lead_time_eff,
    COALESCE(b.tipo_proveedor, 'nacional') AS tipo_prov_eff,
    CASE WHEN b.primera_venta IS NULL THEN 0
         ELSE GREATEST(1, (CURRENT_DATE - b.primera_venta))::int END AS dias_vida,
    CASE WHEN b.primera_venta IS NULL THEN 0
         ELSE b.u_30d  / GREATEST(LEAST(30,  GREATEST(1, (CURRENT_DATE - b.primera_venta))), 1)::numeric * 30 END AS velocidad_30d,
    CASE WHEN b.primera_venta IS NULL THEN 0
         ELSE b.u_90d  / GREATEST(LEAST(90,  GREATEST(1, (CURRENT_DATE - b.primera_venta))), 1)::numeric * 30 END AS velocidad_90d,
    CASE WHEN b.primera_venta IS NULL THEN 0
         ELSE b.u_180d / GREATEST(LEAST(180, GREATEST(1, (CURRENT_DATE - b.primera_venta))), 1)::numeric * 30 END AS velocidad_180d
  FROM base b
),
calc2 AS (
  SELECT
    c.*,
    CASE
      WHEN c.dias_vida = 0 OR c.primera_venta IS NULL THEN 'sin_ventas'
      WHEN c.dias_vida <= 30  THEN 'recien_nacido'
      WHEN c.dias_vida <= 90  THEN 'validacion'
      WHEN c.dias_vida <= 180 THEN 'joven'
      ELSE 'maduro'
    END AS madurez,
    CASE WHEN c.velocidad_180d > 0
         THEN ROUND(((c.velocidad_90d - c.velocidad_180d) / c.velocidad_180d * 100)::numeric, 2)
         ELSE 0
    END AS tendencia_pct
  FROM calc c
),
calc3 AS (
  SELECT
    c.*,
    CASE c.madurez
      WHEN 'sin_ventas'    THEN 0
      WHEN 'recien_nacido' THEN c.velocidad_30d * (SELECT factor_recien_nacido_conservador FROM cfg)
      WHEN 'validacion'    THEN c.velocidad_90d
      WHEN 'joven'         THEN c.velocidad_90d * 0.7 + c.velocidad_180d * 0.3
      WHEN 'maduro'        THEN
        CASE
          WHEN c.tendencia_pct > 20  THEN c.velocidad_90d * (1 + LEAST(c.tendencia_pct * 0.005, 0.3))
          WHEN c.tendencia_pct < -20 THEN c.velocidad_180d
          ELSE c.velocidad_90d * 0.6 + c.velocidad_180d * 0.4
        END
    END AS demanda_base
  FROM calc2 c
),
calc4 AS (
  SELECT
    c.*,
    CASE
      WHEN c.clasificacion_manual = 'en_promocion'         THEN c.demanda_base * (SELECT factor_ajuste_promocion FROM cfg)
      WHEN c.clasificacion_manual = 'dormido_discontinuar' THEN 0
      ELSE c.demanda_base
    END AS demanda_proyectada,
    COALESCE(
      c.safety_override,
      CASE c.tipo_prov_eff
        WHEN 'extranjero' THEN (SELECT safety_stock_dias_extranjero FROM cfg)
        ELSE                    (SELECT safety_stock_dias_nacional FROM cfg)
      END
    ) AS safety_stock_dias,
    COALESCE(
      c.ciclo_override,
      CASE c.tipo_prov_eff
        WHEN 'extranjero' THEN (SELECT ciclo_pedido_dias_extranjero FROM cfg)
        ELSE                    (SELECT ciclo_pedido_dias_nacional FROM cfg)
      END
    ) AS ciclo_pedido_dias
  FROM calc3 c
),
calc5 AS (
  SELECT
    c.*,
    ROUND(((c.lead_time_eff + c.safety_stock_dias) / 30.0 * c.demanda_proyectada)::numeric, 2) AS punto_reorden,
    ROUND(GREATEST(
      0,
      (c.lead_time_eff + c.safety_stock_dias + c.ciclo_pedido_dias) / 30.0 * c.demanda_proyectada - c.existencias
    )::numeric, 2) AS cantidad_sugerida,
    CASE WHEN c.demanda_proyectada > 0
         THEN ROUND((c.existencias / c.demanda_proyectada)::numeric, 2)
         ELSE NULL
    END AS meses_cobertura
  FROM calc4 c
)
SELECT
  c.codigo_interno,
  c.item,
  c.categoria,
  c.marca,
  c.tipo_item,
  c.ultimo_proveedor,
  c.tipo_prov_eff                            AS tipo_proveedor,
  c.lead_time_eff                            AS lead_time_dias,
  c.existencias,
  c.ultimo_costo,
  c.moneda,
  c.minimo,
  c.maximo,
  c.promedio_mensual_neo,
  c.primera_venta,
  c.ultima_venta,
  c.dias_vida,
  c.u_30d,
  c.u_90d,
  c.u_180d,
  ROUND(c.velocidad_30d::numeric, 2)         AS velocidad_30d,
  ROUND(c.velocidad_90d::numeric, 2)         AS velocidad_90d,
  ROUND(c.velocidad_180d::numeric, 2)        AS velocidad_180d,
  c.tendencia_pct,
  c.madurez,
  COALESCE(c.clasificacion_manual, 'normal') AS clasificacion_manual,
  c.notas_estado,
  ROUND(c.demanda_proyectada::numeric, 2)    AS demanda_proyectada,
  c.safety_stock_dias,
  c.ciclo_pedido_dias,
  c.punto_reorden,
  c.cantidad_sugerida,
  c.meses_cobertura,
  CASE
    WHEN c.demanda_proyectada = 0 AND c.existencias = 0 THEN 'gris_sin_datos'
    WHEN c.demanda_proyectada = 0 AND c.existencias > 0 THEN 'gris_sin_demanda'
    WHEN c.existencias = 0                              THEN 'rojo_critico'
    WHEN c.existencias < (c.lead_time_eff / 30.0 * c.demanda_proyectada) THEN 'rojo'
    WHEN c.existencias < c.punto_reorden                THEN 'amarillo'
    WHEN c.meses_cobertura > 12                         THEN 'gris_excedente'
    ELSE 'verde'
  END AS semaforo,
  CASE c.madurez
    WHEN 'sin_ventas'    THEN 'manual'
    WHEN 'recien_nacido' THEN 'manual'
    WHEN 'validacion'    THEN 'baja'
    WHEN 'joven'         THEN 'media'
    WHEN 'maduro'        THEN 'alta'
  END AS confianza,
  (c.ultima_venta IS NOT NULL
    AND (CURRENT_DATE - c.ultima_venta) > (SELECT dias_alerta_stockout FROM cfg)
    AND c.existencias = 0) AS bandera_stockout,
  (c.ultima_venta IS NOT NULL
    AND (CURRENT_DATE - c.ultima_venta) > (SELECT dias_alerta_descontinuar FROM cfg)
    AND c.existencias > 0) AS bandera_discontinuar,
  c.oculto_compras,
  c.proveedor_pausado,
  NOW() AS calculado_en
FROM calc5 c;

CREATE UNIQUE INDEX idx_profecias_panel_codigo    ON profecias_panel(codigo_interno);
CREATE INDEX        idx_profecias_panel_proveedor ON profecias_panel(ultimo_proveedor);
CREATE INDEX        idx_profecias_panel_semaforo  ON profecias_panel(semaforo);
CREATE INDEX        idx_profecias_panel_madurez   ON profecias_panel(madurez);
CREATE INDEX        idx_profecias_panel_categoria ON profecias_panel(categoria);

CREATE OR REPLACE FUNCTION refresh_profecias_panel()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY profecias_panel;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION refresh_profecias_panel() TO authenticated, anon;
GRANT SELECT ON profecias_panel TO authenticated, anon;
