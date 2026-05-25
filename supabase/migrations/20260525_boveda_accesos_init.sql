-- ════════════════════════════════════════════════════════════════════════
-- BÓVEDA DE ACCESOS
-- Almacén central y cifrado de credenciales. Acceso restringido (Luis, Toni,
-- Rebeca) enforced en la capa API. Las claves se cifran con pgcrypto usando
-- una llave maestra guardada en Supabase Vault, que nunca sale de la base.
-- ════════════════════════════════════════════════════════════════════════

-- ── Tablas ──────────────────────────────────────────────────────────────
create table if not exists public.boveda_accesos (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null,
  categoria       text,
  usuario_acceso  text,
  correo          text,
  clave_cifrada   bytea,
  descripcion     text,
  created_by      uuid,
  created_by_nombre text,
  updated_by      uuid,
  updated_by_nombre text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists public.boveda_log (
  id            bigint generated always as identity primary key,
  acceso_id     uuid,
  acceso_titulo text,
  accion        text not null,           -- crear | editar | borrar | revelar | copiar
  actor_id      uuid,
  actor_nombre  text,
  detalle       text,
  created_at    timestamptz not null default now()
);
create index if not exists boveda_log_created_idx on public.boveda_log (created_at desc);

-- ── RLS: negar todo acceso directo (solo service_role / definer entran) ──
alter table public.boveda_accesos enable row level security;
alter table public.boveda_log     enable row level security;
revoke all on public.boveda_accesos from anon, authenticated;
revoke all on public.boveda_log     from anon, authenticated;

-- ── Llave maestra en Vault (se crea una sola vez) ────────────────────────
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'boveda_master_key') then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'boveda_master_key',
      'Llave maestra de cifrado de la Bóveda de Accesos'
    );
  end if;
end $$;

-- ── Funciones (SECURITY DEFINER: la llave nunca sale de la base) ─────────
create or replace function public.boveda_listar()
returns table(
  id uuid, titulo text, categoria text, usuario_acceso text, correo text,
  descripcion text, tiene_clave boolean,
  created_by_nombre text, updated_by_nombre text,
  created_at timestamptz, updated_at timestamptz
)
language sql security definer set search_path = public
as $$
  select id, titulo, categoria, usuario_acceso, correo, descripcion,
         (clave_cifrada is not null) as tiene_clave,
         created_by_nombre, updated_by_nombre, created_at, updated_at
  from public.boveda_accesos
  order by created_at desc;
$$;

create or replace function public.boveda_crear(
  p_titulo text, p_categoria text, p_usuario text, p_correo text,
  p_clave text, p_descripcion text, p_actor_id uuid, p_actor_nombre text
) returns uuid
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare v_key text; v_id uuid;
begin
  if coalesce(trim(p_titulo), '') = '' then
    raise exception 'El título es obligatorio';
  end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'boveda_master_key' limit 1;
  if v_key is null then raise exception 'Falta la llave maestra de la bóveda'; end if;

  insert into public.boveda_accesos(
    titulo, categoria, usuario_acceso, correo, clave_cifrada, descripcion,
    created_by, created_by_nombre, updated_by, updated_by_nombre
  ) values (
    trim(p_titulo), nullif(trim(p_categoria), ''), nullif(trim(p_usuario), ''),
    nullif(trim(p_correo), ''),
    case when coalesce(p_clave, '') = '' then null else pgp_sym_encrypt(p_clave, v_key) end,
    nullif(trim(p_descripcion), ''),
    p_actor_id, p_actor_nombre, p_actor_id, p_actor_nombre
  ) returning id into v_id;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre)
  values (v_id, trim(p_titulo), 'crear', p_actor_id, p_actor_nombre);
  return v_id;
end; $$;

create or replace function public.boveda_editar(
  p_id uuid, p_titulo text, p_categoria text, p_usuario text, p_correo text,
  p_clave text, p_descripcion text, p_actor_id uuid, p_actor_nombre text
) returns void
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare v_key text; v_titulo text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'boveda_master_key' limit 1;
  update public.boveda_accesos set
    titulo         = coalesce(nullif(trim(p_titulo), ''), titulo),
    categoria      = nullif(trim(p_categoria), ''),
    usuario_acceso = nullif(trim(p_usuario), ''),
    correo         = nullif(trim(p_correo), ''),
    clave_cifrada  = case
                       when p_clave is null then clave_cifrada   -- sin cambio
                       when p_clave = ''    then null            -- borrar clave
                       else pgp_sym_encrypt(p_clave, v_key)      -- nueva clave
                     end,
    descripcion    = nullif(trim(p_descripcion), ''),
    updated_by     = p_actor_id, updated_by_nombre = p_actor_nombre, updated_at = now()
  where id = p_id
  returning titulo into v_titulo;
  if v_titulo is null then raise exception 'Acceso no encontrado'; end if;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre)
  values (p_id, v_titulo, 'editar', p_actor_id, p_actor_nombre);
end; $$;

create or replace function public.boveda_borrar(p_id uuid, p_actor_id uuid, p_actor_nombre text)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_titulo text;
begin
  delete from public.boveda_accesos where id = p_id returning titulo into v_titulo;
  if v_titulo is null then raise exception 'Acceso no encontrado'; end if;
  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre)
  values (p_id, v_titulo, 'borrar', p_actor_id, p_actor_nombre);
end; $$;

create or replace function public.boveda_revelar(
  p_id uuid, p_actor_id uuid, p_actor_nombre text, p_accion text
) returns text
language plpgsql security definer set search_path = public, vault, extensions
as $$
declare v_key text; v_cifrada bytea; v_titulo text; v_clara text; v_accion text;
begin
  v_accion := case when p_accion in ('revelar', 'copiar') then p_accion else 'revelar' end;
  select clave_cifrada, titulo into v_cifrada, v_titulo from public.boveda_accesos where id = p_id;
  if v_titulo is null then raise exception 'Acceso no encontrado'; end if;

  insert into public.boveda_log(acceso_id, acceso_titulo, accion, actor_id, actor_nombre)
  values (p_id, v_titulo, v_accion, p_actor_id, p_actor_nombre);

  if v_cifrada is null then return null; end if;
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'boveda_master_key' limit 1;
  v_clara := pgp_sym_decrypt(v_cifrada, v_key);
  return v_clara;
end; $$;

create or replace function public.boveda_log_listar(p_limit int default 200)
returns setof public.boveda_log
language sql security definer set search_path = public
as $$
  select * from public.boveda_log order by created_at desc limit greatest(1, least(p_limit, 1000));
$$;

-- ── Permisos: solo service_role puede ejecutar (las API corren con esa key) ──
revoke all on function public.boveda_listar()                              from public, anon, authenticated;
revoke all on function public.boveda_crear(text,text,text,text,text,text,uuid,text)  from public, anon, authenticated;
revoke all on function public.boveda_editar(uuid,text,text,text,text,text,text,uuid,text) from public, anon, authenticated;
revoke all on function public.boveda_borrar(uuid,uuid,text)                from public, anon, authenticated;
revoke all on function public.boveda_revelar(uuid,uuid,text,text)          from public, anon, authenticated;
revoke all on function public.boveda_log_listar(int)                       from public, anon, authenticated;

grant execute on function public.boveda_listar()                              to service_role;
grant execute on function public.boveda_crear(text,text,text,text,text,text,uuid,text)  to service_role;
grant execute on function public.boveda_editar(uuid,text,text,text,text,text,text,uuid,text) to service_role;
grant execute on function public.boveda_borrar(uuid,uuid,text)                to service_role;
grant execute on function public.boveda_revelar(uuid,uuid,text,text)          to service_role;
grant execute on function public.boveda_log_listar(int)                       to service_role;
