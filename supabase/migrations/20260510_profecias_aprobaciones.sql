-- ============================================================
-- Migración: Profecías v1.2 — máquina de estados de aprobaciones
-- Fecha: 2026-05-10
-- ============================================================
-- profecias_aprobaciones es la fuente de verdad del flujo:
--   pendiente → aprobado → en_orden / cancelado
-- Coexiste con profecias_historial_decisiones (auditoría permanente).
-- ============================================================

CREATE TABLE IF NOT EXISTS profecias_aprobaciones (
  id BIGSERIAL PRIMARY KEY,
  codigo_interno TEXT NOT NULL,
  proveedor TEXT,
  estado TEXT NOT NULL DEFAULT 'aprobado'
    CHECK (estado IN ('pendiente','aprobado','en_orden','cancelado')),
  -- Snapshot al momento de aprobar
  cantidad_sugerida_original NUMERIC,
  cantidad_aprobada NUMERIC NOT NULL,
  costo_unitario_estimado NUMERIC,
  inversion_estimada NUMERIC,
  -- Contexto del SKU al momento
  madurez_al_momento TEXT,
  velocidad_observada NUMERIC,
  existencias_al_momento NUMERIC,
  semaforo_al_momento TEXT,
  clasificacion_manual_al_momento TEXT,
  -- Auditoría
  aprobado_por TEXT,
  aprobado_en TIMESTAMPTZ DEFAULT NOW(),
  notas TEXT,
  -- Cuando se convierte en orden
  orden_compra_id UUID REFERENCES ordenes_compra(id),
  fecha_envio_orden TIMESTAMPTZ,
  -- Cuando se cancela
  cancelado_en TIMESTAMPTZ,
  motivo_cancelacion TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_profecias_apr_estado         ON profecias_aprobaciones(estado);
CREATE INDEX IF NOT EXISTS idx_profecias_apr_proveedor      ON profecias_aprobaciones(proveedor) WHERE estado = 'aprobado';
CREATE INDEX IF NOT EXISTS idx_profecias_apr_codigo         ON profecias_aprobaciones(codigo_interno);
CREATE INDEX IF NOT EXISTS idx_profecias_apr_codigo_activa  ON profecias_aprobaciones(codigo_interno) WHERE estado = 'aprobado';

ALTER TABLE profecias_aprobaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_aprobaciones"   ON profecias_aprobaciones;
DROP POLICY IF EXISTS "anon_read_aprobaciones"  ON profecias_aprobaciones;
DROP POLICY IF EXISTS "anon_write_aprobaciones" ON profecias_aprobaciones;

CREATE POLICY "auth_all_aprobaciones"   ON profecias_aprobaciones FOR ALL    TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_aprobaciones"  ON profecias_aprobaciones FOR SELECT TO anon          USING (true);
CREATE POLICY "anon_write_aprobaciones" ON profecias_aprobaciones FOR ALL    TO anon          USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE ON profecias_aprobaciones TO authenticated, anon;
GRANT USAGE, SELECT ON SEQUENCE profecias_aprobaciones_id_seq TO authenticated, anon;
