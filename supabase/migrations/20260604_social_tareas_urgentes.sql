-- ============================================================
-- Migración: Redes Sociales → Tareas urgentes
-- Fecha: 2026-06-04
-- ============================================================
-- Tab nuevo en el módulo de Redes para anotar pendientes con un formato
-- estructurado (título, prioridad, responsable, fecha límite) más una caja
-- de texto abierta para indicaciones. Mismo patrón de RLS que social_contenido.
-- ============================================================

CREATE TABLE IF NOT EXISTS social_tareas_urgentes (
  id             BIGSERIAL PRIMARY KEY,
  titulo         TEXT NOT NULL,
  prioridad      TEXT NOT NULL DEFAULT 'alta',     -- 'alta' | 'media' | 'baja'
  estado         TEXT NOT NULL DEFAULT 'pendiente',-- 'pendiente' | 'en_proceso' | 'hecha'
  responsable    TEXT,
  fecha_limite   DATE,
  indicaciones   TEXT,                             -- caja de texto abierta
  creado_en      TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW(),
  completado_en  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_social_tareas_estado ON social_tareas_urgentes(estado);

ALTER TABLE social_tareas_urgentes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS anon_read ON social_tareas_urgentes;
CREATE POLICY anon_read ON social_tareas_urgentes FOR SELECT USING (true);

DROP POLICY IF EXISTS anon_write ON social_tareas_urgentes;
CREATE POLICY anon_write ON social_tareas_urgentes FOR ALL USING (true) WITH CHECK (true);
