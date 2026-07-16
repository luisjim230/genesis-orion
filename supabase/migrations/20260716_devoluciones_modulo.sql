-- ════════════════════════════════════════════════════════════════════════
-- MÓDULO: Control de Devoluciones de Dinero a Clientes
--
-- El contador registra cada devolución (con el recibo PDF del ERP y los datos
-- bancarios) y el gerente confirma el pago uno por uno. Objetivo: que no se
-- olvide ninguna transferencia pendiente.
--
-- Seguridad: las tablas contienen datos bancarios (SINPE / IBAN). RLS se activa
-- y se revoca TODO acceso directo a anon/authenticated. Todo el acceso pasa por
-- la capa API con el service_role key (mismo patrón que Bóveda y Compras a
-- Proveedor). El navegador nunca consulta estas tablas directo.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tabla principal ─────────────────────────────────────────────────────
create table if not exists public.devoluciones (
  id                     uuid primary key default gen_random_uuid(),
  cliente_nombre         text not null,
  cliente_identificacion text,
  monto                  numeric(12,2) not null check (monto > 0),
  moneda                 text not null default 'CRC' check (moneda in ('CRC','USD')),
  metodo                 text not null check (metodo in ('sinpe_movil','transferencia')),
  sinpe_numero           text,          -- 8 dígitos cuando metodo = 'sinpe_movil'
  iban                   text,          -- CR + 20 dígitos cuando metodo = 'transferencia'
  banco                  text,
  referencia_erp         text,
  recibo_path            text not null, -- ruta del PDF en el bucket privado
  recibo_nombre          text,          -- nombre original del archivo
  notas                  text,
  estado                 text not null default 'pendiente'
                         check (estado in ('pendiente','pagada','rechazada','anulada')),
  motivo_rechazo         text,
  referencia_pago        text,          -- comprobante del SINPE/transferencia
  creado_por             text,          -- nombre del contador
  creado_por_id          uuid,          -- usuarios_sol.id (sin FK a propósito)
  pagado_por             text,          -- nombre del gerente que confirmó
  pagado_por_id          uuid,
  creado_en              timestamptz not null default now(),
  actualizado_en         timestamptz not null default now(),
  pagado_en              timestamptz,
  -- coherencia método ↔ dato bancario
  constraint devoluciones_destino_chk check (
    (metodo = 'sinpe_movil'   and sinpe_numero ~ '^\d{8}$') or
    (metodo = 'transferencia' and iban ~ '^CR\d{20}$')
  )
);

-- ── Historial de cambios de estado (auditoría) ──────────────────────────
create table if not exists public.devoluciones_historial (
  id              uuid primary key default gen_random_uuid(),
  devolucion_id   uuid not null references public.devoluciones(id) on delete cascade,
  estado_anterior text,
  estado_nuevo    text not null,
  detalle         text,          -- ej. motivo de rechazo, referencia de pago
  usuario         text,          -- nombre del actor
  usuario_id      uuid,
  creado_en       timestamptz not null default now()
);

create index if not exists idx_devoluciones_estado    on public.devoluciones(estado);
create index if not exists idx_devoluciones_creado    on public.devoluciones(creado_en desc);
create index if not exists idx_historial_devolucion   on public.devoluciones_historial(devolucion_id);

-- ── Trigger: mantener actualizado_en ────────────────────────────────────
create or replace function public.devoluciones_touch_updated()
returns trigger language plpgsql as $$
begin
  new.actualizado_en := now();
  return new;
end $$;

drop trigger if exists trg_devoluciones_touch on public.devoluciones;
create trigger trg_devoluciones_touch
  before update on public.devoluciones
  for each row execute function public.devoluciones_touch_updated();

-- ── RLS: negar acceso directo (solo service_role entra) ─────────────────
alter table public.devoluciones           enable row level security;
alter table public.devoluciones_historial enable row level security;
revoke all on public.devoluciones           from anon, authenticated;
revoke all on public.devoluciones_historial from anon, authenticated;

-- ── Bucket privado para los recibos PDF ─────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('recibos-devoluciones', 'recibos-devoluciones', false, 10485760, array['application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = 10485760,
      allowed_mime_types = array['application/pdf'];
