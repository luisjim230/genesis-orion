# Disk IO de Supabase — qué lo consume y cómo no volver a quemarlo

Contexto: el 2026-08-19 Supabase avisó que el proyecto `genesis-rojimo`
(`xeeieqjqmtoiutfnltqu`) estaba agotando su **Disk IO Budget**. Cuando ese
presupuesto se agota, la base entra en IO wait: las respuestas se ponen lentas,
la CPU sube y la instancia puede quedar sin responder.

Este documento tiene el diagnóstico, lo que se cambió, y las reglas para los
módulos nuevos (en particular el **portal de clientes** con compras y
activación de facturas, que va a sumar tráfico sobre la misma base).

---

## 1. Diagnóstico (evidencia, no intuición)

Dos fuentes, cruzadas:

**a) `pg_stat_statements`** (acumulado desde el 2026-03-05) — top de bloques
leídos de disco:

| Query | Llamadas | Bloques leídos |
|---|---|---|
| `SELECT * FROM neo_items_facturados LIMIT/OFFSET` (rol `anon`) | 29.106 | 170.812.896 |
| ídem, segunda variante | 28.386 | 41.861.444 |
| `refresh_mv_items_por_vend_mes()` | 1.003 | 26.094.085 |
| `refresh_profecias_panel()` | 881 | 7.111.388 |
| `bi_recalcular_resumen()` | 711 | 4.015.826 |

`neo_items_facturados`: 786.457 filas, 603 MB, **20.395.884.356 tuplas leídas
por seq scan**. O sea: la tabla entera barrida miles de veces.

**b) `edge_logs` de las últimas 24 h** — para saber qué sigue vivo *hoy* (las
estadísticas de arriba son acumuladas e incluyen versiones viejas de la app):

| RPC | Llamadas/día | Duración c/u | IO pesado por día |
|---|---|---|---|
| `refresh_mv_items_por_vend_mes` | 41 | 85–123 s | ~1 h |
| `refresh_mv_consumo_mensual` | 52 | 4–5 s | ~4 min |
| `refresh_profecias_panel` | 45 | 30–45 s | ~30 min |
| `bi_recalcular_resumen` | 40 | 30 s | ~20 min |
| `refresh_hermes_panel` | 45 | 11 s | ~8 min |

**Conclusión:** ~2 horas por día de la base reconstruyendo vistas enteras.
Cada una de esas funciones barre las 786k filas de `neo_items_facturados` y
reescribe la vista completa. Estaban pensadas para correr **1 vez al día**
(`.github/workflows/refresh-all.yml` lo dice explícitamente), pero la app las
disparaba desde botones, cargas de página y acciones sueltas del UI:
40–52 veces por día.

El barrido `SELECT *` con `OFFSET` ya no aparece en el tráfico de las últimas
24 h (lo arreglaron los PR #236 y anteriores), pero quedó como la lección más
cara del historial: ver la regla 3 de abajo.

---

## 2. Qué se cambió (2026-08-19)

**Migraciones**

- `20260819_disk_io_throttle_refresh.sql` — función `_mv_debe_refrescar()`:
  intervalo mínimo por vista + advisory lock para coalescear ráfagas de clicks.
  Se aplica a los cinco refresh:

  | Vista | Ventana mínima |
  |---|---|
  | `mv_items_por_vend_mes` | 6 h |
  | `bi_resumen_producto` | 3 h |
  | `mv_consumo_mensual` | 15 min |
  | `profecias_panel` | 5 min |
  | `hermes_panel_view` | 1 min |

  Los RPC aceptan `p_force`, **pero la base solo lo respeta si la llamada viene
  con service key** (`role` = `service_role` / `postgres`). Desde el navegador
  (`anon`) el force se ignora: nadie puede gatillar un rebuild de 2 minutos
  desde el front. Verificado contra PostgREST con la anon key real.

  `refresh_hermes_panel` además pasó a `REFRESH ... CONCURRENTLY`: antes tomaba
  ACCESS EXCLUSIVE y dejaba clavado a todo el que estuviera leyendo el panel de
  proformas.

- `20260819b_bi_recalcular_resumen_fecha_real.sql` — la función armaba un CTE
  con **toda** la tabla y le aplicaba dos regex + `to_date()` a la columna de
  texto `fecha`, fila por fila. Ahora usa `fecha_real` (date, poblada al 100 %),
  así primera/última venta salen por index-only scan sobre
  `idx_facturados_codigo_fecha_real` y las ventanas de 90/180/60 días entran por
  el índice de cobertura `idx_facturados_origen_cov`, sin tocar el heap.
  **30 s → 9,6 s**, con salida idéntica (mismos 4.425 productos, mismos totales
  de venta 90 d / 180 d, mismo capital invertido, misma cantidad de
  muerto/sobrestock/reforzar).

- `20260819c_drop_indices_no_usados.sql` — `idx_facturados_fecha_codigo`
  (31 scans en 5,5 meses, 24 MB) y `idx_facturados_right5_factura` (2 scans,
  9 MB). Cada índice se reescribe en cada uno de los ~570 lotes de upsert
  diarios del sync de NEO. Los trigram (`item`, `codigo_interno`) **se
  conservan**: los usa la búsqueda de productos de Comercial y Pricing.

**App**

- `app/inventario/page.js` ya no refresca `mv_consumo_mensual` en cada carga de
  página.
- `app/api/refresh-all/route.js` y el workflow diario mandan `p_force: true`
  (son los dos lugares donde el rebuild completo SÍ corresponde).
- Las subidas (`subir-inventario`, `subir-items-comprados`) y las acciones de
  Profecías siguen llamando a los refresh, pero **sin force**: si la vista se
  reconstruyó hace poco, la base descarta la llamada.

---

## 3. Reglas para módulos nuevos (portal de clientes incluido)

1. **Nunca traer una tabla grande entera.** `neo_items_facturados` son 603 MB.
   Filtrar siempre en la base por `fecha_real` (date, indexada), nunca por
   `fecha` (texto) ni filtrando en el navegador.

2. **Nunca refrescar una vista materializada desde un click o una carga de
   página.** Si un módulo necesita datos derivados frescos, se refresca por
   cron (workflow) o se llama al RPC con throttle. Un refresh es un rebuild
   completo, no un update incremental.

3. **Paginar con keyset, no con `OFFSET` grande.** `range(400000, 400999)` hace
   que Postgres lea las 400.000 filas anteriores para descartarlas: paginar así
   una tabla de 786k filas cuesta O(n²). En vez de eso: `order('id')` +
   `gt('id', ultimoId)`. Y si el módulo pagina "toda la tabla", casi siempre lo
   correcto es una vista agregada o un RPC que devuelva ya sumarizado.

4. **Tabla nueva = índice por su clave de consulta.** Para el portal de
   clientes: índice por `cliente` (o `cedula`/`cliente_id`) en todo lo que se
   consulte por cliente, y por `(cliente, fecha)` si además se filtra por
   período. Sin eso, cada consulta de un cliente barre la tabla completa.

5. **Ojo con el polling.** Hoy hay ~118 requests/hora las 24 h contra
   `sync_requests`, `daemon_heartbeat` y `usuarios_sol`. Es tolerable porque son
   tablas chicas; un portal público con polling sobre tablas grandes no lo
   sería. Preferir intervalos de ≥60 s y consultas por índice.

6. **Un portal de clientes es tráfico `anon`.** Todo lo que exponga tiene que
   pasar por RLS y no puede permitir consultas sin filtro. Los RPC pesados ya
   ignoran `p_force` desde `anon`; mantener esa línea.

---

## 4. Cómo volver a diagnosticar (SQL listo para pegar)

```sql
-- Top de IO acumulado
SELECT r.rolname, s.calls, s.shared_blks_read, s.mean_exec_time::int ms,
       left(regexp_replace(s.query,'\s+',' ','g'), 120) q
  FROM pg_stat_statements s JOIN pg_roles r ON r.oid = s.userid
 ORDER BY s.shared_blks_read DESC LIMIT 20;

-- Tablas que se están barriendo enteras
SELECT relname, n_live_tup, pg_size_pretty(pg_total_relation_size(relid)) total,
       seq_scan, seq_tup_read, idx_scan
  FROM pg_stat_user_tables ORDER BY seq_tup_read DESC LIMIT 15;

-- Índices que nadie usa (se pagan en cada INSERT/UPDATE)
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid)) sz
  FROM pg_stat_user_indexes WHERE relname = 'neo_items_facturados'
 ORDER BY idx_scan;

-- Estado del throttle
SELECT * FROM public.mv_refresh_state ORDER BY last_refresh DESC;
```

Y para ver qué está pasando **ahora** (no acumulado), los logs de Supabase
(`edge_logs`) agrupados por `request.path` de las últimas 24 h.
