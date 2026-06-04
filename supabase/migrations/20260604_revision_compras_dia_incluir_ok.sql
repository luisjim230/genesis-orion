-- ============================================================
-- Migración: Revisión de Compras → la vista del día también devuelve las sanas
-- Fecha: 2026-06-04
-- ============================================================
-- Las compras de hoy con utilidad sana ('ok') no aparecían (la vista excluía
-- 'ok'). Luis quiere poder ver TODAS las compras del período, no solo las que
-- tienen problema. Ahora la vista devuelve también las 'ok' y el tab tiene un
-- toggle "Solo con algo que revisar" / "Ver todas". Sigue ocultando resueltas
-- y ocultas, y respeta el corte fecha_desde.
-- ============================================================

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
  WITH cfg AS (
    SELECT COALESCE(fecha_desde, '2026-06-01'::date) AS fd FROM pricing_revision_settings WHERE id = 1
  ),
  ult AS (SELECT MAX(fecha_carga) AS fc FROM neo_items_comprados),
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
    AND r.fecha_compra >= (SELECT fd FROM cfg);
$fn$;

GRANT EXECUTE ON FUNCTION public.pricing_revision_compras_dia() TO authenticated, anon, service_role;
