-- ═══════════════════════════════════════════════════════════════════════════
--  Diagnóstico automático: pantallas que se verían vacías
-- ═══════════════════════════════════════════════════════════════════════════
--
--  El 28/8/2026 el dueño creyó que se habían borrado los datos de bancos.
--  No se borró nada: la base se los filtraba, por dos motivos distintos que
--  nadie podía ver desde afuera. Un candado que esconde datos a quien SÍ debe
--  verlos es tan grave como uno que no cierra, y se nota mucho más tarde.
--
--  Esta función busca los dos motivos, y la corre el guardián todos los días:
--
--    A) Desajuste pantalla/tabla. Cada tabla se gatea con un módulo, pero
--       varias pantallas usan la misma tabla. Si la política no incluye el
--       módulo de la pantalla, quien entra por ahí ve la lista vacía.
--
--    B) Usuario sin ficha. Alguien que existe en el login pero no en
--       usuarios_sol: la base no lo reconoce y le muestra TODO vacío. Le pasó
--       al dueño, cuya cuenta nunca había estado en usuarios_sol — mientras la
--       base estuvo abierta no se notaba.
--
--  Al agregar una pantalla nueva, sumar acá su par (pantalla, módulo, tabla).

drop function if exists public.sol_diagnostico_pantallas();

create function public.sol_diagnostico_pantallas()
returns table(problema text, detalle text)
language plpgsql security definer set search_path = public, pg_temp as $fn$
declare m record; permitidos text[]; q text;
begin
  for m in select * from (values
    ('Dashboard','dashboard','fin_bancos'),
    ('Bancos','bancos','fin_bancos'),('Bancos','bancos','fin_bancos_inversiones'),
    ('Finanzas','finanzas','fin_cuentas_cobrar'),('Finanzas','finanzas','fin_cuentas_pagar'),
    ('Finanzas','finanzas','neo_movimientos_contables'),
    ('Proyeccion','proyeccion','neo_movimientos_contables'),
    ('Contabilidad','contabilidad','conta_asientos'),('Contabilidad','contabilidad','conta_facturas'),
    ('Personal','rrhh','rrhh_empleados'),('Coordinacion de pagos','pagos','pagos_items'),
    ('Cajas','cajas-aurora','cajas_aurora'),('Entregas','entregas','entregas_trazabilidad'),
    ('Tareas Equipo','tareas-equipo','tareas_equipo'),
    ('Ventas Equipo','comercial','neo_informe_ventas_vendedor'),
    ('Compras','inventario','ordenes_compra')
  ) as t(pantalla, mod, tab) loop
    select string_agg(p.qual, ' ') into q from pg_policies p
      where p.schemaname='public' and p.tablename = m.tab;
    continue when q is null;                    -- sin política: solo llave maestra, a propósito
    continue when q like '%sol_autenticado%';   -- abierta a cualquiera con sesión
    select array_agg(x[1]) into permitidos from regexp_matches(q, '''([a-z-]+)''', 'g') as x;
    if permitidos is null or not (m.mod = any(permitidos)) then
      problema := 'Pantalla que se va a ver vacia';
      detalle := format('%s lee %s, pero esa tabla solo la abre a: %s. Falta agregar %s.',
                        m.pantalla, m.tab, array_to_string(permitidos, ', '), m.mod);
      return next;
    end if;
  end loop;

  for m in select u.email as em, u.last_sign_in_at as ult from auth.users u
           where u.last_sign_in_at is not null
             and not exists (select 1 from usuarios_sol s where s.auth_id = u.id) loop
    problema := 'Usuario sin ficha en SOL';
    detalle := format('%s entro alguna vez (ultima: %s) pero no esta en usuarios_sol: va a ver todo vacio.',
                      m.em, to_char(m.ult, 'DD/MM/YYYY'));
    return next;
  end loop;
end $fn$;

revoke all on function public.sol_diagnostico_pantallas() from public, anon;
grant execute on function public.sol_diagnostico_pantallas() to service_role;

-- El Dashboard muestra la posición de bancos y lo ve todo el equipo desde
-- siempre. Mostrar ₡0 a quien no tiene Finanzas es peor que no mostrar nada:
-- es un dato falso. Se restaura el alcance previo al blindaje. Escribir sigue
-- reservado a Finanzas y Bancos.
drop policy if exists "sol_fin_bancos" on public.fin_bancos;
create policy "sol_fin_bancos" on public.fin_bancos for all to authenticated
  using (public.sol_puede_alguno('finanzas','bancos','dashboard'))
  with check (public.sol_puede_alguno('finanzas','bancos'));

drop policy if exists "sol_fin_bancos_inversiones" on public.fin_bancos_inversiones;
create policy "sol_fin_bancos_inversiones" on public.fin_bancos_inversiones for all to authenticated
  using (public.sol_puede_alguno('finanzas','bancos','dashboard'))
  with check (public.sol_puede_alguno('finanzas','bancos'));
