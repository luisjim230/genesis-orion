-- ============================================================
-- Migración: Módulo Métricas Web
-- Fecha: 2026-04-28
-- ============================================================
-- Crea las tablas necesarias para:
--   1) Dashboard GA4 (caché de métricas)
--   2) Generador de Links UTM (campañas + historial)
--   3) Marcado de dispositivos internos
-- ============================================================
-- INSTRUCCIONES: Ejecutar en Supabase SQL Editor.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1) Campañas UTM
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS utm_campaigns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  description  TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  created_by   TEXT,
  archived     BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_utm_campaigns_slug    ON utm_campaigns(slug);
CREATE INDEX IF NOT EXISTS idx_utm_campaigns_archived ON utm_campaigns(archived);

ALTER TABLE utm_campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS utm_campaigns_select ON utm_campaigns;
CREATE POLICY utm_campaigns_select ON utm_campaigns
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS utm_campaigns_insert ON utm_campaigns;
CREATE POLICY utm_campaigns_insert ON utm_campaigns
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS utm_campaigns_update ON utm_campaigns;
CREATE POLICY utm_campaigns_update ON utm_campaigns
  FOR UPDATE USING (auth.role() = 'authenticated')
              WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS utm_campaigns_service ON utm_campaigns;
CREATE POLICY utm_campaigns_service ON utm_campaigns
  FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 2) Historial de Links UTM
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS utm_links_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_url      TEXT NOT NULL,
  utm_source    TEXT NOT NULL,
  utm_medium    TEXT NOT NULL,
  utm_campaign  TEXT NOT NULL,
  utm_content   TEXT NOT NULL,
  final_url     TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  created_by    TEXT,
  product_name  TEXT
);

CREATE INDEX IF NOT EXISTS idx_utm_links_history_created  ON utm_links_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_utm_links_history_source   ON utm_links_history(utm_source);
CREATE INDEX IF NOT EXISTS idx_utm_links_history_campaign ON utm_links_history(utm_campaign);

ALTER TABLE utm_links_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS utm_links_history_select ON utm_links_history;
CREATE POLICY utm_links_history_select ON utm_links_history
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS utm_links_history_insert ON utm_links_history;
CREATE POLICY utm_links_history_insert ON utm_links_history
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS utm_links_history_service ON utm_links_history;
CREATE POLICY utm_links_history_service ON utm_links_history
  FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 3) Caché de métricas GA4
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ga4_metrics_cache (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_type     TEXT NOT NULL,
  date_range      TEXT NOT NULL,
  traffic_filter  TEXT NOT NULL DEFAULT 'external',
  data            JSONB NOT NULL,
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ga4_cache_lookup
  ON ga4_metrics_cache(metric_type, date_range, traffic_filter, expires_at);

CREATE INDEX IF NOT EXISTS idx_ga4_cache_expires
  ON ga4_metrics_cache(expires_at);

ALTER TABLE ga4_metrics_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ga4_cache_select ON ga4_metrics_cache;
CREATE POLICY ga4_cache_select ON ga4_metrics_cache
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS ga4_cache_service ON ga4_metrics_cache;
CREATE POLICY ga4_cache_service ON ga4_metrics_cache
  FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- 4) Dispositivos internos del equipo
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS internal_team_devices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_label  TEXT,
  marked_at     TIMESTAMPTZ DEFAULT NOW(),
  marked_by     TEXT,
  client_id     TEXT,
  user_agent    TEXT,
  revoked       BOOLEAN DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_internal_devices_marked  ON internal_team_devices(marked_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_devices_revoked ON internal_team_devices(revoked);

ALTER TABLE internal_team_devices ENABLE ROW LEVEL SECURITY;

-- Cualquiera puede insertar (la página /marcar-interno es pública).
DROP POLICY IF EXISTS internal_devices_insert ON internal_team_devices;
CREATE POLICY internal_devices_insert ON internal_team_devices
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS internal_devices_select ON internal_team_devices;
CREATE POLICY internal_devices_select ON internal_team_devices
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS internal_devices_update ON internal_team_devices;
CREATE POLICY internal_devices_update ON internal_team_devices
  FOR UPDATE USING (auth.role() = 'authenticated')
              WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS internal_devices_service ON internal_team_devices;
CREATE POLICY internal_devices_service ON internal_team_devices
  FOR ALL USING (auth.role() = 'service_role')
          WITH CHECK (auth.role() = 'service_role');

-- ────────────────────────────────────────────────────────────
-- FIN
-- ────────────────────────────────────────────────────────────
