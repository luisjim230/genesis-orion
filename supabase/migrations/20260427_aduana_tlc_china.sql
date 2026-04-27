-- ============================================================
-- Migración: Módulo Aduana — TLC China-CR
-- Fecha: 2026-04-27
-- ============================================================
-- INSTRUCCIONES: Ejecutar en Supabase SQL Editor
-- ============================================================

-- Tabla principal: trato arancelario por partida bajo TLC China-CR
-- Vigente desde agosto 2011. Fuente: Anexo 2 — Lista de Costa Rica (COMEX).
CREATE TABLE IF NOT EXISTS tlc_china_partidas (
  codigo_arancelario     VARCHAR(10) PRIMARY KEY,
  descripcion            TEXT NOT NULL,
  arancel_base           VARCHAR(20),
  categoria_desgravacion VARCHAR(10),
  paga_dai               BOOLEAN NOT NULL,
  dai_efectivo_2026      DECIMAL(5,2),
  ley_6946               DECIMAL(5,2) DEFAULT 1.00,
  total_efectivo         DECIMAL(5,2),
  notas                  TEXT,
  capitulo               INT,
  partida                INT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tlc_capitulo  ON tlc_china_partidas(capitulo);
CREATE INDEX IF NOT EXISTS idx_tlc_partida   ON tlc_china_partidas(partida);
CREATE INDEX IF NOT EXISTS idx_tlc_categoria ON tlc_china_partidas(categoria_desgravacion);
CREATE INDEX IF NOT EXISTS idx_tlc_descripcion_search
  ON tlc_china_partidas USING gin(to_tsvector('spanish', descripcion));

-- RLS abierto a usuarios autenticados (solo lectura para todos los roles)
ALTER TABLE tlc_china_partidas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tlc_partidas_select ON tlc_china_partidas;
CREATE POLICY tlc_partidas_select
  ON tlc_china_partidas FOR SELECT
  USING (auth.role() = 'authenticated');

-- Solo service_role puede insertar/actualizar (lo hace el script de seed)
DROP POLICY IF EXISTS tlc_partidas_admin ON tlc_china_partidas;
CREATE POLICY tlc_partidas_admin
  ON tlc_china_partidas FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
