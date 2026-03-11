'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// ── Design tokens (mismo sistema que el resto de SOL) ────────────────────────
const C = {
  orange: '#ED6E2E', burgundy: '#5E2733', teal: '#225F74',
  cream: '#FDF4F4', green: '#276749', red: '#C53030',
  gold: '#B7791F', muted: '#8a7070', border: '#EAE0E0',
  text: '#1a1a1a', bg: '#FDF4F4',
};
const S = {
  kicker:  { color: C.orange, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 },
  card:    { background: '#fff', borderRadius: 14, border: `1px solid ${C.border}`, padding: '20px 24px', boxShadow: '0 1px 4px rgba(94,39,51,0.06)' },
  cardSm:  { background: '#fff', borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(94,39,51,0.05)' },
  tab:     { padding: '8px 18px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: C.muted, transition: 'all .15s' },
  tabOn:   { padding: '8px 18px', borderRadius: 8, border: 'none', background: C.cream, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: C.orange, borderBottom: `2px solid ${C.orange}`, transition: 'all .15s' },
  th:      { padding: '9px 12px', fontSize: '0.73rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}`, textAlign: 'left', whiteSpace: 'nowrap', background: '#fdf8f8' },
  td:      { padding: '9px 12px', fontSize: '0.84rem', borderBottom: `1px solid #f5eeee`, color: C.text },
  label:   { fontSize: '0.73rem', fontWeight: 700, color: C.muted, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' },
  select:  { padding: '7px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: '0.88rem', color: C.text, fontFamily: 'Rubik, sans-serif', outline: 'none' },
  input:   { padding: '7px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: '0.88rem', color: C.text, fontFamily: 'Rubik, sans-serif', outline: 'none' },
  caption: { fontSize: '0.75rem', color: C.muted, marginTop: 3 },
  btnPrimary: { background: C.orange, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 18px', fontWeight: 700, cursor: 'pointer', fontSize: '0.88rem', fontFamily: 'Rubik, sans-serif' },
  btnGhost:   { background: C.cream, color: C.text, border: `1px solid ${C.border}`, borderRadius: 8, padding: '7px 14px', fontWeight: 600, cursor: 'pointer', fontSize: '0.85rem', fontFamily: 'Rubik, sans-serif' },
};

// ── Utilidades ───────────────────────────────────────────────────────────────
const CRC  = v => '₡' + Math.round(parseFloat(v) || 0).toLocaleString('es-CR');
const N    = v => parseFloat(v) || 0;
const PCT  = v => (N(v) * 100).toFixed(1) + '%';
const margenColor = p => p >= 45 ? C.green : p >= 30 ? C.teal : p >= 20 ? C.gold : C.red;
const semaforo    = p => p >= 45 ? '🟢' : p >= 30 ? '🔵' : p >= 20 ? '🟡' : '🔴';
const medallas    = ['🥇', '🥈', '🥉'];

function ProgressBar({ value, max, color = C.orange, height = 6 }) {
  const pct = Math.min(100, Math.round((value / Math.max(max, 1)) * 100));
  return (
    <div style={{ background: C.border, borderRadius: height, height, width: '100%' }}>
      <div style={{ background: color, borderRadius: height, height, width: pct + '%', transition: 'width .4s ease' }} />
    </div>
  );
}

function Spinner() {
  return <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: '0.9rem' }}>⏳ Cargando...</div>;
}

function Vacío({ msg, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
      <div style={{ fontSize: '2.2rem', marginBottom: 10 }}>📊</div>
      <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>{msg}</div>
      {sub && <div style={{ fontSize: '0.84rem' }}>{sub}</div>}
    </div>
  );
}

function Leyenda() {
  return (
    <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', fontSize: '0.75rem', color: C.muted, padding: '6px 2px' }}>
      <span>🟢 Margen ≥ 45%</span><span>🔵 30–44%</span><span>🟡 20–29%</span><span>🔴 &lt; 20%</span>
    </div>
  );
}

// ── Selector de período ──────────────────────────────────────────────────────
function SelectorPeriodo({ modo, setModo, periodoSel, setPeriodoSel, periodos, fechaDesde, setFechaDesde, fechaHasta, setFechaHasta }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 20, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      <div>
        <label style={S.label}>Modo de filtro</label>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['carga', '📂 Por reporte cargado'], ['rango', '📅 Rango libre']].map(([m, l]) => (
            <button key={m} onClick={() => setModo(m)} style={{ ...S.select, fontWeight: 700, cursor: 'pointer', border: 'none', background: modo === m ? C.orange : C.cream, color: modo === m ? '#fff' : C.muted }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {modo === 'carga' && (
        <div style={{ flex: 1, minWidth: 260 }}>
          <label style={S.label}>Período</label>
          <select value={periodoSel} onChange={e => setPeriodoSel(e.target.value)} style={{ ...S.select, width: '100%', fontWeight: 600 }}>
            {periodos.length === 0 && <option value="">Sin datos — subí reportes en Carga de reportes</option>}
            {periodos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div style={S.caption}>Período detectado automáticamente al subir el archivo</div>
        </div>
      )}

      {modo === 'rango' && (
        <>
          <div>
            <label style={S.label}>Desde</label>
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} style={S.input} />
          </div>
          <div>
            <label style={S.label}>Hasta</label>
            <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} style={S.input} />
          </div>
          <div style={{ fontSize: '0.78rem', color: C.muted, maxWidth: 200 }}>
            Acumula datos de múltiples cargas dentro del rango indicado.
          </div>
        </>
      )}
    </div>
  );
}

// ── Hook: carga ítems facturados ─────────────────────────────────────────────
function useItems(modo, periodoSel, fechaDesde, fechaHasta) {
  const [items, setItems]       = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const ready = modo === 'carga' ? !!periodoSel : !!(fechaDesde && fechaHasta);
    if (!ready) return;
    setCargando(true);
    setItems([]);
    (async () => {
      let todos = [], off = 0;
      while (true) {
        let q = supabase
          .from('neo_items_facturados')
          .select('vendedor,item,codigo_interno,bodega,cantidad_facturada,cantidad_devuelta,precio_unitario,costo_unitario,subtotal,descuento,impuestos,total,factura,fecha,territorio')
          .range(off, off + 999);
        if (modo === 'carga') q = q.eq('periodo_reporte', periodoSel);
        const { data } = await q;
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }
      if (modo === 'rango') {
        const desde = new Date(fechaDesde).getTime();
        const hasta = new Date(fechaHasta + 'T23:59:59').getTime();
        todos = todos.filter(r => {
          const f = parseFloat(r.fecha);
          if (!f) return true;
          const ms = (f - 25569) * 86400 * 1000;
          return ms >= desde && ms <= hasta;
        });
      }
      setItems(todos);
      setCargando(false);
    })();
  }, [modo, periodoSel, fechaDesde, fechaHasta]);

  return { items, cargando };
}

// ── Hook: informe por vendedor (NC reales) ────────────────────────────────────
// Parsea el string de período para obtener fechas reales
function parsarPeriodo(periodoStr) {
  // "Del DD/MM/YYYY al DD/MM/YYYY"
  const m1 = periodoStr?.match(/Del\s+(\d{2})\/(\d{2})\/(\d{4})\s+al\s+(\d{2})\/(\d{2})\/(\d{4})/);
  if (m1) {
    const [, d1, mo1, y1, d2, mo2, y2] = m1;
    return {
      desde: new Date(`${y1}-${mo1}-${d1}`),
      hasta: new Date(`${y2}-${mo2}-${d2}`),
    };
  }
  // "Día YYYY-MM-DD"
  const m2 = periodoStr?.match(/Día\s+(\d{4}-\d{2}-\d{2})/);
  if (m2) {
    const d = new Date(m2[1]);
    return { desde: d, hasta: d };
  }
  return null;
}

function useInformeVendedor(modo, periodoSel, fechaDesde, fechaHasta) {
  const [informe, setInforme] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    const ready = modo === 'carga' ? !!periodoSel : !!(fechaDesde && fechaHasta);
    if (!ready) { setInforme([]); return; }
    setCargando(true);
    (async () => {
      let todos = [], off = 0;
      while (true) {
        let q = supabase
          .from('neo_informe_ventas_vendedor')
          .select('*')
          .range(off, off + 499);
        if (modo === 'carga') q = q.eq('periodo_reporte', periodoSel);
        const { data } = await q;
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 500) break;
        off += 500;
      }

      // En modo rango: filtrar sólo los períodos cuyas fechas caigan dentro del rango seleccionado
      if (modo === 'rango') {
        const desde = new Date(fechaDesde);
        const hasta = new Date(fechaHasta + 'T23:59:59');
        todos = todos.filter(r => {
          const rango = parsarPeriodo(r.periodo_reporte);
          if (!rango) return false;
          // Incluir si hay solapamiento: el período empieza antes del hasta Y termina después del desde
          return rango.desde <= hasta && rango.hasta >= desde;
        });
      }

      setInforme(todos);
      setCargando(false);
    })();
  }, [modo, periodoSel, fechaDesde, fechaHasta]);

  return { informe, cargando };
}

// ── Hook: metas por vendedor ─────────────────────────────────────────────────
function useMetas() {
  const [metas, setMetas]   = useState({});
  const [loading, setLoading] = useState(true);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('sol_metas_vendedor').select('*');
    const map = {};
    for (const r of (data || [])) map[r.vendedor] = r;
    setMetas(map);
    setLoading(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const guardar = async (vendedor, campos) => {
    const existe = !!metas[vendedor];
    const payload = { vendedor, ...campos };
    if (existe) {
      await supabase.from('sol_metas_vendedor').update(payload).eq('vendedor', vendedor);
    } else {
      await supabase.from('sol_metas_vendedor').insert(payload);
    }
    await cargar();
  };

  return { metas, loading, guardar };
}

// ── Hook: historial de períodos ──────────────────────────────────────────────
function useHistorial() {
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    (async () => {
      // Obtener todos los períodos únicos del informe por vendedor
      const { data } = await supabase
        .from('neo_informe_ventas_vendedor')
        .select('periodo_reporte,vendedor,ventas_netas,notas_sin_imp,utilidad,pct_utilidad')
        .order('periodo_reporte', { ascending: true });
      setHistorial(data || []);
      setLoading(false);
    })();
  }, []);

  return { historial, loading };
}

// ── Cálculo de métricas — usa ítems si hay, sino usa informe de vendedor ──────
function useMétricas(items, informeVendedor) {
  return useMemo(() => {
    // Si hay ítems facturados, calcular desde ahí (más detallado)
    if (items.length > 0) {
      const vMap = {}, pMap = {}, mMap = {};

      for (const r of items) {
        const vendedor = (r.vendedor || 'Sin vendedor').trim();
        const prod     = (r.item || 'Sin descripción').trim();
        const codigo   = (r.codigo_interno || '').trim();
        const factura  = (r.factura || '').trim();
        const cant     = Math.max(0, N(r.cantidad_facturada) - N(r.cantidad_devuelta));
        const sub      = N(r.subtotal);
        const desc     = N(r.descuento);
        const venta    = sub - desc;
        const costo    = N(r.costo_unitario) * cant;
        const util     = venta - costo;

        if (!vMap[vendedor]) vMap[vendedor] = { vendedor, ventas: 0, costo: 0, util: 0, items: 0, facturas: new Set() };
        vMap[vendedor].ventas   += venta;
        vMap[vendedor].costo    += costo;
        vMap[vendedor].util     += util;
        vMap[vendedor].items    += cant;
        if (factura) vMap[vendedor].facturas.add(factura);

        const pk = codigo || prod;
        if (!pMap[pk]) pMap[pk] = { item: prod, codigo, ventas: 0, costo: 0, util: 0, unidades: 0, vendedores: new Set() };
        pMap[pk].ventas   += venta;
        pMap[pk].costo    += costo;
        pMap[pk].util     += util;
        pMap[pk].unidades += cant;
        if (vendedor) pMap[pk].vendedores.add(vendedor);

        const bodega = (r.bodega || '').trim() || 'Sin bodega';
        if (!mMap[bodega]) mMap[bodega] = { marca: bodega, ventas: 0, util: 0, unidades: 0 };
        mMap[bodega].ventas   += venta;
        mMap[bodega].util     += util;
        mMap[bodega].unidades += cant;
      }

      // Enriquecer con NC del informe oficial
      const ncMap = {};
      for (const r of informeVendedor) {
        const v = (r.vendedor || '').trim();
        if (!ncMap[v]) ncMap[v] = { nc: 0, ventas_netas_oficial: 0, util_oficial: 0 };
        ncMap[v].nc                   += N(r.notas_sin_imp);
        ncMap[v].ventas_netas_oficial += N(r.ventas_netas);
        ncMap[v].util_oficial         += N(r.utilidad);
      }

      const vendedores = Object.values(vMap).map(v => {
        const nc = ncMap[v.vendedor] || {};
        const ventasNetas = nc.ventas_netas_oficial || v.ventas;
        const utilNeta    = nc.util_oficial         || v.util;
        const margen      = ventasNetas > 0 ? utilNeta / ventasNetas * 100 : 0;
        return { ...v, facturas: v.facturas.size, nc: nc.nc || 0, ventasNetas, utilNeta, margen, _scoreMonto: ventasNetas, _scoreMargen: margen };
      }).sort((a, b) => b.ventasNetas - a.ventasNetas);

      const maxVentas = Math.max(...vendedores.map(v => v.ventasNetas), 1);
      const maxMargen = Math.max(...vendedores.map(v => v.margen), 1);
      for (const v of vendedores) v.scorePonderado = 0.6 * (v.ventasNetas / maxVentas) + 0.4 * (v.margen / maxMargen);

      const productos = Object.values(pMap).map(p => ({
        ...p, vendedores: [...p.vendedores].join(', '), margen: p.ventas > 0 ? p.util / p.ventas * 100 : 0,
      })).sort((a, b) => b.util - a.util);

      const marcas = Object.values(mMap).map(m => ({
        ...m, margen: m.ventas > 0 ? m.util / m.ventas * 100 : 0,
      })).sort((a, b) => b.util - a.util);

      return { vendedores, productos, marcas };
    }

    // Sin ítems — construir desde el informe de vendedor directamente
    if (informeVendedor.length > 0) {
      const vendedores = informeVendedor.map(r => {
        const ventasNetas = N(r.ventas_netas);
        const utilNeta    = N(r.utilidad);
        const margen      = ventasNetas > 0 ? utilNeta / ventasNetas * 100 : 0;
        const pctUtil     = N(String(r.pct_utilidad || '').replace('%', ''));
        return {
          vendedor:    (r.vendedor || '').trim(),
          ventas:      N(r.ventas_sin_imp),
          ventasNetas,
          nc:          N(r.notas_sin_imp),
          utilNeta,
          costo:       N(r.costo),
          items:       N(r.unidades_vendidas),
          facturas:    N(r.transacciones),
          margen:      margen || pctUtil,
          _scoreMonto: ventasNetas,
          _scoreMargen: margen || pctUtil,
        };
      }).filter(v => v.vendedor).sort((a, b) => b.ventasNetas - a.ventasNetas);

      const maxVentas = Math.max(...vendedores.map(v => v.ventasNetas), 1);
      const maxMargen = Math.max(...vendedores.map(v => v.margen), 1);
      for (const v of vendedores) v.scorePonderado = 0.6 * (v.ventasNetas / maxVentas) + 0.4 * (v.margen / maxMargen);

      return { vendedores, productos: [], marcas: [] };
    }

    return { vendedores: [], productos: [], marcas: [] };
  }, [items, informeVendedor]);
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1: RESUMEN EJECUTIVO
// ══════════════════════════════════════════════════════════════════════════════
function TabResumen({ vendedores, cargando, metas, periodoSel }) {
  const [ordenar, setOrdenar] = useState('ventasNetas'); // ventasNetas | utilNeta | margen | score

  const totales = useMemo(() => ({
    ventas: vendedores.reduce((s, v) => s + v.ventasNetas, 0),
    util:   vendedores.reduce((s, v) => s + v.utilNeta, 0),
    nc:     vendedores.reduce((s, v) => s + v.nc, 0),
    trans:  vendedores.reduce((s, v) => s + v.facturas, 0),
  }), [vendedores]);
  const margenGlobal = totales.ventas > 0 ? totales.util / totales.ventas * 100 : 0;

  const ordenados = useMemo(() => [...vendedores].sort((a, b) => {
    if (ordenar === 'ventasNetas') return b.ventasNetas - a.ventasNetas;
    if (ordenar === 'utilNeta')    return b.utilNeta - a.utilNeta;
    if (ordenar === 'margen')      return b.margen - a.margen;
    return b.scorePonderado - a.scorePonderado;
  }), [vendedores, ordenar]);

  if (cargando) return <Spinner />;
  if (!vendedores.length) return <Vacío msg="Sin datos de ventas" sub={<>Subí los reportes en <a href="/reportes" style={{ color: C.orange }}>Carga de reportes</a></>} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* KPIs globales */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 12 }}>
        {[
          { label: 'Vendedores activos', val: vendedores.length,       color: C.orange, big: true },
          { label: 'Ventas netas',       val: CRC(totales.ventas),      color: C.teal },
          { label: 'Notas de crédito',   val: CRC(totales.nc),          color: C.red },
          { label: 'Utilidad neta',      val: CRC(totales.util),        color: C.green },
          { label: 'Margen global',      val: margenGlobal.toFixed(1) + '%', color: margenColor(margenGlobal) },
        ].map(k => (
          <div key={k.label} style={S.cardSm}>
            <div style={S.caption}>{k.label}</div>
            <div style={{ fontSize: k.big ? '2rem' : '1.35rem', fontWeight: 800, color: k.color, margin: '4px 0 0' }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Tabla de vendedores */}
      <div style={S.card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={S.kicker}>Rendimiento por vendedor</div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: '0.75rem', color: C.muted }}>Ordenar por:</span>
            {[
              ['ventasNetas', '₡ Ventas'],
              ['utilNeta',    '₡ Utilidad'],
              ['margen',      '% Margen'],
              ['score',       '⭐ Score'],
            ].map(([k, l]) => (
              <button key={k} onClick={() => setOrdenar(k)}
                style={{ ...S.tab, ...(ordenar === k ? { ...S.tabOn, padding: '5px 12px' } : { padding: '5px 12px' }) }}>
                {l}
              </button>
            ))}
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...S.th, width: 30 }}>#</th>
                <th style={S.th}>Vendedor</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Ventas netas</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Notas crédito</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Utilidad</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Margen</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Avance meta</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Facturas</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Ticket prom.</th>
                <th style={{ ...S.th, textAlign: 'right' }}>⭐ Score</th>
              </tr>
            </thead>
            <tbody>
              {ordenados.map((v, i) => {
                const meta = metas[v.vendedor];
                const metaMonto = N(meta?.meta_ventas);
                const avance = metaMonto > 0 ? v.ventasNetas / metaMonto : null;
                return (
                  <tr key={v.vendedor} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8' }}>
                    <td style={{ ...S.td, fontWeight: 700, color: C.muted }}>{medallas[i] || i + 1}</td>
                    <td style={{ ...S.td, fontWeight: 700 }}>{v.vendedor}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: C.teal, fontWeight: 600 }}>{CRC(v.ventasNetas)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: v.nc > 0 ? C.red : C.muted }}>
                      {v.nc > 0 ? <span>−{CRC(v.nc)}</span> : '—'}
                    </td>
                    <td style={{ ...S.td, textAlign: 'right', color: C.green, fontWeight: 700 }}>{CRC(v.utilNeta)}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      <span style={{ fontWeight: 800, color: margenColor(v.margen) }}>{semaforo(v.margen)} {v.margen.toFixed(1)}%</span>
                    </td>
                    <td style={{ ...S.td, textAlign: 'right', minWidth: 120 }}>
                      {avance !== null ? (
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end', marginBottom: 3 }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: avance >= 1 ? C.green : C.orange }}>
                              {(avance * 100).toFixed(0)}%
                            </span>
                          </div>
                          <ProgressBar value={v.ventasNetas} max={metaMonto} color={avance >= 1 ? C.green : C.orange} />
                        </div>
                      ) : <span style={{ color: C.muted, fontSize: '0.78rem' }}>Sin meta</span>}
                    </td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{v.facturas}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: C.muted }}>
                      {v.facturas > 0 ? CRC(v.ventasNetas / v.facturas) : '—'}
                    </td>
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      <span style={{ fontWeight: 800, color: C.orange }}>
                        {(v.scorePonderado * 100).toFixed(0)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: '#fdf0f0', fontWeight: 700 }}>
                <td style={S.td} colSpan={2}><strong>TOTAL</strong></td>
                <td style={{ ...S.td, textAlign: 'right', color: C.teal }}><strong>{CRC(totales.ventas)}</strong></td>
                <td style={{ ...S.td, textAlign: 'right', color: C.red }}>{totales.nc > 0 ? `−${CRC(totales.nc)}` : '—'}</td>
                <td style={{ ...S.td, textAlign: 'right', color: C.green }}><strong>{CRC(totales.util)}</strong></td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <strong style={{ color: margenColor(margenGlobal) }}>{margenGlobal.toFixed(1)}%</strong>
                </td>
                <td style={S.td} colSpan={4}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Nota sobre el score */}
      <div style={{ ...S.cardSm, background: '#fffbf0', border: `1px solid #f6d860`, fontSize: '0.8rem', color: C.gold }}>
        <strong>⭐ Score ponderado:</strong> 60% ventas netas (vs. máximo del equipo) + 40% % de margen. Permite identificar vendedores que venden bien Y con margen saludable, no solo los de mayor volumen.
      </div>

      <Leyenda />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2: COMISIONES
// ══════════════════════════════════════════════════════════════════════════════
function TabComisiones({ vendedores, cargando, metas, guardarMeta }) {
  const [editando, setEditando] = useState(null); // vendedor en edición
  const [form, setForm]         = useState({});

  const abrirEditar = (v) => {
    const m = metas[v.vendedor] || {};
    setForm({
      meta_ventas:    m.meta_ventas    || '',
      meta_utilidad:  m.meta_utilidad  || '',
      pct_comision:   m.pct_comision   || '3',
      bono_meta:      m.bono_meta      || '1',
      bono_margen:    m.bono_margen    || '1',
      umbral_margen:  m.umbral_margen  || '35',
    });
    setEditando(v.vendedor);
  };

  const guardar = async () => {
    await guardarMeta(editando, {
      meta_ventas:   N(form.meta_ventas),
      meta_utilidad: N(form.meta_utilidad),
      pct_comision:  N(form.pct_comision),
      bono_meta:     N(form.bono_meta),
      bono_margen:   N(form.bono_margen),
      umbral_margen: N(form.umbral_margen),
    });
    setEditando(null);
  };

  const comisiones = useMemo(() => vendedores.map(v => {
    const m = metas[v.vendedor] || {};
    const pctBase    = N(m.pct_comision)  || 3;
    const pctMeta    = N(m.bono_meta)     || 1;
    const pctMgn     = N(m.bono_margen)   || 1;
    const umbral     = N(m.umbral_margen) || 35;
    const metaVentas = N(m.meta_ventas);
    const base = v.ventasNetas * (pctBase / 100);
    const bm   = metaVentas > 0 && v.ventasNetas >= metaVentas ? v.ventasNetas * (pctMeta / 100) : 0;
    const bmg  = v.margen >= umbral ? v.ventasNetas * (pctMgn / 100) : 0;
    const avance = metaVentas > 0 ? v.ventasNetas / metaVentas : null;
    return { ...v, base, bm, bmg, totalComision: base + bm + bmg, avance, pctBase, pctMeta, pctMgn, umbral };
  }).sort((a, b) => b.totalComision - a.totalComision), [vendedores, metas]);

  if (cargando) return <Spinner />;
  if (!vendedores.length) return <Vacío msg="Sin datos de vendedores" sub={<>Subí los reportes en <a href="/reportes" style={{ color: C.orange }}>Carga de reportes</a></>} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Info */}
      <div style={{ ...S.cardSm, background: '#f0f9ff', border: `1px solid #bee3f8`, fontSize: '0.82rem', color: '#2c5282' }}>
        <strong>💡 Comisiones:</strong> Base = % sobre ventas netas <strong>menos notas de crédito</strong>. Bono meta si supera el monto objetivo. Bono margen si el % de utilidad supera el umbral.
        Haz clic en ✏️ para configurar los parámetros de cada vendedor.
      </div>

      {/* Tabla */}
      <div style={S.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={S.th}>Vendedor</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Ventas netas</th>
                <th style={{ ...S.th, textAlign: 'right' }}>NC</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Margen</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Avance meta</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Com. base</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Bono meta</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Bono margen</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Total comisión</th>
                <th style={S.th}></th>
              </tr>
            </thead>
            <tbody>
              {comisiones.map((v, i) => (
                <tr key={v.vendedor} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8' }}>
                  <td style={{ ...S.td, fontWeight: 700 }}>{v.vendedor}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: C.teal, fontWeight: 600 }}>{CRC(v.ventasNetas)}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: v.nc > 0 ? C.red : C.muted }}>
                    {v.nc > 0 ? `−${CRC(v.nc)}` : '—'}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: margenColor(v.margen) }}>{v.margen.toFixed(1)}%</span>
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', minWidth: 110 }}>
                    {v.avance !== null ? (
                      <div>
                        <span style={{ fontWeight: 700, color: v.avance >= 1 ? C.green : C.orange, fontSize: '0.82rem' }}>
                          {(v.avance * 100).toFixed(0)}%
                        </span>
                        <ProgressBar value={v.ventasNetas} max={N(metas[v.vendedor]?.meta_ventas)} color={v.avance >= 1 ? C.green : C.orange} height={4} />
                      </div>
                    ) : <span style={{ color: C.muted, fontSize: '0.78rem' }}>Sin meta</span>}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{CRC(v.base)}</td>
                  <td style={{ ...S.td, textAlign: 'right', color: v.bm > 0 ? C.green : C.muted }}>
                    {v.bm > 0 ? CRC(v.bm) : '—'}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right', color: v.bmg > 0 ? C.green : C.muted }}>
                    {v.bmg > 0 ? CRC(v.bmg) : '—'}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <strong style={{ fontSize: '1rem', color: C.orange }}>{CRC(v.totalComision)}</strong>
                  </td>
                  <td style={S.td}>
                    <button onClick={() => abrirEditar(v)} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: '0.78rem' }}>✏️</button>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#fdf0f0', fontWeight: 700 }}>
                <td style={S.td} colSpan={5}><strong>TOTAL</strong></td>
                <td style={{ ...S.td, textAlign: 'right' }}>{CRC(comisiones.reduce((s, v) => s + v.base, 0))}</td>
                <td style={{ ...S.td, textAlign: 'right', color: C.green }}>{CRC(comisiones.reduce((s, v) => s + v.bm, 0))}</td>
                <td style={{ ...S.td, textAlign: 'right', color: C.green }}>{CRC(comisiones.reduce((s, v) => s + v.bmg, 0))}</td>
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <strong style={{ color: C.orange, fontSize: '1rem' }}>{CRC(comisiones.reduce((s, v) => s + v.totalComision, 0))}</strong>
                </td>
                <td style={S.td}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Modal editar parámetros */}
      {editando && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(94,39,51,0.35)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ ...S.card, width: 480, maxWidth: '95vw' }}>
            <div style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 16 }}>
              ✏️ Parámetros — <span style={{ color: C.orange }}>{editando}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                ['meta_ventas',    'Meta ventas (₡)', '0', '100000000', '10000'],
                ['meta_utilidad',  'Meta utilidad (₡)', '0', '100000000', '10000'],
                ['pct_comision',   'Comisión base (%)', '0', '20', '0.5'],
                ['bono_meta',      'Bono si supera meta (%)', '0', '20', '0.5'],
                ['bono_margen',    'Bono margen alto (%)', '0', '20', '0.5'],
                ['umbral_margen',  'Umbral margen bono (%)', '0', '80', '1'],
              ].map(([k, label, min, max, step]) => (
                <div key={k}>
                  <label style={S.label}>{label}</label>
                  <input type="number" min={min} max={max} step={step} value={form[k]}
                    onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))}
                    style={{ ...S.input, width: '100%', boxSizing: 'border-box' }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop: 8, fontSize: '0.76rem', color: C.muted }}>
              La comisión se calcula sobre ventas netas − notas de crédito.
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
              <button style={S.btnGhost} onClick={() => setEditando(null)}>Cancelar</button>
              <button style={S.btnPrimary} onClick={guardar}>Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3: HISTORIAL Y PROYECCIONES
// ══════════════════════════════════════════════════════════════════════════════
function TabHistorial({ historial, loading }) {
  const [vendedorFiltro, setVendedorFiltro] = useState('__todos__');

  const vendedoresLista = useMemo(() => {
    const set = new Set(historial.map(r => r.vendedor));
    return ['__todos__', ...Array.from(set).sort()];
  }, [historial]);

  // Agrupar por período
  const periodos = useMemo(() => {
    const map = {};
    for (const r of historial) {
      if (vendedorFiltro !== '__todos__' && r.vendedor !== vendedorFiltro) continue;
      const p = r.periodo_reporte || '—';
      if (!map[p]) map[p] = { periodo: p, ventas: 0, nc: 0, util: 0, vendedores: new Set() };
      map[p].ventas += N(r.ventas_netas);
      map[p].nc     += N(r.notas_sin_imp);
      map[p].util   += N(r.utilidad);
      map[p].vendedores.add(r.vendedor);
    }
    return Object.values(map)
      .map(p => ({ ...p, vendedores: p.vendedores.size, margen: p.ventas > 0 ? p.util / p.ventas * 100 : 0 }))
      .sort((a, b) => a.periodo.localeCompare(b.periodo));
  }, [historial, vendedorFiltro]);

  // Proyección: basada en el período actual (últimos datos)
  const proyeccion = useMemo(() => {
    if (periodos.length < 1) return null;
    const ultimo = periodos[periodos.length - 1];
    // Extraer rango de fechas del período: "Del DD/MM/YYYY al DD/MM/YYYY" o "Día YYYY-MM-DD"
    const match = ultimo.periodo.match(/Del\s+(\d{2})\/(\d{2})\/(\d{4})\s+al\s+(\d{2})\/(\d{2})\/(\d{4})/);
    if (!match) return null;
    const [, d1, m1, y1, d2, m2, y2] = match;
    const inicio  = new Date(`${y1}-${m1}-${d1}`);
    const fin     = new Date(`${y2}-${m2}-${d2}`);
    const hoy     = new Date();
    const diasPeriodo = Math.max(1, Math.round((fin - inicio) / 86400000) + 1);
    const diasTranscurridos = Math.max(1, Math.round((Math.min(hoy, fin) - inicio) / 86400000) + 1);
    const pctMes  = diasTranscurridos / diasPeriodo;
    const proyVentas = pctMes < 1 ? ultimo.ventas / pctMes : null;
    const proyUtil   = pctMes < 1 ? ultimo.util   / pctMes : null;
    return { diasPeriodo, diasTranscurridos, pctMes, proyVentas, proyUtil, periodo: ultimo.periodo };
  }, [periodos]);

  // Promedio histórico
  const promHistorico = useMemo(() => {
    if (periodos.length < 2) return null;
    const todos = periodos.slice(0, -1); // excluir el período actual
    return {
      ventas: todos.reduce((s, p) => s + p.ventas, 0) / todos.length,
      util:   todos.reduce((s, p) => s + p.util, 0) / todos.length,
    };
  }, [periodos]);

  if (loading) return <Spinner />;
  if (!historial.length) return <Vacío msg="Sin historial aún" sub="El historial se construye automáticamente al subir reportes de distintos períodos." />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Filtro vendedor */}
      <div style={S.cardSm}>
        <label style={S.label}>Filtrar por vendedor</label>
        <select value={vendedorFiltro} onChange={e => setVendedorFiltro(e.target.value)} style={{ ...S.select, minWidth: 220 }}>
          {vendedoresLista.map(v => <option key={v} value={v}>{v === '__todos__' ? 'Todos los vendedores' : v}</option>)}
        </select>
      </div>

      {/* Proyección del período actual */}
      {proyeccion && (
        <div style={{ ...S.card, borderLeft: `4px solid ${C.orange}` }}>
          <div style={S.kicker}>📈 Proyección al cierre del período actual</div>
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
            <div>
              <div style={S.caption}>Período</div>
              <div style={{ fontWeight: 700, fontSize: '0.9rem' }}>{proyeccion.periodo}</div>
            </div>
            <div>
              <div style={S.caption}>Días transcurridos / total</div>
              <div style={{ fontWeight: 700 }}>{proyeccion.diasTranscurridos} / {proyeccion.diasPeriodo}</div>
              <ProgressBar value={proyeccion.diasTranscurridos} max={proyeccion.diasPeriodo} color={C.teal} />
            </div>
            <div>
              <div style={S.caption}>Proyección ventas al cierre</div>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: C.teal }}>{CRC(proyeccion.proyVentas)}</div>
              {promHistorico && (
                <div style={{ fontSize: '0.73rem', color: proyeccion.proyVentas >= promHistorico.ventas ? C.green : C.red }}>
                  {proyeccion.proyVentas >= promHistorico.ventas ? '▲' : '▼'} vs prom. histórico {CRC(promHistorico.ventas)}
                </div>
              )}
            </div>
            <div>
              <div style={S.caption}>Proyección utilidad al cierre</div>
              <div style={{ fontWeight: 800, fontSize: '1.2rem', color: C.green }}>{CRC(proyeccion.proyUtil)}</div>
              {promHistorico && (
                <div style={{ fontSize: '0.73rem', color: proyeccion.proyUtil >= promHistorico.util ? C.green : C.red }}>
                  {proyeccion.proyUtil >= promHistorico.util ? '▲' : '▼'} vs prom. histórico {CRC(promHistorico.util)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tabla historial */}
      <div style={S.card}>
        <div style={S.kicker}>Historial por período</div>
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={S.th}>Período</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Ventas netas</th>
                <th style={{ ...S.th, textAlign: 'right' }}>NC</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Utilidad</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Margen</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Vendedores</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Tendencia ventas</th>
              </tr>
            </thead>
            <tbody>
              {periodos.map((p, i) => {
                const prev = periodos[i - 1];
                const delta = prev ? (p.ventas - prev.ventas) / Math.max(prev.ventas, 1) * 100 : null;
                return (
                  <tr key={p.periodo} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8' }}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{p.periodo}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: C.teal, fontWeight: 600 }}>{CRC(p.ventas)}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: p.nc > 0 ? C.red : C.muted }}>{p.nc > 0 ? `−${CRC(p.nc)}` : '—'}</td>
                    <td style={{ ...S.td, textAlign: 'right', color: C.green, fontWeight: 700 }}>{CRC(p.util)}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      <span style={{ fontWeight: 700, color: margenColor(p.margen) }}>{p.margen.toFixed(1)}%</span>
                    </td>
                    <td style={{ ...S.td, textAlign: 'right' }}>{p.vendedores}</td>
                    <td style={{ ...S.td, textAlign: 'right' }}>
                      {delta !== null ? (
                        <span style={{ fontWeight: 700, color: delta >= 0 ? C.green : C.red }}>
                          {delta >= 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(1)}%
                        </span>
                      ) : <span style={{ color: C.muted }}>—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Promedio histórico */}
      {promHistorico && (
        <div style={{ ...S.cardSm, background: '#f0fff4', border: `1px solid #9ae6b4` }}>
          <div style={S.kicker}>📊 Promedio histórico (períodos anteriores)</div>
          <div style={{ display: 'flex', gap: 32, marginTop: 8 }}>
            <div>
              <div style={S.caption}>Ventas promedio por período</div>
              <div style={{ fontWeight: 800, fontSize: '1.3rem', color: C.teal }}>{CRC(promHistorico.ventas)}</div>
            </div>
            <div>
              <div style={S.caption}>Utilidad promedio por período</div>
              <div style={{ fontWeight: 800, fontSize: '1.3rem', color: C.green }}>{CRC(promHistorico.util)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 4: CATEGORÍAS
// ══════════════════════════════════════════════════════════════════════════════
function TabCategorias({ modo, periodoSel, fechaDesde, fechaHasta }) {
  const [datos, setDatos]   = useState([]);
  const [cargando, setCarg] = useState(false);
  const [expand, setExpand] = useState({});

  useEffect(() => {
    const ready = modo === 'carga' ? !!periodoSel : !!(fechaDesde && fechaHasta);
    if (!ready) return;
    setCarg(true);
    (async () => {
      let todos = [], off = 0;
      while (true) {
        let q = supabase.from('neo_informe_ventas_categoria').select('*').range(off, off + 999);
        if (modo === 'carga') q = q.eq('periodo_reporte', periodoSel);
        const { data } = await q;
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }
      // En modo rango: filtrar por solapamiento de fechas
      if (modo === 'rango') {
        const desde = new Date(fechaDesde);
        const hasta = new Date(fechaHasta + 'T23:59:59');
        todos = todos.filter(r => {
          const rango = parsarPeriodo(r.periodo_reporte);
          if (!rango) return false;
          return rango.desde <= hasta && rango.hasta >= desde;
        });
      }
      setDatos(todos.filter(r => r.categoria && r.categoria.trim()));
      setCarg(false);
    })();
  }, [modo, periodoSel, fechaDesde, fechaHasta]);

  const grupos = useMemo(() => {
    const map = {};
    for (const r of datos) {
      const cat = r.categoria;
      if (!map[cat]) map[cat] = { cat, items: [] };
      map[cat].items.push(r);
    }
    return Object.values(map).map(g => {
      const subs = g.items.filter(r => r.subcategoria);
      const src  = subs.length ? subs : g.items;
      const total = {
        ventas:   src.reduce((s, r) => s + N(r.ventas_netas), 0),
        nc:       src.reduce((s, r) => s + N(r.notas_totales), 0),
        util:     src.reduce((s, r) => s + N(r.utilidad), 0),
        unidades: src.reduce((s, r) => s + N(r.unidades_vendidas), 0),
      };
      total.margen = total.ventas > 0 ? total.util / total.ventas * 100 : 0;
      return { ...g, subs, total };
    }).sort((a, b) => b.total.util - a.total.util);
  }, [datos]);

  const maxUtil = useMemo(() => Math.max(...grupos.map(g => g.total.util), 1), [grupos]);

  if (cargando) return <Spinner />;
  if (!grupos.length) return <Vacío msg="Sin datos de categorías" sub={<>Subí el <strong>Informe de ventas por Categoría</strong> en <a href="/reportes" style={{ color: C.orange }}>Carga de reportes</a></>} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ ...S.cardSm, display: 'flex', gap: 28, flexWrap: 'wrap', marginBottom: 4 }}>
        <div><div style={S.caption}>Categorías</div><div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.orange }}>{grupos.length}</div></div>
        <div><div style={S.caption}>Utilidad total</div><div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.green }}>{CRC(grupos.reduce((s, g) => s + g.total.util, 0))}</div></div>
        <div><div style={S.caption}>Mayor utilidad</div><div style={{ fontWeight: 700, color: C.teal }}>{grupos[0]?.cat}</div></div>
      </div>

      {grupos.map((g, idx) => {
        const isOpen = expand[g.cat];
        const barW = Math.round(g.total.util / maxUtil * 100);
        return (
          <div key={g.cat} style={{ ...S.card, padding: 0, overflow: 'hidden' }}>
            <div onClick={() => g.subs.length && setExpand(e => ({ ...e, [g.cat]: !isOpen }))}
              style={{ padding: '13px 18px', cursor: g.subs.length ? 'pointer' : 'default', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 700, color: C.muted, width: 24, textAlign: 'center', fontSize: '0.8rem' }}>{idx + 1}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontWeight: 700, fontSize: '0.93rem' }}>{semaforo(g.total.margen)} {g.cat}</div>
                <div style={{ marginTop: 5, height: 4, borderRadius: 2, background: C.border, maxWidth: 200 }}>
                  <div style={{ height: '100%', borderRadius: 2, background: margenColor(g.total.margen), width: barW + '%' }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', minWidth: 90 }}><div style={S.caption}>Ventas netas</div><div style={{ fontWeight: 700 }}>{CRC(g.total.ventas)}</div></div>
              {g.total.nc > 0 && <div style={{ textAlign: 'right', minWidth: 85 }}><div style={{ ...S.caption, color: C.red }}>Notas crédito</div><div style={{ fontWeight: 600, color: C.red }}>−{CRC(g.total.nc)}</div></div>}
              <div style={{ textAlign: 'right', minWidth: 85 }}><div style={S.caption}>Utilidad</div><div style={{ fontWeight: 800, color: C.green }}>{CRC(g.total.util)}</div></div>
              <div style={{ textAlign: 'right', minWidth: 65 }}><div style={S.caption}>Margen</div><div style={{ fontWeight: 800, color: margenColor(g.total.margen) }}>{g.total.margen.toFixed(1)}%</div></div>
              {g.subs.length > 0 && <div style={{ color: C.muted, fontSize: '0.78rem' }}>{isOpen ? '▲' : '▼'} {g.subs.length}</div>}
            </div>

            {isOpen && g.subs.length > 0 && (
              <div style={{ borderTop: `1px solid ${C.border}`, background: '#fdf8f8' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ ...S.th, paddingLeft: 48 }}>Subcategoría</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Unidades</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Ventas</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>NC</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Utilidad</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Margen</th>
                  </tr></thead>
                  <tbody>
                    {g.subs.sort((a, b) => N(b.utilidad) - N(a.utilidad)).map((sub, si) => {
                      const m = N(sub.pct_utilidad?.toString().replace('%', '')) || 0;
                      return (
                        <tr key={si} style={{ borderTop: `1px solid ${C.border}` }}>
                          <td style={{ ...S.td, paddingLeft: 48, color: C.teal, fontWeight: 500 }}>↳ {sub.subcategoria}</td>
                          <td style={{ ...S.td, textAlign: 'right' }}>{N(sub.unidades_vendidas).toLocaleString('es-CR', { maximumFractionDigits: 1 })}</td>
                          <td style={{ ...S.td, textAlign: 'right' }}>{CRC(sub.ventas_netas)}</td>
                          <td style={{ ...S.td, textAlign: 'right', color: N(sub.notas_totales) > 0 ? C.red : C.muted }}>
                            {N(sub.notas_totales) > 0 ? `−${CRC(sub.notas_totales)}` : '—'}
                          </td>
                          <td style={{ ...S.td, textAlign: 'right', color: C.green, fontWeight: 700 }}>{CRC(sub.utilidad)}</td>
                          <td style={{ ...S.td, textAlign: 'right' }}><span style={{ fontWeight: 700, color: margenColor(m) }}>{m.toFixed(1)}%</span></td>
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
      <Leyenda />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 5: PRODUCTOS
// ══════════════════════════════════════════════════════════════════════════════
function TabProductos({ productos, cargando }) {
  const [buscar, setBuscar] = useState('');
  const [orden, setOrden]   = useState('util');
  const [filtro, setFiltro] = useState('todos');

  const filtrados = useMemo(() => {
    let lista = productos;
    if (buscar) lista = lista.filter(p => p.item.toLowerCase().includes(buscar.toLowerCase()) || p.codigo.toLowerCase().includes(buscar.toLowerCase()));
    if (filtro === 'alto')    lista = lista.filter(p => p.margen >= 45);
    if (filtro === 'medio')   lista = lista.filter(p => p.margen >= 20 && p.margen < 45);
    if (filtro === 'bajo')    lista = lista.filter(p => p.margen < 20 && p.util >= 0);
    if (filtro === 'neg')     lista = lista.filter(p => p.util < 0);
    return [...lista].sort((a, b) =>
      orden === 'util' ? b.util - a.util : orden === 'ventas' ? b.ventas - a.ventas :
      orden === 'margen' ? b.margen - a.margen : b.unidades - a.unidades
    );
  }, [productos, buscar, orden, filtro]);

  if (cargando) return <Spinner />;
  if (!productos.length) return <Vacío msg="Sin datos de productos" sub={<>Subí la <strong>Lista de ítems facturados</strong> en <a href="/reportes" style={{ color: C.orange }}>Carga de reportes</a></>} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
        {[
          { label: 'Productos vendidos',    val: productos.length,                              color: C.text  },
          { label: '🟢 Margen alto (≥45%)', val: productos.filter(p => p.margen >= 45).length,  color: C.green },
          { label: '🟡 Margen bajo (<20%)', val: productos.filter(p => p.margen < 20 && p.util >= 0).length, color: C.gold },
          { label: '🔴 Utilidad negativa',  val: productos.filter(p => p.util < 0).length,       color: C.red   },
        ].map(k => (
          <div key={k.label} style={S.cardSm}>
            <div style={S.caption}>{k.label}</div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={buscar} onChange={e => setBuscar(e.target.value)} placeholder="🔍 Buscar producto o código..."
          style={{ ...S.input, flex: 1, minWidth: 200 }} />
        <select value={orden} onChange={e => setOrden(e.target.value)} style={S.select}>
          <option value="util">↓ Mayor utilidad</option>
          <option value="ventas">↓ Mayor ventas</option>
          <option value="margen">↓ Mayor margen</option>
          <option value="unidades">↓ Más unidades</option>
        </select>
        <select value={filtro} onChange={e => setFiltro(e.target.value)} style={S.select}>
          <option value="todos">Todos los productos</option>
          <option value="alto">🟢 Margen alto (≥45%)</option>
          <option value="medio">🔵 Margen medio (20–44%)</option>
          <option value="bajo">🟡 Margen bajo (&lt;20%)</option>
          <option value="neg">🔴 Utilidad negativa</option>
        </select>
        <span style={S.caption}>{filtrados.length} productos</span>
      </div>

      <div style={S.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={S.th}>Producto</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Unidades</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Ventas</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Utilidad</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Margen</th>
              <th style={S.th}>Vendedor(es)</th>
            </tr></thead>
            <tbody>
              {filtrados.slice(0, 300).map((p, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8' }}>
                  <td style={S.td}>
                    <div style={{ fontWeight: 600 }}>{p.item || '—'}</div>
                    {p.codigo && <div style={{ fontSize: '0.72rem', color: C.muted }}>{p.codigo}</div>}
                  </td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{p.unidades.toLocaleString('es-CR', { maximumFractionDigits: 1 })}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{CRC(p.ventas)}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: p.util >= 0 ? C.green : C.red }}>{CRC(p.util)}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: margenColor(p.margen) }}>{p.margen.toFixed(1)}%</span>
                  </td>
                  <td style={{ ...S.td, fontSize: '0.75rem', color: C.muted, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.vendedores}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length > 300 && <div style={{ padding: 10, textAlign: 'center', color: C.muted, fontSize: '0.78rem' }}>Mostrando 300 de {filtrados.length}</div>}
        </div>
      </div>
      <Leyenda />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 6: BODEGAS / ZONAS
// ══════════════════════════════════════════════════════════════════════════════
function TabBodegas({ marcas, cargando }) {
  if (cargando) return <Spinner />;
  if (!marcas.length) return <Vacío msg="Sin datos de bodegas" sub={<>Subí la <strong>Lista de ítems facturados</strong></>} />;

  const maxUtil = Math.max(...marcas.map(m => m.util), 1);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ ...S.cardSm, display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        <div><div style={S.caption}>Bodegas/zonas</div><div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.orange }}>{marcas.length}</div></div>
        <div><div style={S.caption}>Utilidad total</div><div style={{ fontSize: '1.5rem', fontWeight: 800, color: C.green }}>{CRC(marcas.reduce((s, m) => s + m.util, 0))}</div></div>
        <div><div style={S.caption}>Mayor utilidad</div><div style={{ fontWeight: 700, color: C.teal }}>{marcas[0]?.marca}</div></div>
      </div>

      <div style={S.card}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>
              <th style={{ ...S.th, width: 30 }}>#</th>
              <th style={S.th}>Bodega / Zona</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Unidades</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Ventas</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Utilidad</th>
              <th style={{ ...S.th, textAlign: 'right' }}>Margen</th>
              <th style={{ ...S.th, width: 160 }}>Participación</th>
            </tr></thead>
            <tbody>
              {marcas.map((m, i) => (
                <tr key={m.marca} style={{ background: i % 2 === 0 ? '#fff' : '#fdf8f8' }}>
                  <td style={{ ...S.td, fontWeight: 700, color: C.muted }}>{medallas[i] || i + 1}</td>
                  <td style={{ ...S.td, fontWeight: 700 }}>{m.marca}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{m.unidades.toLocaleString('es-CR', { maximumFractionDigits: 1 })}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>{CRC(m.ventas)}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: C.green }}>{CRC(m.util)}</td>
                  <td style={{ ...S.td, textAlign: 'right' }}>
                    <span style={{ fontWeight: 700, color: margenColor(m.margen) }}>{m.margen.toFixed(1)}%</span>
                  </td>
                  <td style={S.td}>
                    <ProgressBar value={m.util} max={maxUtil} color={margenColor(m.margen)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Leyenda />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ══════════════════════════════════════════════════════════════════════════════
export default function ComercialPage() {
  const [tab, setTab]               = useState('resumen');
  const [modo, setModo]             = useState('carga');
  const [periodoSel, setPeriodoSel] = useState('');
  const [periodos, setPeriodos]     = useState([]);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Cargar períodos disponibles — unión de todas las tablas comerciales
  useEffect(() => {
    (async () => {
      const [r1, r2, r3] = await Promise.all([
        supabase.from('neo_items_facturados').select('periodo_reporte').not('periodo_reporte', 'is', null).limit(500),
        supabase.from('neo_informe_ventas_vendedor').select('periodo_reporte').not('periodo_reporte', 'is', null).limit(500),
        supabase.from('neo_informe_ventas_categoria').select('periodo_reporte').not('periodo_reporte', 'is', null).limit(500),
      ]);
      const todos = [
        ...(r1.data || []),
        ...(r2.data || []),
        ...(r3.data || []),
      ].map(r => r.periodo_reporte).filter(Boolean);
      const unicos = [...new Set(todos)].sort().reverse();
      setPeriodos(unicos);
      if (unicos.length) setPeriodoSel(unicos[0]);
      const hoy = new Date();
      const hace30 = new Date(hoy); hace30.setDate(hoy.getDate() - 30);
      setFechaHasta(hoy.toISOString().slice(0, 10));
      setFechaDesde(hace30.toISOString().slice(0, 10));
    })();
  }, []);

  const { items, cargando }   = useItems(modo, periodoSel, fechaDesde, fechaHasta);
  const { informe: informeVendedor, cargando: cargandoInforme } = useInformeVendedor(modo, periodoSel, fechaDesde, fechaHasta);
  const { metas, guardar }    = useMetas();
  const { historial, loading: histLoading } = useHistorial();
  const { vendedores, productos, marcas } = useMétricas(items, informeVendedor);
  const cargandoTotal = cargando || cargandoInforme;

  const tabs = [
    { key: 'resumen',    label: '📊 Resumen' },
    { key: 'comisiones', label: '💰 Comisiones' },
    { key: 'historial',  label: '📈 Historial' },
    { key: 'categorias', label: '📦 Categorías' },
    { key: 'productos',  label: '🔍 Productos' },
  ];

  return (
    <div>
      <div style={S.kicker}>Comercial · Depósito Jiménez</div>
      <h1 style={{ margin: '0 0 4px', fontSize: '1.9rem', fontWeight: 800, color: C.text }}>
        💼 Comercial
      </h1>
      <p style={{ color: C.muted, margin: '0 0 20px', fontSize: '0.9rem' }}>
        Ventas netas · Comisiones · Historial y proyecciones · Categorías · Productos
      </p>

      <SelectorPeriodo
        modo={modo} setModo={setModo}
        periodoSel={periodoSel} setPeriodoSel={setPeriodoSel} periodos={periodos}
        fechaDesde={fechaDesde} setFechaDesde={setFechaDesde}
        fechaHasta={fechaHasta} setFechaHasta={setFechaHasta}
      />

      <div style={{ display: 'flex', gap: 4, marginBottom: 22, borderBottom: `1px solid ${C.border}`, overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            style={tab === t.key ? S.tabOn : S.tab}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen'    && <TabResumen    vendedores={vendedores} cargando={cargandoTotal} metas={metas} periodoSel={periodoSel} />}
      {tab === 'comisiones' && <TabComisiones vendedores={vendedores} cargando={cargandoTotal} metas={metas} guardarMeta={guardar} />}
      {tab === 'historial'  && <TabHistorial  historial={historial} loading={histLoading} />}
      {tab === 'categorias' && <TabCategorias modo={modo} periodoSel={periodoSel} fechaDesde={fechaDesde} fechaHasta={fechaHasta} />}
      {tab === 'productos'  && <TabProductos  productos={productos} cargando={cargandoTotal} />}
    </div>
  );
}
