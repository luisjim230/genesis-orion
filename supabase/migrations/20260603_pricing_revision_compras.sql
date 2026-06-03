-- ============================================================
-- Migración: Pricing → Revisión de Compras
-- Fecha: 2026-06-03
-- ============================================================
-- Crea:
--   1) Tabla  pricing_revision_compras    -> estado persistente por SKU
--   2) Tabla  pricing_revision_settings   -> umbrales editables (piso, caída, inflada)
--   3) ALTER  pricing_thresholds_skus     -> + columna markup_meta_pct (override)
--   4) Func   recalcular_revision_compras()  -> recalcula y upsertea (SECURITY DEFINER)
--   5) Func   pricing_revision_compras_dia() -> lee la vista "Compras del día"
--   6) Func   pricing_barrido_catalogo(piso) -> lee el "Barrido del catálogo"
-- ------------------------------------------------------------
-- Regla de oro: NEO es dueño de los precios. Génesis SOLO lee.
-- Esta feature sugiere/verifica; el precio se cambia a mano en NEO.
-- Todos los cálculos de markup/margen son SIN IVA (precio_sin_imp / costo_sin_imp).
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Tabla: pricing_revision_compras
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_revision_compras (
  codigo_interno         TEXT PRIMARY KEY,
  item                   TEXT,
  proveedor              TEXT,
  categoria              TEXT,
  fecha_compra           DATE,
  costo_anterior         NUMERIC,      -- costo antes de la compra (LAG real, o comprados.costo_unitario_actual)
  costo_compra           NUMERIC,      -- costo de esta compra (comprados.costo_unitario_compra)
  markup_meta_pct        NUMERIC,      -- META ESTABLE, capturada 1 sola vez
  precio_meta_capturado  NUMERIC,      -- precio congelado al detectar (auditoría)
  markup_actual_pct      NUMERIC,      -- recalculado en cada corrida desde la lista viva
  margen_actual_pct      NUMERIC,      -- idem, recalculado
  precio_sugerido        NUMERIC,      -- recalculado en cada corrida
  estado                 TEXT NOT NULL DEFAULT 'pendiente',
                                       -- 'pendiente' | 'marcado' | 'resuelto' | 'ok' | 'oportunidad' | 'sano' | 'inflada'
  detectado_en           TIMESTAMPTZ DEFAULT NOW(),
  resuelto_en            TIMESTAMPTZ,
  actualizado_en         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pricing_revision_estado ON pricing_revision_compras(estado);

ALTER TABLE pricing_revision_compras ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pricing_revision_all ON pricing_revision_compras;
CREATE POLICY pricing_revision_all ON pricing_revision_compras
  FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 2) Tabla: pricing_revision_settings (fila única id=1)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pricing_revision_settings (
  id                  SMALLINT PRIMARY KEY DEFAULT 1,
  umbral_pp           NUMERIC NOT NULL DEFAULT 10,  -- caída de markup que dispara alerta
  umbral_superior_pp  NUMERIC NOT NULL DEFAULT 15,  -- inflada: meta + N pp
  piso_pp             NUMERIC NOT NULL DEFAULT 20,  -- piso duro de la empresa (% markup)
  actualizado_en      TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT pricing_revision_settings_single CHECK (id = 1)
);

INSERT INTO pricing_revision_settings (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE pricing_revision_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pricing_revision_settings_all ON pricing_revision_settings;
CREATE POLICY pricing_revision_settings_all ON pricing_revision_settings
  FOR ALL USING (true) WITH CHECK (true);

-- ────────────────────────────────────────────────────────────
-- 3) ALTER: pricing_thresholds_skus + markup_meta_pct
-- ────────────────────────────────────────────────────────────
-- El equipo y NEO piensan en MARKUP ("40% de utilidad"). Dejamos
-- margen_minimo_pct intacto y agregamos markup_meta_pct como override.
ALTER TABLE pricing_thresholds_skus
  ADD COLUMN IF NOT EXISTS markup_meta_pct NUMERIC;

-- ────────────────────────────────────────────────────────────
-- 4) RPC: recalcular_revision_compras()
-- ────────────────────────────────────────────────────────────
-- Recalcula la utilidad ACTUAL (desde la lista viva) de cada SKU
-- comprado en la última carga, captura la meta estable una sola vez,
-- recalcula precio sugerido y estado, y auto-resuelve lo corregido.
-- SECURITY DEFINER: escribe en pricing_revision_compras saltando RLS.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.recalcular_revision_compras()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- LAG del costo de la compra anterior real (historial reciente)
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
  -- línea representativa por SKU en la última carga (la más reciente)
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
      -- meta: override manual > meta ya capturada (estable) > capturada de la compra
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
  estados AS (
    SELECT c.*,
      CASE
        WHEN c.guard OR c.markup_actual IS NULL THEN 'ok'
        WHEN c.estado_prev IN ('pendiente','marcado')
             AND c.markup_actual >= GREATEST(COALESCE(c.meta, v_piso) - v_umbral, v_piso) THEN 'resuelto'
        WHEN c.estado_prev = 'marcado' THEN 'marcado'
        WHEN c.markup_actual < 0 THEN 'pendiente'
        WHEN c.markup_actual < v_piso THEN 'pendiente'
        WHEN c.meta IS NOT NULL AND c.markup_actual < c.meta - v_umbral THEN 'pendiente'
        WHEN (c.meta IS NOT NULL AND c.markup_actual > c.meta + v_umbral_sup)
             OR (c.costo_anterior > 0 AND c.costo_vivo < c.costo_anterior * 0.85) THEN 'inflada'
        WHEN c.costo_vivo > COALESCE(c.costo_anterior, 0) THEN 'sano'
        WHEN c.costo_vivo < c.costo_anterior THEN 'oportunidad'
        ELSE 'ok'
      END AS estado_new
    FROM calc c
  ),
  final AS (
    SELECT s.*,
      CASE
        WHEN s.estado_new = 'inflada' AND s.meta IS NOT NULL AND s.costo_vivo > 0
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
END $$;

GRANT EXECUTE ON FUNCTION public.recalcular_revision_compras() TO authenticated, anon, service_role;

-- ────────────────────────────────────────────────────────────
-- 5) RPC: pricing_revision_compras_dia()
-- ────────────────────────────────────────────────────────────
-- Vista "Compras del día": SKUs de la última carga, cruzados con la
-- lista viva y con su estado persistente. Excluye ocultos y resueltos.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pricing_revision_compras_dia()
RETURNS TABLE (
  codigo_interno    TEXT,
  item              TEXT,
  proveedor         TEXT,
  categoria         TEXT,
  fecha_compra      DATE,
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
AS $$
  WITH ult AS (SELECT MAX(fecha_carga) AS fc FROM neo_items_comprados),
  dia AS (
    SELECT c.codigo_interno, SUM(COALESCE(c.cantidad_comprada,0)) AS cantidad
    FROM neo_items_comprados c, ult
    WHERE c.fecha_carga = ult.fc AND c.codigo_interno IS NOT NULL
    GROUP BY c.codigo_interno
  ),
  viva AS (
    SELECT DISTINCT ON (codigo_interno) codigo_interno, precio_sin_imp, costo_sin_imp
    FROM neo_lista_items
    ORDER BY codigo_interno, fecha_carga DESC NULLS LAST
  )
  SELECT
    r.codigo_interno, r.item, r.proveedor, r.categoria, r.fecha_compra,
    d.cantidad,
    r.costo_anterior, r.costo_compra, v.costo_sin_imp, v.precio_sin_imp,
    r.markup_meta_pct, r.markup_actual_pct, r.margen_actual_pct,
    r.precio_sugerido, r.estado, r.detectado_en, r.resuelto_en
  FROM dia d
  JOIN pricing_revision_compras r ON r.codigo_interno = d.codigo_interno
  LEFT JOIN viva v ON v.codigo_interno = d.codigo_interno
  LEFT JOIN items_ocultos_compras o ON o.codigo = d.codigo_interno
  WHERE o.codigo IS NULL
    AND r.estado <> 'resuelto';
$$;

GRANT EXECUTE ON FUNCTION public.pricing_revision_compras_dia() TO authenticated, anon, service_role;

-- ────────────────────────────────────────────────────────────
-- 6) RPC: pricing_barrido_catalogo(p_piso)
-- ────────────────────────────────────────────────────────────
-- Barrido retrospectivo: todo el catálogo activo por debajo del piso
-- (incluye banda "al borde" hasta piso+10 para contexto). Excluye ocultos.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pricing_barrido_catalogo(p_piso NUMERIC DEFAULT 20)
RETURNS TABLE (
  codigo_interno  TEXT,
  item            TEXT,
  categoria       TEXT,
  proveedor       TEXT,
  costo_vivo      NUMERIC,
  precio_vivo     NUMERIC,
  existencias     NUMERIC,
  markup_pct      NUMERIC,
  margen_pct      NUMERIC,
  precio_sugerido NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH viva AS (
    SELECT DISTINCT ON (codigo_interno)
      codigo_interno, item, categoria, proveedor,
      costo_sin_imp, precio_sin_imp, existencias, activo
    FROM neo_lista_items
    ORDER BY codigo_interno, fecha_carga DESC NULLS LAST
  )
  SELECT
    v.codigo_interno, v.item, v.categoria, v.proveedor,
    ROUND(v.costo_sin_imp::numeric, 2)  AS costo_vivo,
    ROUND(v.precio_sin_imp::numeric, 2) AS precio_vivo,
    ROUND(COALESCE(v.existencias,0)::numeric, 2) AS existencias,
    ROUND(((v.precio_sin_imp - v.costo_sin_imp) / v.costo_sin_imp * 100)::numeric, 2) AS markup_pct,
    CASE WHEN v.precio_sin_imp > 0
         THEN ROUND(((v.precio_sin_imp - v.costo_sin_imp) / v.precio_sin_imp * 100)::numeric, 2) END AS margen_pct,
    CEIL((v.costo_sin_imp * (1 + p_piso/100.0)) / 5.0) * 5 AS precio_sugerido
  FROM viva v
  LEFT JOIN items_ocultos_compras o ON o.codigo = v.codigo_interno
  WHERE v.activo = 'Sí'
    AND o.codigo IS NULL
    AND v.costo_sin_imp > 0
    AND v.codigo_interno NOT IN ('TRANSPORTE','RUTEO0557','42069','351100300990594','351100300991165')
    AND ((v.precio_sin_imp - v.costo_sin_imp) / v.costo_sin_imp * 100) < (p_piso + 10)
  ORDER BY ((v.precio_sin_imp - v.costo_sin_imp) / v.costo_sin_imp * 100) ASC;
$$;

GRANT EXECUTE ON FUNCTION public.pricing_barrido_catalogo(NUMERIC) TO authenticated, anon, service_role;
