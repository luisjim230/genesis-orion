'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

// ── Design tokens ────────────────────────────────────────────────────────────
const C = {
  orange:   '#ED6E2E',
  burgundy: '#5E2733',
  teal:     '#225F74',
  cream:    '#FDF4F4',
  green:    '#276749',
  red:      '#C53030',
  gold:     '#B7791F',
  muted:    '#8a7070',
  border:   '#EAE0E0',
  text:     '#1a1a1a',
  bg:       '#FDF4F4',
};

const S = {
  kicker:   { color: C.orange, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 },
  card:     { background: '#fff', borderRadius: 14, border: `1px solid ${C.border}`, padding: '20px 24px', boxShadow: '0 1px 4px rgba(94,39,51,0.06)' },
  cardSm:   { background: '#fff', borderRadius: 12, border: `1px solid ${C.border}`, padding: '16px 18px', boxShadow: '0 1px 3px rgba(94,39,51,0.05)' },
  tab:      { padding: '8px 18px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: C.muted, transition: 'all .15s' },
  tabActive:{ padding: '8px 18px', borderRadius: 8, border: 'none', background: C.cream, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: C.orange, borderBottom: `2px solid ${C.orange}`, transition: 'all .15s' },
  th:       { padding: '10px 14px', fontSize: '0.75rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}`, textAlign: 'left', whiteSpace: 'nowrap' },
  td:       { padding: '10px 14px', fontSize: '0.85rem', borderBottom: `1px solid #f5eeee`, color: C.text },
  pill:     (color, bg) => ({ background: bg, color: color, borderRadius: 20, padding: '2px 10px', fontSize: '0.75rem', fontWeight: 700, display: 'inline-block' }),
  label:    { fontSize: '0.75rem', fontWeight: 600, color: C.muted, marginBottom: 6, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' },
  select:   { padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: '0.88rem', color: C.text, fontFamily: 'Rubik, sans-serif' },
  caption:  { fontSize: '0.78rem', color: C.muted, marginTop: 4 },
};

const CRC = v => {
  const n = parseFloat(v) || 0;
  return '₡' + Math.round(n).toLocaleString('es-CR');
};
const PCT = v => {
  const s = String(v || '0').replace('%','').trim();
  return (parseFloat(s) || 0).toFixed(1) + '%';
};
const margenColor = m => {
  const n = parseFloat(String(m||'0').replace('%',''));
  if (n >= 45) return C.green;
  if (n >= 30) return C.teal;
  if (n >= 20) return C.gold;
  return C.red;
};

// ── Helpers de parseo ────────────────────────────────────────────────────────
function parsePct(v) {
  return parseFloat(String(v||'0').replace('%','').trim()) || 0;
}
function parseNum(v) {
  return parseFloat(v) || 0;
}

// ── usePeriodos — carga fechas disponibles ──────────────────────────────────
function usePeriodos() {
  const [periodos, setPeriodos] = useState([]);
  const [sel, setSel]           = useState('');

  useEffect(() => {
    (async () => {
      // Cargar desde las 3 tablas posibles
      const [r1, r2] = await Promise.all([
        supabase.from('neo_informe_ventas_vendedor').select('fecha_carga,periodo_reporte').order('fecha_carga', { ascending: false }).limit(500),
        supabase.from('neo_informe_ventas_categoria').select('fecha_carga,periodo_reporte').order('fecha_carga', { ascending: false }).limit(500),
      ]);
      const todas = [...(r1.data||[]), ...(r2.data||[])];
      const vistos = new Set(); const unicas = [];
      for (const r of todas) {
        if (!vistos.has(r.fecha_carga)) { vistos.add(r.fecha_carga); unicas.push(r); }
      }
      unicas.sort((a,b) => b.fecha_carga.localeCompare(a.fecha_carga));
      // Agrupar por fecha (solo la fecha, no hora)
      const porFecha = {};
      for (const r of unicas) {
        const d = r.fecha_carga.slice(0,10);
        if (!porFecha[d]) porFecha[d] = r;
      }
      const lista = Object.values(porFecha);
      setPeriodos(lista);
      if (lista.length) setSel(lista[0].fecha_carga);
    })();
  }, []);

  return { periodos, sel, setSel };
}

// ── TabResumen — KPIs globales + tabla por vendedor ─────────────────────────
function TabResumen({ sel }) {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!sel) return;
    setCargando(true);
    (async () => {
      const fechaDia = sel.slice(0, 10);
      let todos = [], off = 0;
      while (true) {
        const { data } = await supabase
          .from('neo_informe_ventas_vendedor')
          .select('*')
          .gte('fecha_carga', fechaDia + 'T00:00:00')
          .lte('fecha_carga', fechaDia + 'T23:59:59')
          .range(off, off + 999);
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }
      // Filtrar solo filas con vendedor (no subtotales ni total general)
      const vendedores = todos.filter(r => r.vendedor && r.vendedor.trim() && r.es_total !== true);
      setDatos(vendedores);
      setCargando(false);
    })();
  }, [sel]);

  const totales = useMemo(() => ({
    ventas:     datos.reduce((s,r) => s + parseNum(r.ventas_netas), 0),
    notas:      datos.reduce((s,r) => s + parseNum(r.notas_totales), 0),
    neto:       datos.reduce((s,r) => s + (parseNum(r.ventas_netas) - parseNum(r.notas_totales)), 0),
    costo:      datos.reduce((s,r) => s + parseNum(r.costo), 0),
    utilidad:   datos.reduce((s,r) => s + parseNum(r.utilidad), 0),
    trans:      datos.reduce((s,r) => s + parseNum(r.transacciones), 0),
    unidades:   datos.reduce((s,r) => s + parseNum(r.unidades_vendidas), 0),
  }), [datos]);

  const margen = totales.neto > 0 ? (totales.utilidad / totales.neto * 100).toFixed(1) : '0.0';

  const vendedoresOrdenados = useMemo(() =>
    [...datos].sort((a,b) => parseNum(b.ventas_netas) - parseNum(a.ventas_netas)),
  [datos]);

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>⏳ Cargando...</div>;
  if (!datos.length) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📊</div>
      <div style={{ fontWeight: 600, color: C.text }}>Sin datos de ventas</div>
      <div style={{ fontSize: '0.85rem', marginTop: 6 }}>Subí el <strong>Informe de ventas por vendedor</strong> en <a href="/reportes" style={{ color: C.orange }}>Carga de reportes</a></div>
    </div>
  );

  const medallas = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
        {[
          { label: 'Ventas netas', val: CRC(totales.ventas), color: C.orange },
          { label: 'Notas de crédito', val: CRC(totales.notas), color: C.red, sub: '(descuento aplicado)' },
          { label: 'Neto real', val: CRC(totales.neto), color: C.teal, sub: 'ventas − notas' },
          { label: 'Utilidad bruta', val: CRC(totales.utilidad), color: C.green },
          { label: 'Margen global', val: margen + '%', color: margenColor(margen + '%') },
        ].map(k => (
          <div key={k.label} style={S.cardSm}>
            <div style={S.caption}>{k.label}</div>
            <div style={{ fontSize: '1.45rem', fontWeight: 800, color: k.color, margin: '4px 0 2px' }}>{k.val}</div>
            {k.sub && <div style={{ ...S.caption, marginTop: 0 }}>{k.sub}</div>}
          </div>
        ))}
      </div>

      {/* Tabla vendedores */}
      <div style={S.card}>
        <div style={S.kicker}>Rendimiento por vendedor</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fdf0f0' }}>
                <th style={{ ...S.th, width: 30 }}>#</th>
                <th style={S.th}>Vendedor</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Unidades</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Ventas netas</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Notas crédito</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Neto real</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Costo</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Utilidad</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Margen</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Trans.</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Ticket prom.</th>
              </tr>
            </thead>
            <tbody>
              {vendedoresOrdenados.map((r, i) => {
                const neto = parseNum(r.ventas_netas) - parseNum(r.notas_totales);
                const mgn  = parseNum(r.pct_utilidad);
                const tieneNotas = parseNum(r.notas_totales) > 0;
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8' }}>
                    <td style={{ ...S.td, fontWeight: 700, color: C.muted }}>{medallas[i] || i + 1}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{r.vendedor}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{parseNum(r.unidades_vendidas).toLocaleString('es-CR', { maximumFractionDigits: 1 })}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{CRC(r.ventas_netas)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: tieneNotas ? C.red : C.muted }}>
                      {tieneNotas ? <span>−{CRC(r.notas_totales)}</span> : '—'}
                    </td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: C.teal }}>{CRC(neto)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: C.muted }}>{CRC(r.costo)}</td>
                    <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: C.green }}>{CRC(r.utilidad)}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: margenColor(mgn + '%') }}>{mgn.toFixed(1)}%</span>
                    </td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{parseNum(r.transacciones)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: C.muted }}>{CRC(r.tiquete_promedio)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#fdf0f0', fontWeight: 700 }}>
                <td style={S.td} colSpan={3}><strong>TOTAL</strong></td>
                <td style={{ ...S.td, textAlign: 'right' }}><strong>{CRC(totales.ventas)}</strong></td>
                <td style={{ ...S.td, textAlign: 'right', color: C.red }}>{totales.notas > 0 ? <span>−{CRC(totales.notas)}</span> : '—'}</td>
                <td style={{ ...S.td, textAlign: 'right', color: C.teal }}><strong>{CRC(totales.neto)}</strong></td>
                <td style={{ ...S.td, textAlign: 'right', color: C.muted }}>{CRC(totales.costo)}</td>
                <td style={{ ...S.td, textAlign: 'right', color: C.green }}><strong>{CRC(totales.utilidad)}</strong></td>
                <td style={{ ...S.td, textAlign: 'right' }}><strong style={{ color: margenColor(margen + '%') }}>{margen}%</strong></td>
                <td style={{ ...S.td, textAlign: 'right' }}>{totales.trans}</td>
                <td style={S.td}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── TabCategorias ─────────────────────────────────────────────────────────────
function TabCategorias({ sel }) {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [expand, setExpand] = useState({});

  useEffect(() => {
    if (!sel) return;
    setCargando(true);
    (async () => {
      const fechaDia = sel.slice(0, 10);
      let todos = [], off = 0;
      while (true) {
        const { data } = await supabase
          .from('neo_informe_ventas_categoria')
          .select('*')
          .gte('fecha_carga', fechaDia + 'T00:00:00')
          .lte('fecha_carga', fechaDia + 'T23:59:59')
          .range(off, off + 999);
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }
      setDatos(todos.filter(r => r.categoria && r.categoria.trim() && !r.es_total));
      setCargando(false);
    })();
  }, [sel]);

  // Agrupar por categoría principal y subcategorías
  const grupos = useMemo(() => {
    const map = {};
    for (const r of datos) {
      const cat = r.categoria;
      const sub = r.subcategoria || null;
      if (!map[cat]) map[cat] = { cat, items: [], totales: { ventas: 0, notas: 0, costo: 0, utilidad: 0, unidades: 0, trans: 0 } };
      map[cat].items.push(r);
      // Si tiene subcategoria, la fila es un detalle; si no, es el total de la categoría
      if (!sub) {
        // Es fila de total de categoría (sin subcategoría)
        map[cat].totales = {
          ventas:   parseNum(r.ventas_netas),
          notas:    parseNum(r.notas_totales),
          costo:    parseNum(r.costo),
          utilidad: parseNum(r.utilidad),
          unidades: parseNum(r.unidades_vendidas),
          trans:    parseNum(r.transacciones),
          pct:      parsePct(r.pct_utilidad),
        };
      }
    }
    // Calcular totales para categorías que solo tienen subcategorías
    for (const g of Object.values(map)) {
      if (!g.totales.ventas && g.items.length) {
        const subs = g.items.filter(r => r.subcategoria);
        g.totales = {
          ventas:   subs.reduce((s,r) => s + parseNum(r.ventas_netas), 0),
          notas:    subs.reduce((s,r) => s + parseNum(r.notas_totales), 0),
          costo:    subs.reduce((s,r) => s + parseNum(r.costo), 0),
          utilidad: subs.reduce((s,r) => s + parseNum(r.utilidad), 0),
          unidades: subs.reduce((s,r) => s + parseNum(r.unidades_vendidas), 0),
          trans:    subs.reduce((s,r) => s + parseNum(r.transacciones), 0),
        };
        g.totales.pct = g.totales.ventas > 0 ? (g.totales.utilidad / g.totales.ventas * 100) : 0;
      }
    }
    return Object.values(map).sort((a,b) => b.totales.utilidad - a.totales.utilidad);
  }, [datos]);

  const maxUtilidad = useMemo(() => Math.max(...grupos.map(g => g.totales.utilidad), 1), [grupos]);

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>⏳ Cargando...</div>;
  if (!grupos.length) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📦</div>
      <div style={{ fontWeight: 600, color: C.text }}>Sin datos de categorías</div>
      <div style={{ fontSize: '0.85rem', marginTop: 6 }}>Subí el <strong>Informe de ventas por Categoría</strong> en <a href="/reportes" style={{ color: C.orange }}>Carga de reportes</a></div>
    </div>
  );

  const totalUtil = grupos.reduce((s,g) => s + g.totales.utilidad, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ ...S.card, padding: '14px 20px', display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
        <div><div style={S.caption}>Categorías activas</div><div style={{ fontSize: '1.6rem', fontWeight: 800, color: C.orange }}>{grupos.length}</div></div>
        <div><div style={S.caption}>Utilidad total</div><div style={{ fontSize: '1.6rem', fontWeight: 800, color: C.green }}>{CRC(totalUtil)}</div></div>
        <div><div style={S.caption}>Mejor categoría</div><div style={{ fontSize: '1rem', fontWeight: 700, color: C.teal }}>{grupos[0]?.cat}</div></div>
        <div><div style={S.caption}>Mayor margen</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: margenColor(grupos.reduce((best,g) => g.totales.pct > best ? g.totales.pct : best, 0) + '%') }}>
            {grupos.reduce((best,g) => g.totales.cat && g.totales.pct > parsePct(best.split('%')[0]) ? g.totales.pct.toFixed(1) + '% — ' + g.cat : best, '0% — —')}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {grupos.map((g, idx) => {
          const isOpen = expand[g.cat];
          const subs = g.items.filter(r => r.subcategoria);
          const pct = g.totales.pct || 0;
          const barW = Math.round((g.totales.utilidad / maxUtilidad) * 100);
          const neto = g.totales.ventas - g.totales.notas;
          const semaforo = pct >= 45 ? '🟢' : pct >= 30 ? '🔵' : pct >= 20 ? '🟡' : '🔴';

          return (
            <div key={g.cat} style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
              {/* Header de categoría */}
              <div
                onClick={() => subs.length && setExpand(e => ({ ...e, [g.cat]: !isOpen }))}
                style={{ padding: '14px 20px', cursor: subs.length ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: C.muted, width: 24, textAlign: 'center' }}>{idx + 1}</div>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem', color: C.text }}>{semaforo} {g.cat}</div>
                  {/* Barra de utilidad */}
                  <div style={{ marginTop: 6, height: 5, borderRadius: 3, background: C.border, width: '100%', maxWidth: 220 }}>
                    <div style={{ height: '100%', borderRadius: 3, background: margenColor(pct + '%'), width: barW + '%', transition: 'width .4s' }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 100 }}>
                  <div style={{ fontSize: '0.72rem', color: C.muted }}>Ventas netas</div>
                  <div style={{ fontWeight: 700 }}>{CRC(g.totales.ventas)}</div>
                </div>
                {g.totales.notas > 0 && (
                  <div style={{ textAlign: 'right', minWidth: 90 }}>
                    <div style={{ fontSize: '0.72rem', color: C.red }}>Notas crédito</div>
                    <div style={{ fontWeight: 600, color: C.red }}>−{CRC(g.totales.notas)}</div>
                  </div>
                )}
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: '0.72rem', color: C.muted }}>Neto real</div>
                  <div style={{ fontWeight: 700, color: C.teal }}>{CRC(neto)}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 90 }}>
                  <div style={{ fontSize: '0.72rem', color: C.muted }}>Utilidad</div>
                  <div style={{ fontWeight: 800, color: C.green }}>{CRC(g.totales.utilidad)}</div>
                </div>
                <div style={{ textAlign: 'right', minWidth: 70 }}>
                  <div style={{ fontSize: '0.72rem', color: C.muted }}>Margen</div>
                  <div style={{ fontWeight: 800, color: margenColor(pct + '%') }}>{pct.toFixed(1)}%</div>
                </div>
                {subs.length > 0 && (
                  <div style={{ color: C.muted, fontSize: '0.8rem', marginLeft: 4 }}>{isOpen ? '▲' : '▼'} {subs.length} subcats</div>
                )}
              </div>

              {/* Subcategorías expandidas */}
              {isOpen && subs.length > 0 && (
                <div style={{ borderTop: `1px solid ${C.border}`, background: '#fdf8f8' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        <th style={{ ...S.th, paddingLeft: 48 }}>Subcategoría</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Unidades</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Ventas netas</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Notas</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Costo</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Utilidad</th>
                        <th style={{ ...S.th, textAlign: 'right' }}>Margen</th>
                      </tr>
                    </thead>
                    <tbody>
                      {subs.sort((a,b) => parseNum(b.utilidad) - parseNum(a.utilidad)).map((sub, si) => {
                        const subNeto = parseNum(sub.ventas_netas) - parseNum(sub.notas_totales);
                        const subPct  = parsePct(sub.pct_utilidad);
                        return (
                          <tr key={si} style={{ borderTop: `1px solid ${C.border}` }}>
                            <td style={{ ...S.td, paddingLeft: 48, color: C.teal, fontWeight: 500 }}>↳ {sub.subcategoria}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{parseNum(sub.unidades_vendidas).toLocaleString('es-CR', { maximumFractionDigits: 1 })}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{CRC(sub.ventas_netas)}</td>
                            <td style={{ ...S.td, textAlign: 'right', color: parseNum(sub.notas_totales) > 0 ? C.red : C.muted }}>
                              {parseNum(sub.notas_totales) > 0 ? '−' + CRC(sub.notas_totales) : '—'}
                            </td>
                            <td style={{ ...S.td, textAlign: 'right', color: C.muted }}>{CRC(sub.costo)}</td>
                            <td style={{ ...S.td, textAlign: 'right', color: C.green, fontWeight: 700 }}>{CRC(sub.utilidad)}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>
                              <span style={{ fontWeight: 700, color: margenColor(subPct + '%') }}>{subPct.toFixed(1)}%</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Leyenda semáforo */}
      <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: '0.78rem', color: C.muted, padding: '8px 4px' }}>
        <span>🟢 Margen ≥ 45%</span>
        <span>🔵 30–44%</span>
        <span>🟡 20–29%</span>
        <span>🔴 &lt; 20%</span>
      </div>
    </div>
  );
}

// ── TabProductos ─────────────────────────────────────────────────────────────
function TabProductos({ sel }) {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [buscar, setBuscar] = useState('');
  const [orden, setOrden] = useState('utilidad');
  const [filtroMgn, setFiltroMgn] = useState('todos');

  useEffect(() => {
    if (!sel) return;
    setCargando(true);
    (async () => {
      const fechaDia = sel.slice(0, 10);
      let todos = [], off = 0;
      while (true) {
        const { data } = await supabase
          .from('neo_items_facturados')
          .select('vendedor,item,codigo_interno,bodega,cantidad_facturada,cantidad_devuelta,precio_unitario,costo_unitario,subtotal,descuento,impuestos,utilidad_costo,total,factura')
          .gte('fecha_carga', fechaDia + 'T00:00:00')
          .lte('fecha_carga', fechaDia + 'T23:59:59')
          .range(off, off + 999);
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }
      setDatos(todos);
      setCargando(false);
    })();
  }, [sel]);

  // Agrupar por producto
  const productos = useMemo(() => {
    const map = {};
    for (const r of datos) {
      const key = r.codigo_interno || r.item || 'Sin código';
      if (!map[key]) map[key] = {
        codigo: r.codigo_interno, item: r.item, bodega: r.bodega,
        unidades: 0, ventas: 0, costo_total: 0, descuentos: 0, utilidad: 0,
        facturas: new Set(), vendedores: new Set(),
      };
      const p = map[key];
      const cant = parseNum(r.cantidad_facturada) - parseNum(r.cantidad_devuelta);
      const precio = parseNum(r.precio_unitario);
      const costo  = parseNum(r.costo_unitario);
      const sub    = parseNum(r.subtotal);
      const desc   = parseNum(r.descuento);
      p.unidades     += cant;
      p.ventas       += sub;
      p.descuentos   += desc;
      p.costo_total  += costo * Math.max(0, cant);
      p.utilidad     += (sub - desc - (costo * Math.max(0, cant)));
      if (r.factura) p.facturas.add(r.factura);
      if (r.vendedor) p.vendedores.add(r.vendedor);
    }
    return Object.values(map).map(p => ({
      ...p,
      facturas:   p.facturas.size,
      vendedores: [...p.vendedores].join(', '),
      margen:     p.ventas > 0 ? (p.utilidad / p.ventas * 100) : 0,
    }));
  }, [datos]);

  const filtrados = useMemo(() => {
    let lista = productos;
    if (buscar) lista = lista.filter(p => (p.item||'').toLowerCase().includes(buscar.toLowerCase()) || (p.codigo||'').toLowerCase().includes(buscar.toLowerCase()));
    if (filtroMgn === 'alto')   lista = lista.filter(p => p.margen >= 45);
    if (filtroMgn === 'medio')  lista = lista.filter(p => p.margen >= 20 && p.margen < 45);
    if (filtroMgn === 'bajo')   lista = lista.filter(p => p.margen < 20);
    if (filtroMgn === 'eliminar') lista = lista.filter(p => p.unidades <= 0 || p.utilidad < 0);
    lista = [...lista].sort((a, b) => {
      if (orden === 'utilidad') return b.utilidad - a.utilidad;
      if (orden === 'ventas')   return b.ventas - a.ventas;
      if (orden === 'margen')   return b.margen - a.margen;
      if (orden === 'unidades') return b.unidades - a.unidades;
      return 0;
    });
    return lista;
  }, [productos, buscar, orden, filtroMgn]);

  const stats = useMemo(() => ({
    total:    productos.length,
    utilAlto: productos.filter(p => p.margen >= 45).length,
    utilBajo: productos.filter(p => p.margen < 20).length,
    candidatos: productos.filter(p => p.unidades <= 0 || p.utilidad < 0).length,
  }), [productos]);

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>⏳ Cargando...</div>;
  if (!productos.length) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
      <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>📦</div>
      <div style={{ fontWeight: 600, color: C.text }}>Sin datos de ítems</div>
      <div style={{ fontSize: '0.85rem', marginTop: 6 }}>Subí <strong>Lista de ítems facturados</strong> en <a href="/reportes" style={{ color: C.orange }}>Carga de reportes</a></div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Stats rápidos */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { label: 'Productos vendidos', val: stats.total, color: C.text },
          { label: 'Margen alto (≥45%)', val: stats.utilAlto, color: C.green },
          { label: 'Margen bajo (<20%)', val: stats.utilBajo, color: C.gold },
          { label: 'Candidatos a eliminar', val: stats.candidatos, color: C.red },
        ].map(k => (
          <div key={k.label} style={S.cardSm}>
            <div style={S.caption}>{k.label}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={buscar} onChange={e => setBuscar(e.target.value)}
          placeholder="🔍 Buscar producto o código..."
          style={{ ...S.select, flex: 1, minWidth: 200 }}
        />
        <select value={orden} onChange={e => setOrden(e.target.value)} style={S.select}>
          <option value="utilidad">↓ Mayor utilidad</option>
          <option value="ventas">↓ Mayor ventas</option>
          <option value="margen">↓ Mayor margen</option>
          <option value="unidades">↓ Más unidades</option>
        </select>
        <select value={filtroMgn} onChange={e => setFiltroMgn(e.target.value)} style={S.select}>
          <option value="todos">Todos los productos</option>
          <option value="alto">🟢 Margen alto (≥45%)</option>
          <option value="medio">🔵 Margen medio (20–44%)</option>
          <option value="bajo">🟡 Margen bajo (&lt;20%)</option>
          <option value="eliminar">🔴 Candidatos a eliminar</option>
        </select>
        <span style={S.caption}>{filtrados.length} productos</span>
      </div>

      {/* Tabla */}
      <div style={S.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fdf0f0' }}>
                <th style={S.th}>Producto</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Unidades</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Ventas</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Costo</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Utilidad</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Margen</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Facturas</th>
                <th style={S.th}>Vendedor(es)</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, 200).map((p, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8' }}>
                  <td style={S.td}>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{p.item || '—'}</div>
                    {p.codigo && <div style={{ fontSize: '0.73rem', color: C.muted }}>{p.codigo}</div>}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{p.unidades.toLocaleString('es-CR', { maximumFractionDigits: 1 })}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{CRC(p.ventas)}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: C.muted }}>{CRC(p.costo_total)}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: p.utilidad >= 0 ? C.green : C.red }}>{CRC(p.utilidad)}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: margenColor(p.margen + '%') }}>{p.margen.toFixed(1)}%</span>
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{p.facturas}</td>
                  <td style={{ ...S.td, fontSize: '0.78rem', color: C.muted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.vendedores}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length > 200 && <div style={{ padding: 12, textAlign: 'center', color: C.muted, fontSize: '0.8rem' }}>Mostrando 200 de {filtrados.length} productos</div>}
        </div>
      </div>
    </div>
  );
}

// ── TabComisiones ─────────────────────────────────────────────────────────────
function TabComisiones({ sel }) {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [params, setParams] = useState({ meta: 500000, pct_base: 3, pct_bono_meta: 1, pct_bono_mgn: 1, umbral_mgn: 35 });

  useEffect(() => {
    if (!sel) return;
    setCargando(true);
    (async () => {
      const fechaDia = sel.slice(0, 10);
      let todos = [], off = 0;
      while (true) {
        const { data } = await supabase
          .from('neo_informe_ventas_vendedor')
          .select('*')
          .gte('fecha_carga', fechaDia + 'T00:00:00')
          .lte('fecha_carga', fechaDia + 'T23:59:59')
          .range(off, off + 999);
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }
      setDatos(todos.filter(r => r.vendedor && r.vendedor.trim() && !r.es_total));
      setCargando(false);
    })();
  }, [sel]);

  const comisiones = useMemo(() => datos.map(r => {
    const neto = parseNum(r.ventas_netas) - parseNum(r.notas_totales);
    const mgn  = parsePct(r.pct_utilidad);
    const base  = neto * (params.pct_base / 100);
    const bMeta = neto >= params.meta ? neto * (params.pct_bono_meta / 100) : 0;
    const bMgn  = mgn >= params.umbral_mgn ? neto * (params.pct_bono_mgn / 100) : 0;
    const total = base + bMeta + bMgn;
    const avance = neto / params.meta;
    return { ...r, neto, mgn, base, bMeta, bMgn, total, avance };
  }).sort((a,b) => b.total - a.total), [datos, params]);

  const P = (key, label, min, max, step, prefix='', suffix='') => (
    <div style={S.cardSm}>
      <label style={S.label}>{label}</label>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {prefix && <span style={{ color: C.muted, fontSize: '0.85rem' }}>{prefix}</span>}
        <input type="number" min={min} max={max} step={step} value={params[key]}
          onChange={e => setParams(p => ({ ...p, [key]: parseFloat(e.target.value) || 0 }))}
          style={{ ...S.select, width: 100, fontWeight: 700 }} />
        {suffix && <span style={{ color: C.muted, fontSize: '0.85rem' }}>{suffix}</span>}
      </div>
    </div>
  );

  if (cargando) return <div style={{ padding: 40, textAlign: 'center', color: C.muted }}>⏳ Cargando...</div>;
  if (!datos.length) return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
      <div style={{ fontWeight: 600, color: C.text }}>Sin datos de vendedores</div>
      <div style={{ fontSize: '0.85rem', marginTop: 6 }}>Subí el <strong>Informe de ventas por vendedor</strong> en <a href="/reportes" style={{ color: C.orange }}>Carga de reportes</a></div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Parámetros */}
      <div style={S.card}>
        <div style={S.kicker}>Parámetros de comisión</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14, marginTop: 12 }}>
          {P('meta', 'Meta mensual', 0, 10000000, 50000, '₡')}
          {P('pct_base', 'Comisión base', 0, 20, 0.5, '', '%')}
          {P('pct_bono_meta', 'Bono si supera meta', 0, 20, 0.5, '', '%')}
          {P('pct_bono_mgn', 'Bono margen alto', 0, 20, 0.5, '', '%')}
          {P('umbral_mgn', 'Umbral margen (bono)', 0, 80, 1, '', '%')}
        </div>
        <div style={{ marginTop: 10, fontSize: '0.78rem', color: C.muted }}>
          Comisión total = Comisión base + Bono meta (si neto ≥ meta) + Bono margen (si margen ≥ umbral). Todos sobre <strong>ventas netas − notas de crédito</strong>.
        </div>
      </div>

      {/* Tabla */}
      <div style={S.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fdf0f0' }}>
                <th style={S.th}>Vendedor</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Neto real</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Avance meta</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Margen</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Com. base</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Bono meta</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Bono margen</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Total comisión</th>
              </tr>
            </thead>
            <tbody>
              {comisiones.map((r, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8' }}>
                  <td style={{ ...S.td, fontWeight: 700 }}>{r.vendedor}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: C.teal, fontWeight: 600 }}>{CRC(r.neto)}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <div style={{ width: 80, height: 6, borderRadius: 3, background: C.border }}>
                        <div style={{ height: '100%', borderRadius: 3, background: r.avance >= 1 ? C.green : C.orange, width: Math.min(100, r.avance * 100) + '%' }} />
                      </div>
                      <span style={{ fontSize: '0.82rem', fontWeight: 600, color: r.avance >= 1 ? C.green : C.orange }}>
                        {(r.avance * 100).toFixed(0)}%
                      </span>
                    </div>
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: margenColor(r.mgn + '%') }}>{r.mgn.toFixed(1)}%</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{CRC(r.base)}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: r.bMeta > 0 ? C.green : C.muted }}>{r.bMeta > 0 ? CRC(r.bMeta) : '—'}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: r.bMgn > 0 ? C.green : C.muted }}>{r.bMgn > 0 ? CRC(r.bMgn) : '—'}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <strong style={{ fontSize: '1rem', color: C.orange }}>{CRC(r.total)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#fdf0f0', fontWeight: 700 }}>
                <td style={S.td}><strong>TOTAL</strong></td>
                <td style={{ ...S.td, textAlign: 'right', color: C.teal }}><strong>{CRC(comisiones.reduce((s,r)=>s+r.neto,0))}</strong></td>
                <td style={S.td} colSpan={2}></td>
                <td style={{ ...S.td, textAlign: 'right' }}>{CRC(comisiones.reduce((s,r)=>s+r.base,0))}</td>
                <td style={{ ...S.td, textAlign: 'right', color: C.green }}>{CRC(comisiones.reduce((s,r)=>s+r.bMeta,0))}</td>
                <td style={{ ...S.td, textAlign: 'right', color: C.green }}>{CRC(comisiones.reduce((s,r)=>s+r.bMgn,0))}</td>
                <td style={{ ...S.td, textAlign: 'right' }}><strong style={{ color: C.orange, fontSize: '1rem' }}>{CRC(comisiones.reduce((s,r)=>s+r.total,0))}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function VendedoresPage() {
  const [tab, setTab] = useState('resumen');
  const { periodos, sel, setSel } = usePeriodos();

  const tabs = [
    { key: 'resumen',    label: '📊 Resumen ejecutivo' },
    { key: 'categorias', label: '📦 Categorías' },
    { key: 'productos',  label: '🔍 Productos' },
    { key: 'comisiones', label: '💰 Comisiones' },
  ];

  return (
    <div>
      {/* Header */}
      <div style={S.kicker}>Comercial</div>
      <h1 style={{ margin: '0 0 4px', fontSize: '1.9rem', fontWeight: 800, color: C.text }}>👥 Equipo de ventas</h1>
      <p style={{ color: C.muted, margin: '0 0 24px', fontSize: '0.9rem' }}>
        Rendimiento, utilidad y comisiones · Análisis por categoría y producto
      </p>

      {/* Selector de período */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div>
          <label style={S.label}>Período</label>
          <select value={sel} onChange={e => setSel(e.target.value)} style={S.select}>
            {periodos.map(p => (
              <option key={p.fecha_carga} value={p.fecha_carga}>
                {new Date(p.fecha_carga).toLocaleDateString('es-CR', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })} — {p.periodo_reporte || 'Sin período'}
              </option>
            ))}
          </select>
        </div>
        {sel && <div style={{ fontSize: '0.8rem', color: C.muted, marginTop: 18 }}>📅 {periodos.find(p=>p.fecha_carga===sel)?.periodo_reporte || 'Sin período'}</div>}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, borderBottom: `1px solid ${C.border}`, paddingBottom: 0 }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={tab === t.key ? S.tabActive : S.tab}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenido */}
      {tab === 'resumen'    && <TabResumen    sel={sel} />}
      {tab === 'categorias' && <TabCategorias sel={sel} />}
      {tab === 'productos'  && <TabProductos  sel={sel} />}
      {tab === 'comisiones' && <TabComisiones sel={sel} />}
    </div>
  );
}
