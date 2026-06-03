-- ============================================================
-- Migración: Revisión de Compras v2 — anti-ruido + fecha de compra
-- Fecha: 2026-06-03
-- ============================================================
-- Ajustes pedidos por Luis tras la primera versión:
--   1) "Ya lo revisé" debe sacar la fila de verdad y de forma DURABLE
--      (antes la dejaba 'marcado' y la seguía mostrando atenuada).
--   2) Los avisos de "utilidad inflada" se quedaban pegados para siempre
--      porque dependían de comparar costo vivo vs costo congelado. Ahora
--      se auto-resuelven cuando el markup vuelve a la meta (Luis bajó el
--      precio) y se pueden descartar de forma durable.
--   3) Menos ruido: lo que está OK / sano ya no genera fila.
--   4) Se expone la fecha de la última compra para verificar frescura.
--
-- Reglas de la máquina de estados:
--   - Crítico (pérdida o bajo el piso): SIEMPRE reabre, aunque esté
--     'resuelto'. No se silencia solo (para silenciar: Ocultar).
--   - "Cayó bajo meta" e "inflada": se pueden descartar durable con
--     "Ya lo revisé" (estado 'resuelto'); reaparecen solo si se vuelven
--     críticas.
--   - Auto-resolución: una alerta previa que ya se corrigió (subió o
--     bajó el precio según el caso) pasa a 'resuelto'.
-- ============================================================

CREATE OR REPLACE FUNCTION public.recalcular_revision_compras()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_piso       NUMERIC;
  v_umbral     NUMERIC;
  v_umbral_sup NUMERIC;
  v_ultima     TIMESTAMPTZ;
  v_count      INT;
BEGIN
  SELECT COALESCE(piso_pp,20), COALESCE(umbral_pp,10), COALESCE(umbral_superior_pp,15)
    INTO v_piso, v_umbral, v_umbral_sup
    FROM pricing_revision_settings WHERE id = 1;
  IF v_piso IS NULL THEN
    v_piso := 20; v_umbral := 10; v_umbral_sup := 15;
  END IF;

  SELECT MAX(fecha_carga) INTO v_ultima FROM neo_items_comprados;
  IF v_ultima IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'procesados', 0, 'motivo', 'sin compras');
  END IF;

  WITH comprados_raw AS (
    SELECT
      codigo_interno, item, proveedor, categoria,
      CASE WHEN fecha ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(fecha,'DD/MM/YYYY') END AS fecha_d,
      cantidad_comprada, costo_unitario_actual, costo_unitario_compra,
      precio_unitario_actual, id
    FROM neo_items_comprados
    WHERE fecha_carga = v_ultima AND codigo_interno IS NOT NULL
  ),
  hist AS (
    SELECT
      id, codigo_interno,
      LAG(costo_unitario_compra) OVER (
        PARTITION BY codigo_interno
        ORDER BY (CASE WHEN fecha ~ '^\d{2}/\d{2}/\d{4}$' THEN to_date(fecha,'DD/MM/YYYY') END) NULLS FIRST, id
      ) AS costo_compra_prev
    FROM neo_items_comprados
    WHERE (fecha ~ '^\d{2}/\d{2}/\d{4}$'
           AND to_date(fecha,'DD/MM/YYYY') >= CURRENT_DATE - INTERVAL '45 days')
       OR fecha_carga = v_ultima
  ),
  rep AS (
    SELECT DISTINCT ON (codigo_interno)
      codigo_interno, item, proveedor, categoria, fecha_d,
      costo_unitario_actual, costo_unitario_compra, precio_unitario_actual, id
    FROM comprados_raw
    ORDER BY codigo_interno, fecha_d DESC NULLS LAST, id DESC
  ),
  viva AS (
    SELECT DISTINCT ON (codigo_interno)
      codigo_interno, precio_sin_imp, costo_sin_imp
    FROM neo_lista_items
    ORDER BY codigo_interno, fecha_carga DESC NULLS LAST
  ),
  existing AS (
    SELECT codigo_interno, markup_meta_pct, detectado_en, estado, resuelto_en
    FROM pricing_revision_compras
  ),
  calc AS (
    SELECT
      r.codigo_interno, r.item, r.proveedor, r.categoria, r.fecha_d AS fecha_compra,
      COALESCE(h.costo_compra_prev, r.costo_unitario_actual) AS costo_anterior,
      r.costo_unitario_compra AS costo_compra,
      r.precio_unitario_actual AS precio_meta_capturado,
      v.precio_sin_imp AS precio_vivo,
      v.costo_sin_imp  AS costo_vivo,
      CASE WHEN v.costo_sin_imp > 0
           THEN (v.precio_sin_imp - v.costo_sin_imp) / v.costo_sin_imp * 100 END AS markup_actual,
      CASE WHEN v.precio_sin_imp > 0
           THEN (v.precio_sin_imp - v.costo_sin_imp) / v.precio_sin_imp * 100 END AS margen_actual,
      COALESCE(
        th.markup_meta_pct,
        e.markup_meta_pct,
        CASE WHEN r.costo_unitario_actual > 0 AND r.precio_unitario_actual > 1
             THEN (r.precio_unitario_actual - r.costo_unitario_actual) / r.costo_unitario_actual * 100 END
      ) AS meta,
      e.estado AS estado_prev,
      e.detectado_en AS detectado_prev,
      e.resuelto_en AS resuelto_prev,
      (COALESCE(h.costo_compra_prev, r.costo_unitario_actual) <= 0
       OR COALESCE(r.precio_unitario_actual,0) <= 1) AS guard
    FROM rep r
    LEFT JOIN hist h ON h.id = r.id
    LEFT JOIN viva v ON v.codigo_interno = r.codigo_interno
    LEFT JOIN existing e ON e.codigo_interno = r.codigo_interno
    LEFT JOIN pricing_thresholds_skus th ON th.codigo_interno = r.codigo_interno
  ),
  flags AS (
    SELECT c.*,
      (c.markup_actual < 0) AS es_perdida,
      (c.markup_actual >= 0 AND c.markup_actual < v_piso) AS es_bajo_piso,
      (c.meta IS NOT NULL AND c.markup_actual >= v_piso AND c.markup_actual < c.meta - v_umbral) AS es_cayo,
      (c.meta IS NOT NULL AND (
          c.markup_actual > c.meta + v_umbral_sup
          OR (c.costo_anterior > 0 AND c.costo_vivo < c.costo_anterior * 0.85 AND c.markup_actual > c.meta + v_umbral)
      )) AS es_inflada
    FROM calc c
  ),
  estados AS (
    SELECT f.*,
      (f.es_perdida OR f.es_bajo_piso) AS es_critica,
      (f.es_perdida OR f.es_bajo_piso OR f.es_cayo OR f.es_inflada) AS es_alerta,
      CASE
        WHEN f.guard OR f.markup_actual IS NULL THEN
          CASE WHEN f.estado_prev = 'resuelto' THEN 'resuelto' ELSE 'ok' END
        WHEN (f.es_perdida OR f.es_bajo_piso) THEN
          CASE WHEN f.estado_prev = 'marcado' THEN 'marcado' ELSE 'pendiente' END
        WHEN f.estado_prev = 'resuelto' THEN 'resuelto'
        WHEN f.estado_prev IN ('pendiente','marcado')
             AND NOT (f.es_perdida OR f.es_bajo_piso OR f.es_cayo OR f.es_inflada) THEN 'resuelto'
        WHEN f.estado_prev = 'inflada' AND NOT f.es_inflada THEN 'resuelto'
        WHEN f.es_cayo THEN
          CASE WHEN f.estado_prev = 'marcado' THEN 'marcado' ELSE 'pendiente' END
        WHEN f.es_inflada THEN
          CASE WHEN f.estado_prev = 'marcado' THEN 'marcado' ELSE 'inflada' END
        ELSE 'ok'
      END AS estado_new
    FROM flags f
  ),
  final AS (
    SELECT s.*,
      CASE
        WHEN s.es_inflada AND s.meta IS NOT NULL AND s.costo_vivo > 0
          THEN CEIL((s.costo_vivo * (1 + s.meta/100.0)) / 5.0) * 5
        WHEN s.costo_vivo > 0
          THEN CEIL((s.costo_vivo * (1 + GREATEST(COALESCE(s.meta, v_piso), v_piso)/100.0)) / 5.0) * 5
        ELSE NULL
      END AS precio_sugerido,
      CASE WHEN s.estado_new = 'resuelto' THEN COALESCE(s.resuelto_prev, NOW())
           ELSE NULL END AS resuelto_en_new
    FROM estados s
  )
  INSERT INTO pricing_revision_compras (
    codigo_interno, item, proveedor, categoria, fecha_compra,
    costo_anterior, costo_compra, markup_meta_pct, precio_meta_capturado,
    markup_actual_pct, margen_actual_pct, precio_sugerido, estado,
    detectado_en, resuelto_en, actualizado_en
  )
  SELECT
    f.codigo_interno, f.item, f.proveedor, f.categoria, f.fecha_compra,
    ROUND(f.costo_anterior::numeric, 4), ROUND(f.costo_compra::numeric, 4),
    ROUND(f.meta::numeric, 4), ROUND(f.precio_meta_capturado::numeric, 4),
    ROUND(f.markup_actual::numeric, 4), ROUND(f.margen_actual::numeric, 4),
    f.precio_sugerido, f.estado_new,
    COALESCE(f.detectado_prev, NOW()), f.resuelto_en_new, NOW()
  FROM final f
  ON CONFLICT (codigo_interno) DO UPDATE SET
    item                  = EXCLUDED.item,
    proveedor             = EXCLUDED.proveedor,
    categoria             = EXCLUDED.categoria,
    fecha_compra          = EXCLUDED.fecha_compra,
    costo_anterior        = EXCLUDED.costo_anterior,
    costo_compra          = EXCLUDED.costo_compra,
    markup_meta_pct       = EXCLUDED.markup_meta_pct,
    precio_meta_capturado = EXCLUDED.precio_meta_capturado,
    markup_actual_pct     = EXCLUDED.markup_actual_pct,
    margen_actual_pct     = EXCLUDED.margen_actual_pct,
    precio_sugerido       = EXCLUDED.precio_sugerido,
    estado                = EXCLUDED.estado,
    resuelto_en           = EXCLUDED.resuelto_en,
    actualizado_en        = NOW();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'procesados', v_count, 'ultima_carga', v_ultima);
END $fn$;

-- Vista del día: agrega ultima_compra (catálogo vivo) para verificar frescura.
-- Cambia la firma (nueva columna) => hay que dropear primero.
DROP FUNCTION IF EXISTS public.pricing_revision_compras_dia();
CREATE OR REPLACE FUNCTION public.pricing_revision_compras_dia()
RETURNS TABLE (
  codigo_interno    TEXT,
  item              TEXT,
  proveedor         TEXT,
  categoria         TEXT,
  fecha_compra      DATE,
  ultima_compra     TEXT,
  cantidad          NUMERIC,
  costo_anterior    NUMERIC,
  costo_compra      NUMERIC,
  costo_vivo        NUMERIC,
  precio_vivo       NUMERIC,
  markup_meta_pct   NUMERIC,
  markup_actual_pct NUMERIC,
  margen_actual_pct NUMERIC,
  precio_sugerido   NUMERIC,
  estado            TEXT,
  detectado_en      TIMESTAMPTZ,
  resuelto_en       TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $fn$
  WITH ult AS (SELECT MAX(fecha_carga) AS fc FROM neo_items_comprados),
  dia AS (
    SELECT c.codigo_interno, SUM(COALESCE(c.cantidad_comprada,0)) AS cantidad
    FROM neo_items_comprados c, ult
    WHERE c.fecha_carga = ult.fc AND c.codigo_interno IS NOT NULL
    GROUP BY c.codigo_interno
  ),
  viva AS (
    SELECT DISTINCT ON (codigo_interno) codigo_interno, precio_sin_imp, costo_sin_imp, ultima_compra
    FROM neo_lista_items
    ORDER BY codigo_interno, fecha_carga DESC NULLS LAST
  )
  SELECT
    r.codigo_interno, r.item, r.proveedor, r.categoria, r.fecha_compra,
    v.ultima_compra,
    d.cantidad,
    r.costo_anterior, r.costo_compra, v.costo_sin_imp, v.precio_sin_imp,
    r.markup_meta_pct, r.markup_actual_pct, r.margen_actual_pct,
    r.precio_sugerido, r.estado, r.detectado_en, r.resuelto_en
  FROM dia d
  JOIN pricing_revision_compras r ON r.codigo_interno = d.codigo_interno
  LEFT JOIN viva v ON v.codigo_interno = d.codigo_interno
  LEFT JOIN items_ocultos_compras o ON o.codigo = d.codigo_interno
  WHERE o.codigo IS NULL
    AND r.estado <> 'resuelto'
    AND r.estado <> 'ok';
$fn$;

GRANT EXECUTE ON FUNCTION public.pricing_revision_compras_dia() TO authenticated, anon, service_role;
