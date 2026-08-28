-- ═══════════════════════════════════════════════════════════════════════════
--  Rendimiento: que el candado se evalúe UNA vez, no una vez por fila
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Síntoma reportado: "el punto de equilibrio no se está calculando".
--
--  La causa no era el cálculo. Las políticas llamaban a sol_puede() y
--  sol_autenticado() de forma directa, y Postgres las ejecuta UNA VEZ POR FILA.
--  Sobre neo_items_facturados —786 mil filas, y de ahí sale el equilibrio— eso
--  significa 786 mil llamadas a una función que consulta usuarios_sol. La
--  consulta dejaba de responder: incomodidad_equilibrio no terminaba ni en
--  60 segundos, y en pantalla se veía como "no calcula".
--
--  Envolver la llamada en (select ...) la convierte en un InitPlan: Postgres la
--  resuelve una sola vez y reutiliza el resultado. Misma regla de permisos,
--  mismo resultado, sin el costo por fila. Es la recomendación de Supabase para
--  RLS sobre tablas grandes.
--
--  Después del cambio, incomodidad_equilibrio responde al instante y devuelve
--  el cálculo correcto.
--
--  REGLA PARA EL FUTURO: toda política nueva se escribe
--      using ( (select public.sol_puede('modulo')) )
--  y nunca
--      using ( public.sol_puede('modulo') )

do $opt$
declare r record; q text; c text; sentencia text;
begin
  for r in
    select p.tablename as tabla, p.policyname as pol, p.cmd as accion,
           p.qual as usando, p.with_check as chequeo
    from pg_policies p
    where p.schemaname='public' and p.policyname like 'sol\_%'
  loop
    q := r.usando; c := r.chequeo;
    if q is not null and q not like '( SELECT%' then q := '(select ' || q || ')'; end if;
    if c is not null and c not like '( SELECT%' then c := '(select ' || c || ')'; end if;
    -- Ya optimizada: no se toca.
    if (r.usando is not null and r.usando like '( SELECT%')
       and (r.chequeo is null or r.chequeo like '( SELECT%') then
      continue;
    end if;
    execute format('drop policy %I on public.%I', r.pol, r.tabla);
    sentencia := format('create policy %I on public.%I for %s to authenticated', r.pol, r.tabla,
      case r.accion when 'ALL' then 'all' when 'SELECT' then 'select'
                    when 'INSERT' then 'insert' when 'UPDATE' then 'update' else 'delete' end);
    if q is not null then sentencia := sentencia || format(' using (%s)', q); end if;
    if c is not null then sentencia := sentencia || format(' with check (%s)', c); end if;
    execute sentencia;
  end loop;
end $opt$;
