-- ═══════════════════════════════════════════════════════════════════════════
--  Arreglo: pantallas que quedaron vacías tras el blindaje
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Síntoma reportado: "se borraron todos los datos de posición de bancos".
--  Los datos NUNCA se borraron (10 bancos, 10 inversiones, 41 CxC, 447 CxP
--  seguían en la base). Lo que pasaba es que la base los filtraba.
--
--  DOS CAUSAS DISTINTAS
--
--  1. El dueño no tenía ficha de usuario.
--     luisjim230@gmail.com existía en Supabase Auth pero NO en usuarios_sol.
--     Mientras la base estuvo abierta a cualquiera eso no se notaba; al
--     cerrarla, sol_puede() no encontraba su perfil y le devolvía "no" para
--     todo. Se le creó la ficha con rol admin.
--
--  2. Una tabla, varias pantallas.
--     Cada tabla se gateó con UN módulo, pero varias las usan desde pantallas
--     distintas. Quien entraba por la otra pantalla veía la lista vacía:
--
--       fin_bancos, fin_bancos_inversiones
--         → las usan Bancos (/finanzas/bancos), Finanzas y el Dashboard,
--           pero estaban gateadas solo con «finanzas».
--       neo_movimientos_contables
--         → la usan Contabilidad, Finanzas (movimientos e IVA mensual) y
--           Proyección (vía per_estado_resultados), pero estaba gateada solo
--           con «contabilidad».
--
--  sol_puede_alguno() acepta varios módulos, para que el permiso siga la
--  pantalla y no la tabla.

begin;

create or replace function public.sol_puede_alguno(variadic p_modulos text[])
returns boolean language sql stable set search_path = public, pg_temp as $$
  select exists (select 1 from unnest(p_modulos) m where public.sol_puede(m))
$$;
grant execute on function public.sol_puede_alguno(variadic text[]) to authenticated, service_role;

drop policy if exists "sol_fin_bancos" on public.fin_bancos;
create policy "sol_fin_bancos" on public.fin_bancos for all to authenticated
  using (public.sol_puede_alguno('finanzas','bancos'))
  with check (public.sol_puede_alguno('finanzas','bancos'));

drop policy if exists "sol_fin_bancos_inversiones" on public.fin_bancos_inversiones;
create policy "sol_fin_bancos_inversiones" on public.fin_bancos_inversiones for all to authenticated
  using (public.sol_puede_alguno('finanzas','bancos'))
  with check (public.sol_puede_alguno('finanzas','bancos'));

drop policy if exists "sol_neo_movimientos_contables" on public.neo_movimientos_contables;
create policy "sol_neo_movimientos_contables" on public.neo_movimientos_contables for all to authenticated
  using (public.sol_puede_alguno('contabilidad','finanzas','proyeccion'))
  with check (public.sol_puede_alguno('contabilidad','finanzas','proyeccion'));

commit;

-- ── Regla para el futuro ───────────────────────────────────────────────────
-- Al crear una tabla nueva y su política, listar TODAS las pantallas que la
-- leen y pasarlas todas a sol_puede_alguno(). Un solo módulo alcanza únicamente
-- cuando una sola pantalla la usa.
