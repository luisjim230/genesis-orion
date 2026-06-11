-- ════════════════════════════════════════════════════════════════════════
-- INVENTARIO TI · EQUIPOS — campos extra
-- Agrega a los equipos: IP, fecha de mantenimiento programado, clave de acceso
-- (cifrada), dirección de acceso remoto y su clave (cifrada). Las claves usan
-- la misma llave maestra del Vault. Editar pasa a estar permitido para todo el
-- equipo (la API lo controla); borrar sigue reservado a admin.
-- ════════════════════════════════════════════════════════════════════════

alter table public.boveda_inv_equipos
  add column if not exists ip                   text,
  add column if not exists mantenimiento        date,
  add column if not exists clave_acceso_cifrada bytea,
  add column if not exists acceso_remoto        text,
  add column if not exists clave_remoto_cifrada bytea;

-- ── Listar: excluir las claves cifradas, exponer solo flags ──────────────
drop function if exists public.boveda_equipos_listar();
create or replace function public.boveda_equipos_listar()
returns table(
  id uuid, nombre text, tipo text, marca text, modelo text, serie text,
  asignado_a text, ubicacion text, estado text, fecha_compra date, notas text,
  ip text, mantenimiento date, acceso_remoto text,
  tiene_clave_acceso boolean, tiene_clave_remoto boolean,
  created_by_nombre text, updated_by_nombre text,
  created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = public
as $$
  select id, nombre, tipo, marca, modelo, serie, asignado_a, ubicacion, estado,
         fecha_compra, notas, ip, mantenimiento, acceso_remoto,
         (clave_acceso_cifrada is not null), (clave_remoto_cifrada is not null),
         created_by_nombre, updated_by_nombre, created_at, updated_at
  from public.boveda_inv_equipos
  order by created_at desc;
$$;

-- ── Crear ────────────────────────────────────────────────────────────────
drop function if exists public.boveda_equipos_crear(text,text,text,text,text,text,text,text,date,text,uuid,text);
create or replace function public.boveda_equipos_crear(
  p_nombre text, p_tipo text, p_marca text, p_modelo text, p_serie text,
  p_asignado_a text, p_ubicacion text, p_estado text, p_fecha_compra date, p_notas text,
  p_ip text, p_mantenimiento date, p_acceso_remoto text,
  p_clave_acceso text, p_clave_remoto text,
  p_actor_id uuid, p_actor_nombre text
) returns uuid
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare v_key text; v_id uuid;
begin
  if coalesce(trim(p_nombre), '') = '' then
    raise exception 'El nombre del equipo es obligatorio';
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'boveda_master_key' limit 1;
  if v_key is null then raise exception 'Falta la llave maestra de la bóveda'; end if;

  insert into public.boveda_inv_equipos(
    nombre, tipo, marca, modelo, serie, asignado_a, ubicacion, estado, fecha_compra, notas,
    ip, mantenimiento, acceso_remoto, clave_acceso_cifrada, clave_remoto_cifrada,
    created_by, created_by_nombre, updated_by, updated_by_nombre
  ) values (
    trim(p_nombre), nullif(trim(p_tipo), ''), nullif(trim(p_marca), ''),
    nullif(trim(p_modelo), ''), nullif(trim(p_serie), ''), nullif(trim(p_asignado_a), ''),
    nullif(trim(p_ubicacion), ''), nullif(trim(p_estado), ''), p_fecha_compra, nullif(trim(p_notas), ''),
    nullif(trim(p_ip), ''), p_mantenimiento, nullif(trim(p_acceso_remoto), ''),
    case when coalesce(p_clave_acceso, '') = '' then null else pgp_sym_encrypt(p_clave_acceso, v_key) end,
    case when coalesce(p_clave_remoto, '') = '' then null else pgp_sym_encrypt(p_clave_remoto, v_key) end,
    p_actor_id, p_actor_nombre, p_actor_id, p_actor_nombre
  ) returning id into v_id;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre, detalle)
  values (v_id, trim(p_nombre), 'crear', p_actor_id, p_actor_nombre, 'equipo');
  return v_id;
end; $$;

-- ── Editar ───────────────────────────────────────────────────────────────
drop function if exists public.boveda_equipos_editar(uuid,text,text,text,text,text,text,text,text,date,text,uuid,text);
create or replace function public.boveda_equipos_editar(
  p_id uuid, p_nombre text, p_tipo text, p_marca text, p_modelo text, p_serie text,
  p_asignado_a text, p_ubicacion text, p_estado text, p_fecha_compra date, p_notas text,
  p_ip text, p_mantenimiento date, p_acceso_remoto text,
  p_clave_acceso text, p_clave_remoto text,
  p_actor_id uuid, p_actor_nombre text
) returns void
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare v_key text; v_nombre text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'boveda_master_key' limit 1;
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
    ip           = nullif(trim(p_ip), ''),
    mantenimiento = p_mantenimiento,
    acceso_remoto = nullif(trim(p_acceso_remoto), ''),
    clave_acceso_cifrada = case
                             when p_clave_acceso is null then clave_acceso_cifrada
                             when p_clave_acceso = ''    then null
                             else pgp_sym_encrypt(p_clave_acceso, v_key) end,
    clave_remoto_cifrada = case
                             when p_clave_remoto is null then clave_remoto_cifrada
                             when p_clave_remoto = ''    then null
                             else pgp_sym_encrypt(p_clave_remoto, v_key) end,
    updated_by   = p_actor_id, updated_by_nombre = p_actor_nombre, updated_at = now()
  where id = p_id
  returning nombre into v_nombre;
  if v_nombre is null then raise exception 'Equipo no encontrado'; end if;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre, detalle)
  values (p_id, v_nombre, 'editar', p_actor_id, p_actor_nombre, 'equipo');
end; $$;

-- ── Revelar clave (p_campo: 'acceso' | 'remoto') ─────────────────────────
create or replace function public.boveda_equipos_revelar(
  p_id uuid, p_actor_id uuid, p_actor_nombre text, p_accion text, p_campo text
) returns text
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare v_key text; v_cifrada bytea; v_nombre text; v_clara text; v_accion text; v_campo text;
begin
  v_accion := case when p_accion in ('revelar', 'copiar') then p_accion else 'revelar' end;
  v_campo  := case when p_campo = 'remoto' then 'remoto' else 'acceso' end;
  select case when v_campo = 'remoto' then clave_remoto_cifrada else clave_acceso_cifrada end, nombre
    into v_cifrada, v_nombre
    from public.boveda_inv_equipos where id = p_id;
  if v_nombre is null then raise exception 'Equipo no encontrado'; end if;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre, detalle)
  values (p_id, v_nombre, v_accion, p_actor_id, p_actor_nombre, 'equipo:' || v_campo);

  if v_cifrada is null then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'boveda_master_key' limit 1;
  v_clara := pgp_sym_decrypt(v_cifrada, v_key);
  return v_clara;
end; $$;

-- ── Permisos ──────────────────────────────────────────────────────────────
revoke all on function public.boveda_equipos_listar()                                                                              from public, anon, authenticated;
revoke all on function public.boveda_equipos_crear(text,text,text,text,text,text,text,text,date,text,text,date,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.boveda_equipos_editar(uuid,text,text,text,text,text,text,text,text,date,text,text,date,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.boveda_equipos_revelar(uuid,uuid,text,text,text)                                                     from public, anon, authenticated;

grant execute on function public.boveda_equipos_listar()                                                                              to service_role;
grant execute on function public.boveda_equipos_crear(text,text,text,text,text,text,text,text,date,text,text,date,text,text,text,uuid,text) to service_role;
grant execute on function public.boveda_equipos_editar(uuid,text,text,text,text,text,text,text,text,date,text,text,date,text,text,text,uuid,text) to service_role;
grant execute on function public.boveda_equipos_revelar(uuid,uuid,text,text,text)                                                     to service_role;
