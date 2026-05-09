-- RRHH: módulos de Empleados, Capacitaciones y Seguimiento
-- "Seguimiento" reemplaza el concepto de "amonestaciones / llamadas de atención"
-- y permite registrar tanto reconocimientos positivos como observaciones formales.

-- =====================================================
-- 1) EMPLEADOS (ficha maestra)
-- =====================================================
CREATE TABLE IF NOT EXISTS public.rrhh_empleados (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  cedula TEXT,
  telefono TEXT,
  email TEXT,
  puesto TEXT,
  departamento TEXT,
  fecha_ingreso DATE,
  fecha_salida DATE,
  estado TEXT DEFAULT 'activo',
  -- activo, inactivo, suspendido, vacaciones
  tipo_contrato TEXT,
  -- fijo, temporal, servicios_profesionales, prueba
  salario NUMERIC,
  dias_vacaciones_anuales NUMERIC DEFAULT 15,
  direccion TEXT,
  contacto_emergencia_nombre TEXT,
  contacto_emergencia_telefono TEXT,
  observaciones TEXT,
  foto_url TEXT,
  creado_por TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW(),
  actualizado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rrhh_empleados_nombre_idx ON public.rrhh_empleados (nombre);
CREATE INDEX IF NOT EXISTS rrhh_empleados_estado_idx ON public.rrhh_empleados (estado);
CREATE INDEX IF NOT EXISTS rrhh_empleados_departamento_idx ON public.rrhh_empleados (departamento);

ALTER TABLE public.rrhh_empleados ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rrhh_empleados_all ON public.rrhh_empleados;
CREATE POLICY rrhh_empleados_all ON public.rrhh_empleados
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 2) CAPACITACIONES
-- =====================================================
CREATE TABLE IF NOT EXISTS public.rrhh_capacitaciones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID REFERENCES public.rrhh_empleados(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  descripcion TEXT,
  tipo TEXT DEFAULT 'interna',
  -- interna, externa
  modalidad TEXT DEFAULT 'presencial',
  -- presencial, virtual, hibrida
  instructor TEXT,
  institucion TEXT,
  fecha DATE,
  duracion_horas NUMERIC,
  estado TEXT DEFAULT 'completada',
  -- programada, en_curso, completada, cancelada
  certificado_url TEXT,
  observaciones TEXT,
  creado_por TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rrhh_capacitaciones_empleado_idx ON public.rrhh_capacitaciones (empleado_id);
CREATE INDEX IF NOT EXISTS rrhh_capacitaciones_fecha_idx ON public.rrhh_capacitaciones (fecha);
CREATE INDEX IF NOT EXISTS rrhh_capacitaciones_estado_idx ON public.rrhh_capacitaciones (estado);

ALTER TABLE public.rrhh_capacitaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rrhh_capacitaciones_all ON public.rrhh_capacitaciones;
CREATE POLICY rrhh_capacitaciones_all ON public.rrhh_capacitaciones
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 3) SEGUIMIENTO (reemplaza "amonestaciones / llamadas de atención")
-- =====================================================
CREATE TABLE IF NOT EXISTS public.rrhh_seguimiento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  empleado_id UUID REFERENCES public.rrhh_empleados(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL DEFAULT 'observacion',
  -- reconocimiento, observacion, llamada_atencion, suspension, otro
  fecha DATE NOT NULL DEFAULT CURRENT_DATE,
  motivo TEXT NOT NULL,
  descripcion TEXT,
  accion_tomada TEXT,
  gravedad TEXT,
  -- leve, moderada, grave
  proceso_legal BOOLEAN DEFAULT FALSE,
  notas_legales TEXT,
  documentos_url TEXT,
  creado_por TEXT,
  creado_en TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rrhh_seguimiento_empleado_idx ON public.rrhh_seguimiento (empleado_id);
CREATE INDEX IF NOT EXISTS rrhh_seguimiento_fecha_idx ON public.rrhh_seguimiento (fecha);
CREATE INDEX IF NOT EXISTS rrhh_seguimiento_tipo_idx ON public.rrhh_seguimiento (tipo);

ALTER TABLE public.rrhh_seguimiento ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rrhh_seguimiento_all ON public.rrhh_seguimiento;
CREATE POLICY rrhh_seguimiento_all ON public.rrhh_seguimiento
  FOR ALL USING (true) WITH CHECK (true);

-- =====================================================
-- 4) Vincular rrhh_solicitudes con empleados (opcional, no destructivo)
-- =====================================================
ALTER TABLE public.rrhh_solicitudes
  ADD COLUMN IF NOT EXISTS empleado_id UUID REFERENCES public.rrhh_empleados(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rrhh_solicitudes_empleado_idx ON public.rrhh_solicitudes (empleado_id);
