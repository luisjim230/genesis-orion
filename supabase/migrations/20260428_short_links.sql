-- ============================================================
-- Migración: Acortador de URLs propio
-- Fecha: 2026-04-28
-- ============================================================
-- Tabla para los links cortos. El módulo Métricas Web acorta cada link UTM
-- generado, y la ruta pública /s/{slug} hace un 301 al target_url incrementando
-- el contador de clicks.
-- ============================================================
-- Ejecutar en Supabase SQL Editor.
-- ============================================================

CREATE TABLE IF NOT EXISTS short_links (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          TEXT NOT NULL UNIQUE,
  target_url    TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    TEXT,
  clicks        INT DEFAULT 0,
  last_click_at TIMESTAMPTZ,
  -- Metadatos descriptivos para que el historial sea legible.
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  utm_content   TEXT,
  product_name  TEXT
);

CREATE INDEX IF NOT EXISTS idx_short_links_slug    ON short_links(slug);
CREATE INDEX IF NOT EXISTS idx_short_links_created ON short_links(created_at DESC);

ALTER TABLE short_links ENABLE ROW LEVEL SECURITY;

-- SELECT: usuarios autenticados pueden leer (para el historial).
DROP POLICY IF EXISTS short_links_select ON short_links;
CREATE POLICY short_links_select ON short_links
  FOR SELECT USING (auth.role() = 'authenticated');

-- INSERT: usuarios autenticados crean links.
DROP POLICY IF EXISTS short_links_insert ON short_links;
CREATE POLICY short_links_insert ON short_links
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- service_role para el endpoint de redirect que actualiza contador.
DROP POLICY IF EXISTS short_links_service ON short_links;
CREATE POLICY short_links_service ON short_links
  FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- Función para incrementar clicks de manera atómica.
CREATE OR REPLACE FUNCTION increment_short_link_clicks(p_slug TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE short_links
     SET clicks = clicks + 1,
         last_click_at = NOW()
   WHERE slug = p_slug;
END;
$$;

GRANT EXECUTE ON FUNCTION increment_short_link_clicks(TEXT) TO anon, authenticated, service_role;
