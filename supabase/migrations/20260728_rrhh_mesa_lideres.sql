-- ════════════════════════════════════════════════════════════════════════
-- RRHH: Mesa de Líderes + Organigrama (primera etapa)
--
-- Amplía la ficha de empleados con los campos necesarios para el panel de
-- Mesa de Líderes y el organigrama, agrega catálogos seleccionables
-- (departamento, sucursal, puesto), la relación "líder directo" (auto-jerarquía)
-- y un historial de cambios de puesto/departamento/líder/sucursal.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1) Campos nuevos en la ficha ────────────────────────────────────────
alter table public.rrhh_empleados
  add column if not exists codigo_interno       text,
  add column if not exists sucursal             text,
  add column if not exists lider_id             uuid references public.rrhh_empleados(id) on delete set null,
  add column if not exists jornada              text,   -- horario / jornada
  add column if not exists fecha_nacimiento     date,
  add column if not exists fecha_puesto_actual  date,
  add column if not exists descripcion_puesto   text,
  add column if not exists mesa_lideres         boolean default false,
  add column if not exists proxima_evaluacion   date,
  add column if not exists proxima_reunion      date;

create index if not exists rrhh_empleados_lider_idx    on public.rrhh_empleados (lider_id);
create index if not exists rrhh_empleados_sucursal_idx on public.rrhh_empleados (sucursal);
create index if not exists rrhh_empleados_mesa_idx     on public.rrhh_empleados (mesa_lideres);

-- ── 2) Código interno automático (EMP-0001, EMP-0002, …) ────────────────
create sequence if not exists public.rrhh_empleados_codigo_seq;
create unique index if not exists rrhh_empleados_codigo_uidx
  on public.rrhh_empleados (codigo_interno);

create or replace function public.rrhh_empleados_set_codigo()
returns trigger language plpgsql as $$
begin
  if new.codigo_interno is null or new.codigo_interno = '' then
    new.codigo_interno := 'EMP-' || lpad(nextval('public.rrhh_empleados_codigo_seq')::text, 4, '0');
  end if;
  return new;
end $$;

drop trigger if exists trg_rrhh_empleados_codigo on public.rrhh_empleados;
create trigger trg_rrhh_empleados_codigo
  before insert on public.rrhh_empleados
  for each row execute function public.rrhh_empleados_set_codigo();

-- Backfill del código para los empleados ya existentes.
update public.rrhh_empleados
  set codigo_interno = 'EMP-' || lpad(nextval('public.rrhh_empleados_codigo_seq')::text, 4, '0')
  where codigo_interno is null or codigo_interno = '';

-- ── 3) Catálogos seleccionables ─────────────────────────────────────────
create table if not exists public.rrhh_departamentos (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique,
  activo    boolean default true,
  orden     int default 0,
  creado_en timestamptz default now()
);
create table if not exists public.rrhh_sucursales (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique,
  activo    boolean default true,
  orden     int default 0,
  creado_en timestamptz default now()
);
create table if not exists public.rrhh_puestos (
  id        uuid primary key default gen_random_uuid(),
  nombre    text not null unique,
  activo    boolean default true,
  orden     int default 0,
  creado_en timestamptz default now()
);

alter table public.rrhh_departamentos enable row level security;
alter table public.rrhh_sucursales    enable row level security;
alter table public.rrhh_puestos        enable row level security;

drop policy if exists rrhh_departamentos_all on public.rrhh_departamentos;
create policy rrhh_departamentos_all on public.rrhh_departamentos for all using (true) with check (true);
drop policy if exists rrhh_sucursales_all on public.rrhh_sucursales;
create policy rrhh_sucursales_all on public.rrhh_sucursales for all using (true) with check (true);
drop policy if exists rrhh_puestos_all on public.rrhh_puestos;
create policy rrhh_puestos_all on public.rrhh_puestos for all using (true) with check (true);

-- Semillas de catálogos.
insert into public.rrhh_departamentos (nombre, orden) values
  ('Dirección', 1), ('Contabilidad', 2), ('Cajas', 3), ('Proveedores', 4),
  ('Bodega Principal', 5), ('Inventarios', 6), ('Logística y transportes', 7),
  ('Despachos de Ferretería', 8), ('Ventas', 9), ('Reclamos', 10),
  ('Mercadeo y administración', 11)
on conflict (nombre) do nothing;

insert into public.rrhh_sucursales (nombre, orden) values
  ('Principal', 1), ('El Cruce', 2)
on conflict (nombre) do nothing;

insert into public.rrhh_puestos (nombre, orden) values
  ('Dirección', 1), ('Gerente', 2), ('Subgerente', 3), ('Líder', 4),
  ('Encargado/a', 5), ('Administración', 6), ('Contador/a', 7), ('Cajero/a', 8),
  ('Bodeguero/a', 9), ('Vendedor/a', 10), ('Despachador/a', 11), ('Chofer', 12),
  ('Asistente', 13)
on conflict (nombre) do nothing;

-- ── 4) Historial de cambios de puesto/departamento/líder/sucursal ───────
create table if not exists public.rrhh_empleados_historial (
  id             uuid primary key default gen_random_uuid(),
  empleado_id    uuid references public.rrhh_empleados(id) on delete cascade,
  campo          text not null,      -- puesto | departamento | lider | sucursal
  valor_anterior text,
  valor_nuevo    text,
  usuario        text,
  creado_en      timestamptz default now()
);
create index if not exists rrhh_emp_hist_empleado_idx on public.rrhh_empleados_historial (empleado_id);

alter table public.rrhh_empleados_historial enable row level security;
drop policy if exists rrhh_empleados_historial_all on public.rrhh_empleados_historial;
create policy rrhh_empleados_historial_all on public.rrhh_empleados_historial for all using (true) with check (true);

-- ── 5) Bucket público para las fotos de los colaboradores ───────────────
insert into storage.buckets (id, name, public)
  values ('rrhh-fotos', 'rrhh-fotos', true)
on conflict (id) do update set public = true;

drop policy if exists rrhh_fotos_read on storage.objects;
create policy rrhh_fotos_read on storage.objects
  for select using (bucket_id = 'rrhh-fotos');
drop policy if exists rrhh_fotos_write on storage.objects;
create policy rrhh_fotos_write on storage.objects
  for insert with check (bucket_id = 'rrhh-fotos');
drop policy if exists rrhh_fotos_update on storage.objects;
create policy rrhh_fotos_update on storage.objects
  for update using (bucket_id = 'rrhh-fotos') with check (bucket_id = 'rrhh-fotos');
drop policy if exists rrhh_fotos_delete on storage.objects;
create policy rrhh_fotos_delete on storage.objects
  for delete using (bucket_id = 'rrhh-fotos');

-- ── 6) Semilla de la Mesa de Líderes inicial ────────────────────────────
-- Rebeca encabeza (Dirección). Los demás cuelgan de ella como líder directo.
insert into public.rrhh_empleados (nombre, departamento, sucursal, puesto, descripcion_puesto, mesa_lideres, estado)
select 'Rebeca', 'Dirección', 'Principal', 'Dirección', 'Dirección y seguimiento de la Mesa de Líderes', true, 'activo'
where not exists (select 1 from public.rrhh_empleados where lower(nombre) = 'rebeca');

insert into public.rrhh_empleados (nombre, departamento, sucursal, puesto, descripcion_puesto, mesa_lideres, estado, lider_id)
select v.nombre, v.departamento, v.sucursal, 'Líder', v.descripcion, true, 'activo',
       (select id from public.rrhh_empleados where lower(nombre) = 'rebeca' order by creado_en limit 1)
from (values
  ('Marcela', 'Contabilidad',            'Principal', 'Contabilidad, cajas y proveedores'),
  ('Víctor',  'Bodega Principal',        'Principal', 'Bodega Principal'),
  ('Jaime',   'Inventarios',             'Principal', 'Inventarios'),
  ('Carlos',  'Logística y transportes', 'Principal', 'Logística y transportes'),
  ('Omar',    'Despachos de Ferretería', 'Principal', 'Despachos de Ferretería'),
  ('Antony',  'Ventas',                  'Principal', 'Ventas, proveedores y reclamos'),
  ('Viviana', 'Dirección',               'El Cruce',  'Sucursal El Cruce')
) as v(nombre, departamento, sucursal, descripcion)
where not exists (select 1 from public.rrhh_empleados e where lower(e.nombre) = lower(v.nombre));
