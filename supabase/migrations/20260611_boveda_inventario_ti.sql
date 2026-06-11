-- ════════════════════════════════════════════════════════════════════════
-- BÓVEDA · INVENTARIO TI
-- Pestaña nueva dentro de la Bóveda de Accesos. Dos sub-módulos:
--   · Equipos   → hardware asignado (laptops, monitores, teléfonos, etc.)
--   · Licencias → software / suscripciones (con clave/serial cifrado opcional)
-- Mismo esquema de seguridad que la bóveda: RLS niega acceso directo, todo
-- pasa por funciones SECURITY DEFINER que solo ejecuta el service_role. La
-- clave de las licencias se cifra con la misma llave maestra del Vault.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tablas ──────────────────────────────────────────────────────────────
create table if not exists public.boveda_inv_equipos (
  id              uuid primary key default gen_random_uuid(),
  nombre          text not null,            -- ej: "Laptop Toni"
  tipo            text,                      -- Laptop / Desktop / Monitor / Impresora / Teléfono / Red / Otro
  marca           text,
  modelo          text,
  serie           text,                      -- número de serie
  asignado_a      text,                      -- persona responsable
  ubicacion       text,                      -- sucursal / departamento
  estado          text,                      -- Activo / Disponible / En reparación / De baja
  fecha_compra    date,
  notas           text,
  created_by      uuid,
  created_by_nombre text,
  updated_by      uuid,
  updated_by_nombre text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.boveda_inv_licencias (
  id              uuid primary key default gen_random_uuid(),
  software        text not null,            -- ej: "Microsoft 365"
  tipo            text,                      -- Suscripción / Perpetua / Otra
  usuario         text,                      -- cuenta / usuario de la licencia
  correo          text,                      -- correo asociado
  clave_cifrada   bytea,                     -- serial / product key (cifrado, opcional)
  asignado_a      text,                      -- a quién pertenece / quién la usa
  fecha_pago      date,                      -- renovación / próximo pago
  costo           text,                      -- texto libre, ej "$99/año"
  notas           text,
  created_by      uuid,
  created_by_nombre text,
  updated_by      uuid,
  updated_by_nombre text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ── RLS: negar todo acceso directo (solo service_role / definer entran) ──
alter table public.boveda_inv_equipos   enable row level security;
alter table public.boveda_inv_licencias enable row level security;
revoke all on public.boveda_inv_equipos   from anon, authenticated;
revoke all on public.boveda_inv_licencias from anon, authenticated;

-- ════════════════════════════════════════════════════════════════════════
-- EQUIPOS · funciones (SECURITY DEFINER)
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.boveda_equipos_listar()
returns setof public.boveda_inv_equipos
language sql security definer set search_path = public
as $$
  select * from public.boveda_inv_equipos order by created_at desc;
$$;

create or replace function public.boveda_equipos_crear(
  p_nombre text, p_tipo text, p_marca text, p_modelo text, p_serie text,
  p_asignado_a text, p_ubicacion text, p_estado text, p_fecha_compra date,
  p_notas text, p_actor_id uuid, p_actor_nombre text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del equipo es obligatorio';
  end if;
  insert into public.boveda_inv_equipos(
    nombre, tipo, marca, modelo, serie, asignado_a, ubicacion, estado,
    fecha_compra, notas, created_by, created_by_nombre, updated_by, updated_by_nombre
  ) values (
    trim(p_nombre), nullif(trim(p_tipo), ''), nullif(trim(p_marca), ''),
    nullif(trim(p_modelo), ''), nullif(trim(p_serie), ''), nullif(trim(p_asignado_a), ''),
    nullif(trim(p_ubicacion), ''), nullif(trim(p_estado), ''), p_fecha_compra,
    nullif(trim(p_notas), ''), p_actor_id, p_actor_nombre, p_actor_id, p_actor_nombre
  ) returning id into v_id;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre, detalle)
  values (v_id, trim(p_nombre), 'crear', p_actor_id, p_actor_nombre, 'equipo');
  return v_id;
end; $$;

create or replace function public.boveda_equipos_editar(
  p_id uuid, p_nombre text, p_tipo text, p_marca text, p_modelo text, p_serie text,
  p_asignado_a text, p_ubicacion text, p_estado text, p_fecha_compra date,
  p_notas text, p_actor_id uuid, p_actor_nombre text
) returns void
language plpgsql security definer set search_path = public
as $$
declare v_nombre text;
begin
  update public.boveda_inv_equipos set
    nombre       = coalesce(nullif(trim(p_nombre), ''), nombre),
    tipo         = nullif(trim(p_tipo), ''),
    marca        = nullif(trim(p_marca), ''),
    modelo       = nullif(trim(p_modelo), ''),
    serie        = nullif(trim(p_serie), ''),
    asignado_a   = nullif(trim(p_asignado_a), ''),
    ubicacion    = nullif(trim(p_ubicacion), ''),
    estado       = nullif(trim(p_estado), ''),
    fecha_compra = p_fecha_compra,
    notas        = nullif(trim(p_notas), ''),
    updated_by   = p_actor_id, updated_by_nombre = p_actor_nombre, updated_at = now()
  where id = p_id
  returning nombre into v_nombre;
  if v_nombre is null then raise exception 'Equipo no encontrado'; end if;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre, detalle)
  values (p_id, v_nombre, 'editar', p_actor_id, p_actor_nombre, 'equipo');
end; $$;

create or replace function public.boveda_equipos_borrar(p_id uuid, p_actor_id uuid, p_actor_nombre text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_nombre text;
begin
  delete from public.boveda_inv_equipos where id = p_id returning nombre into v_nombre;
  if v_nombre is null then raise exception 'Equipo no encontrado'; end if;
  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre, detalle)
  values (p_id, v_nombre, 'borrar', p_actor_id, p_actor_nombre, 'equipo');
end; $$;

-- ════════════════════════════════════════════════════════════════════════
-- LICENCIAS · funciones (SECURITY DEFINER, clave cifrada con la llave del Vault)
-- ════════════════════════════════════════════════════════════════════════
create or replace function public.boveda_licencias_listar()
returns table(
  id uuid, software text, tipo text, usuario text, correo text,
  tiene_clave boolean, asignado_a text, fecha_pago date, costo text, notas text,
  created_by_nombre text, updated_by_nombre text,
  created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = public
as $$
  select id, software, tipo, usuario, correo,
         (clave_cifrada is not null) as tiene_clave,
         asignado_a, fecha_pago, costo, notas,
         created_by_nombre, updated_by_nombre, created_at, updated_at
  from public.boveda_inv_licencias
  order by created_at desc;
$$;

create or replace function public.boveda_licencias_crear(
  p_software text, p_tipo text, p_usuario text, p_correo text, p_clave text,
  p_asignado_a text, p_fecha_pago date, p_costo text, p_notas text,
  p_actor_id uuid, p_actor_nombre text
) returns uuid
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare v_key text; v_id uuid;
begin
  if coalesce(trim(p_software), '') = '' then
    raise exception 'El nombre del software es obligatorio';
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'boveda_master_key' limit 1;
  if v_key is null then raise exception 'Falta la llave maestra de la bóveda'; end if;

  insert into public.boveda_inv_licencias(
    software, tipo, usuario, correo, clave_cifrada, asignado_a, fecha_pago, costo, notas,
    created_by, created_by_nombre, updated_by, updated_by_nombre
  ) values (
    trim(p_software), nullif(trim(p_tipo), ''), nullif(trim(p_usuario), ''),
    nullif(trim(p_correo), ''),
    case when coalesce(p_clave, '') = '' then null else pgp_sym_encrypt(p_clave, v_key) end,
    nullif(trim(p_asignado_a), ''), p_fecha_pago, nullif(trim(p_costo), ''),
    nullif(trim(p_notas), ''), p_actor_id, p_actor_nombre, p_actor_id, p_actor_nombre
  ) returning id into v_id;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre, detalle)
  values (v_id, trim(p_software), 'crear', p_actor_id, p_actor_nombre, 'licencia');
  return v_id;
end; $$;

create or replace function public.boveda_licencias_editar(
  p_id uuid, p_software text, p_tipo text, p_usuario text, p_correo text, p_clave text,
  p_asignado_a text, p_fecha_pago date, p_costo text, p_notas text,
  p_actor_id uuid, p_actor_nombre text
) returns void
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare v_key text; v_software text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'boveda_master_key' limit 1;
  update public.boveda_inv_licencias set
    software      = coalesce(nullif(trim(p_software), ''), software),
    tipo          = nullif(trim(p_tipo), ''),
    usuario       = nullif(trim(p_usuario), ''),
    correo        = nullif(trim(p_correo), ''),
    clave_cifrada = case
                      when p_clave is null then clave_cifrada   -- sin cambio
                      when p_clave = ''    then null            -- borrar clave
                      else pgp_sym_encrypt(p_clave, v_key)      -- nueva clave
                    end,
    asignado_a    = nullif(trim(p_asignado_a), ''),
    fecha_pago    = p_fecha_pago,
    costo         = nullif(trim(p_costo), ''),
    notas         = nullif(trim(p_notas), ''),
    updated_by    = p_actor_id, updated_by_nombre = p_actor_nombre, updated_at = now()
  where id = p_id
  returning software into v_software;
  if v_software is null then raise exception 'Licencia no encontrada'; end if;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre, detalle)
  values (p_id, v_software, 'editar', p_actor_id, p_actor_nombre, 'licencia');
end; $$;

create or replace function public.boveda_licencias_borrar(p_id uuid, p_actor_id uuid, p_actor_nombre text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_software text;
begin
  delete from public.boveda_inv_licencias where id = p_id returning software into v_software;
  if v_software is null then raise exception 'Licencia no encontrada'; end if;
  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre, detalle)
  values (p_id, v_software, 'borrar', p_actor_id, p_actor_nombre, 'licencia');
end; $$;

create or replace function public.boveda_licencias_revelar(
  p_id uuid, p_actor_id uuid, p_actor_nombre text, p_accion text
) returns text
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare v_key text; v_cifrada bytea; v_software text; v_clara text; v_accion text;
begin
  v_accion := case when p_accion in ('revelar', 'copiar') then p_accion else 'revelar' end;
  select clave_cifrada, software into v_cifrada, v_software from public.boveda_inv_licencias where id = p_id;
  if v_software is null then raise exception 'Licencia no encontrada'; end if;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre, detalle)
  values (p_id, v_software, v_accion, p_actor_id, p_actor_nombre, 'licencia');

  if v_cifrada is null then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'boveda_master_key' limit 1;
  v_clara := pgp_sym_decrypt(v_cifrada, v_key);
  return v_clara;
end; $$;

-- ── Permisos: solo service_role puede ejecutar (las API corren con esa key) ──
revoke all on function public.boveda_equipos_listar()                                                          from public, anon, authenticated;
revoke all on function public.boveda_equipos_crear(text,text,text,text,text,text,text,text,date,text,uuid,text) from public, anon, authenticated;
revoke all on function public.boveda_equipos_editar(uuid,text,text,text,text,text,text,text,text,date,text,uuid,text) from public, anon, authenticated;
revoke all on function public.boveda_equipos_borrar(uuid,uuid,text)                                            from public, anon, authenticated;
revoke all on function public.boveda_licencias_listar()                                                        from public, anon, authenticated;
revoke all on function public.boveda_licencias_crear(text,text,text,text,text,text,date,text,text,uuid,text)   from public, anon, authenticated;
revoke all on function public.boveda_licencias_editar(uuid,text,text,text,text,text,text,date,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.boveda_licencias_borrar(uuid,uuid,text)                                          from public, anon, authenticated;
revoke all on function public.boveda_licencias_revelar(uuid,uuid,text,text)                                    from public, anon, authenticated;

grant execute on function public.boveda_equipos_listar()                                                          to service_role;
grant execute on function public.boveda_equipos_crear(text,text,text,text,text,text,text,text,date,text,uuid,text) to service_role;
grant execute on function public.boveda_equipos_editar(uuid,text,text,text,text,text,text,text,text,date,text,uuid,text) to service_role;
grant execute on function public.boveda_equipos_borrar(uuid,uuid,text)                                            to service_role;
grant execute on function public.boveda_licencias_listar()                                                        to service_role;
grant execute on function public.boveda_licencias_crear(text,text,text,text,text,text,date,text,text,uuid,text)   to service_role;
grant execute on function public.boveda_licencias_editar(uuid,text,text,text,text,text,text,date,text,text,uuid,text) to service_role;
grant execute on function public.boveda_licencias_borrar(uuid,uuid,text)                                          to service_role;
grant execute on function public.boveda_licencias_revelar(uuid,uuid,text,text)                                    to service_role;
