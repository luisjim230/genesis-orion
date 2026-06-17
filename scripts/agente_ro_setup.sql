-- AgenteDJ · Rol read-only de hierro (solo SELECT, sin tablas con secretos)
-- Proyecto Supabase: genesis-rojimo (xeeieqjqmtoiutfnltqu)
-- Ejecutar en: Supabase -> SQL Editor.
-- Luis: reemplazá 'PONELA_VOS_ACA' por la contraseña que elijas. NO la pegues en el chat.

-- 1) Rol con login
create role agente_ro with login password 'PONELA_VOS_ACA';

-- 2) Lectura forzada + cortes de seguridad por sesion
alter role agente_ro set default_transaction_read_only = on;
alter role agente_ro set statement_timeout = '30s';
alter role agente_ro set idle_in_transaction_session_timeout = '15s';

-- 3) Ve el schema public pero no puede crear nada
grant usage on schema public to agente_ro;
revoke create on schema public from agente_ro;

-- 4) SELECT en TODAS las tablas/vistas de negocio, MENOS las 7 sensibles
do $$
declare r record;
begin
  for r in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r','p','v','m')   -- tablas, particiones, vistas, matviews
      and c.relname not in (
        'meta_config',          -- token de Meta API
        'boveda_accesos',       -- boveda de credenciales (clave_cifrada)
        'boveda_log',           -- bitacora de la boveda
        'boveda_inv_equipos',   -- claves de acceso/remoto cifradas
        'boveda_inv_licencias', -- claves de licencias cifradas
        'genesis_usuarios',     -- usuarios/permisos (PII + control de acceso)
        'usuarios_sol'          -- usuarios/permisos (PII + control de acceso)
      )
  loop
    execute format('grant select on public.%I to agente_ro', r.relname);
  end loop;
end $$;

-- 5) Blindaje extra: revocar TODO sobre las sensibles por las dudas
revoke all on
  public.meta_config, public.boveda_accesos, public.boveda_log,
  public.boveda_inv_equipos, public.boveda_inv_licencias,
  public.genesis_usuarios, public.usuarios_sol
from agente_ro;
