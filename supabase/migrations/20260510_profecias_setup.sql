-- ============================================================
-- Migración: Módulo Profecías — tablas base + RLS
-- Fecha: 2026-05-10
-- ============================================================
-- Crea: profecias_estado_skus, profecias_historial_decisiones, profecias_config
-- ============================================================

CREATE TABLE IF NOT EXISTS profecias_estado_skus (
  codigo_interno TEXT PRIMARY KEY,
  clasificacion_manual TEXT NOT NULL DEFAULT 'normal'
    CHECK (clasificacion_manual IN ('normal','en_promocion','falta_promocion','dormido_discontinuar','estacional')),
  ciclo_pedido_dias INT,
  safety_stock_dias INT,
  notas TEXT,
  actualizado_por TEXT,
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profecias_estado_clasificacion ON profecias_estado_skus(clasificacion_manual);

CREATE TABLE IF NOT EXISTS profecias_historial_decisiones (
  id BIGSERIAL PRIMARY KEY,
  codigo_interno TEXT NOT NULL,
  fecha_decision DATE NOT NULL DEFAULT CURRENT_DATE,
  proveedor TEXT,
  madurez_al_momento TEXT,
  velocidad_observada NUMERIC,
  existencias_al_momento NUMERIC,
  cantidad_sugerida NUMERIC,
  cantidad_firmada NUMERIC,
  costo_unitario_estimado NUMERIC,
  inversion_estimada NUMERIC,
  clasificacion_manual_al_momento TEXT,
  notas TEXT,
  cantidad_recibida NUMERIC,
  fecha_recepcion DATE,
  meses_para_agotar NUMERIC,
  resultado TEXT,
  orden_compra_id UUID,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profecias_historial_codigo ON profecias_historial_decisiones(codigo_interno);
CREATE INDEX IF NOT EXISTS idx_profecias_historial_fecha ON profecias_historial_decisiones(fecha_decision);

CREATE TABLE IF NOT EXISTS profecias_config (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  safety_stock_dias_extranjero INT DEFAULT 30,
  safety_stock_dias_nacional INT DEFAULT 15,
  ciclo_pedido_dias_extranjero INT DEFAULT 120,
  ciclo_pedido_dias_nacional INT DEFAULT 30,
  factor_ajuste_promocion NUMERIC DEFAULT 0.8,
  factor_recien_nacido_conservador NUMERIC DEFAULT 0.8,
  factor_recien_nacido_agresivo NUMERIC DEFAULT 1.5,
  dias_alerta_stockout INT DEFAULT 14,
  dias_alerta_descontinuar INT DEFAULT 30,
  tipo_cambio_referencia NUMERIC DEFAULT 510,
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO profecias_config (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE profecias_estado_skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE profecias_historial_decisiones ENABLE ROW LEVEL SECURITY;
ALTER TABLE profecias_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth_all_estado" ON profecias_estado_skus;
DROP POLICY IF EXISTS "auth_all_historial" ON profecias_historial_decisiones;
DROP POLICY IF EXISTS "auth_all_config" ON profecias_config;

CREATE POLICY "auth_all_estado"    ON profecias_estado_skus           FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_historial" ON profecias_historial_decisiones  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "auth_all_config"    ON profecias_config                FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- El cliente del repo usa publishable key (rol anon), seguimos el patrón del resto del proyecto
DROP POLICY IF EXISTS "anon_read_estado" ON profecias_estado_skus;
DROP POLICY IF EXISTS "anon_write_estado" ON profecias_estado_skus;
DROP POLICY IF EXISTS "anon_read_historial" ON profecias_historial_decisiones;
DROP POLICY IF EXISTS "anon_write_historial" ON profecias_historial_decisiones;
DROP POLICY IF EXISTS "anon_read_config" ON profecias_config;
DROP POLICY IF EXISTS "anon_write_config" ON profecias_config;

CREATE POLICY "anon_read_estado"     ON profecias_estado_skus          FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write_estado"    ON profecias_estado_skus          FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_historial"  ON profecias_historial_decisiones FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write_historial" ON profecias_historial_decisiones FOR ALL    TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_read_config"     ON profecias_config               FOR SELECT TO anon USING (true);
CREATE POLICY "anon_write_config"    ON profecias_config               FOR ALL    TO anon USING (true) WITH CHECK (true);
