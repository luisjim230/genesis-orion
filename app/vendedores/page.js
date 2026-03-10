'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';

const C = {
  orange: '#ED6E2E', burgundy: '#5E2733', teal: '#225F74',
  cream: '#FDF4F4', green: '#276749', red: '#C53030',
  gold: '#B7791F', muted: '#8a7070', border: '#EAE0E0', text: '#1a1a1a',
};
const S = {
  kicker:  { color: C.orange, fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6 },
  card:    { background: '#fff', borderRadius: 14, border: `1px solid ${C.border}`, padding: '20px 24px', boxShadow: '0 1px 4px rgba(94,39,51,0.06)' },
  cardSm:  { background: '#fff', borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 18px', boxShadow: '0 1px 3px rgba(94,39,51,0.05)' },
  tab:     { padding: '8px 18px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: C.muted, transition: 'all .15s' },
  tabOn:   { padding: '8px 18px', borderRadius: 8, border: 'none', background: C.cream, cursor: 'pointer', fontSize: '0.88rem', fontWeight: 600, color: C.orange, borderBottom: `2px solid ${C.orange}`, transition: 'all .15s' },
  th:      { padding: '9px 12px', fontSize: '0.73rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${C.border}`, textAlign: 'left', whiteSpace: 'nowrap' },
  td:      { padding: '9px 12px', fontSize: '0.84rem', borderBottom: `1px solid #f5eeee`, color: C.text },
  label:   { fontSize: '0.73rem', fontWeight: 700, color: C.muted, marginBottom: 4, display: 'block', textTransform: 'uppercase', letterSpacing: '0.06em' },
  select:  { padding: '7px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: '0.88rem', color: C.text, fontFamily: 'Rubik, sans-serif' },
  input:   { padding: '7px 11px', borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', fontSize: '0.88rem', color: C.text, fontFamily: 'Rubik, sans-serif' },
  caption: { fontSize: '0.75rem', color: C.muted, marginTop: 3 },
};

const CRC = v => '₡' + Math.round(parseFloat(v)||0).toLocaleString('es-CR');
const N   = v => parseFloat(v) || 0;
const margenColor = pct => pct >= 45 ? C.green : pct >= 30 ? C.teal : pct >= 20 ? C.gold : C.red;
const semaforo    = pct => pct >= 45 ? '🟢' : pct >= 30 ? '🔵' : pct >= 20 ? '🟡' : '🔴';
const medallas    = ['🥇','🥈','🥉'];

// ── Selector de período ──────────────────────────────────────────────────────
// Modo A: elegir un período guardado (periodo_reporte de los uploads)
// Modo B: rango libre de fechas de factura (fecha de los ítems)
function SelectorPeriodo({ modo, setModo, periodoSel, setPeriodoSel, periodos,
                           fechaDesde, setFechaDesde, fechaHasta, setFechaHasta }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.border}`, borderRadius: 12, padding: '16px 20px', marginBottom: 24, display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {/* Toggle modo */}
      <div>
        <label style={S.label}>Modo de filtro</label>
        <div style={{ display: 'flex', gap: 4 }}>
          {[['carga','📂 Por reporte cargado'],['rango','📅 Rango de fechas libre']].map(([m,l]) => (
            <button key={m} onClick={() => setModo(m)}
              style={{ ...S.select, fontWeight: 700, cursor: 'pointer', border: 'none',
                background: modo === m ? C.orange : C.cream,
                color: modo === m ? '#fff' : C.muted }}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {modo === 'carga' && (
        <div>
          <label style={S.label}>Reporte cargado</label>
          <select value={periodoSel} onChange={e => setPeriodoSel(e.target.value)} style={{ ...S.select, minWidth: 260, fontWeight: 600 }}>
            {periodos.length === 0 && <option value="">Sin datos — subí reportes primero</option>}
            {periodos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <div style={S.caption}>Período tal como quedó guardado al subir el archivo</div>
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
          <div style={{ fontSize: '0.78rem', color: C.muted, maxWidth: 220 }}>
            Filtra por fecha real de la factura, sin importar cuándo se subió el reporte.
            Acumula datos de múltiples cargas.
          </div>
        </>
      )}
    </div>
  );
}

// ── Hook principal: carga y procesa todos los ítems facturados ───────────────
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
          .select('vendedor,item,codigo_interno,bodega,cantidad_facturada,cantidad_devuelta,precio_unitario,costo_unitario,subtotal,descuento,impuestos,total,factura,fecha')
          .range(off, off + 999);

        if (modo === 'carga') {
          q = q.eq('periodo_reporte', periodoSel);
        } else {
          // Convertir fechas a serial Excel para comparar, o usar fecha como string ISO
          // Los ítems guardados tienen fecha como string o serial — buscar por rango de fecha_carga no ayuda
          // Usamos periodo_reporte pattern para acumular múltiples períodos dentro del rango
          // Mejor: cargar todo y filtrar en cliente por fecha del ítem convertida
          // (los ítems tienen fecha serial de Excel)
        }

        const { data, error } = await q;
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }

      // Si modo rango: filtrar por fecha real de factura
      if (modo === 'rango') {
        const desde = new Date(fechaDesde).getTime();
        const hasta = new Date(fechaHasta + 'T23:59:59').getTime();
        // fecha en Excel serial: 1 = 1/1/1900, 44927 = 1/1/2023
        // convertir: (serial - 25569) * 86400 * 1000
        todos = todos.filter(r => {
          const f = parseFloat(r.fecha);
          if (!f) return true; // si no hay fecha incluir
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

// ── Procesamiento central: de items → métricas por vendedor, categoría, producto
function useMétricas(items) {
  return useMemo(() => {
    if (!items.length) return { vendedores: [], categorías: [], productos: [] };

    const vMap = {}, pMap = {};

    for (const r of items) {
      const vendedor = (r.vendedor || 'Sin vendedor').trim();
      const prod     = (r.item || 'Sin descripción').trim();
      const codigo   = (r.codigo_interno || '').trim();
      const factura  = (r.factura || '').trim();
      const cant     = Math.max(0, N(r.cantidad_facturada) - N(r.cantidad_devuelta));
      const sub      = N(r.subtotal);
      const desc     = N(r.descuento);
      const venta    = sub - desc;                        // venta neta sin imp
      const costo    = N(r.costo_unitario) * cant;
      const util     = venta - costo;

      // Por vendedor
      if (!vMap[vendedor]) vMap[vendedor] = { vendedor, ventas:0, costo:0, util:0, items:0, facturas: new Set() };
      vMap[vendedor].ventas   += venta;
      vMap[vendedor].costo    += costo;
      vMap[vendedor].util     += util;
      vMap[vendedor].items    += cant;
      if (factura) vMap[vendedor].facturas.add(factura);

      // Por producto
      const pk = codigo || prod;
      if (!pMap[pk]) pMap[pk] = { item: prod, codigo, ventas:0, costo:0, util:0, unidades:0, vendedores: new Set(), facturas: new Set() };
      pMap[pk].ventas   += venta;
      pMap[pk].costo    += costo;
      pMap[pk].util     += util;
      pMap[pk].unidades += cant;
      if (vendedor) pMap[pk].vendedores.add(vendedor);
      if (factura)  pMap[pk].facturas.add(factura);
    }

    const vendedores = Object.values(vMap).map(v => ({
      ...v,
      facturas: v.facturas.size,
      margen: v.ventas > 0 ? v.util / v.ventas * 100 : 0,
    })).sort((a,b) => b.ventas - a.ventas);

    const productos = Object.values(pMap).map(p => ({
      ...p,
      vendedores: [...p.vendedores].join(', '),
      facturas: p.facturas.size,
      margen: p.ventas > 0 ? p.util / p.ventas * 100 : 0,
    })).sort((a,b) => b.util - a.util);

    return { vendedores, productos };
  }, [items]);
}

// ── Tab Resumen ──────────────────────────────────────────────────────────────
function TabResumen({ vendedores, cargando }) {
  const totales = useMemo(() => ({
    ventas:  vendedores.reduce((s,v) => s+v.ventas, 0),
    costo:   vendedores.reduce((s,v) => s+v.costo, 0),
    util:    vendedores.reduce((s,v) => s+v.util, 0),
    items:   vendedores.reduce((s,v) => s+v.items, 0),
    trans:   vendedores.reduce((s,v) => s+v.facturas, 0),
  }), [vendedores]);
  const margen = totales.ventas > 0 ? totales.util/totales.ventas*100 : 0;

  if (cargando) return <Spinner />;
  if (!vendedores.length) return <Vacío msg="Sin datos" sub={<>Subí <strong>Lista de ítems facturados</strong> en <a href="/reportes" style={{color:C.orange}}>Carga de reportes</a></>} />;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* KPIs */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:12 }}>
        {[
          { label:'Vendedores activos', val: vendedores.length,          color: C.orange,  large: true  },
          { label:'Ventas netas',       val: CRC(totales.ventas),         color: C.teal               },
          { label:'Costo total',        val: CRC(totales.costo),          color: C.muted              },
          { label:'Utilidad bruta',     val: CRC(totales.util),           color: C.green              },
          { label:'Margen global',      val: margen.toFixed(1)+'%',       color: margenColor(margen)  },
        ].map(k => (
          <div key={k.label} style={S.cardSm}>
            <div style={S.caption}>{k.label}</div>
            <div style={{ fontSize: k.large ? '2rem' : '1.35rem', fontWeight:800, color:k.color, margin:'4px 0 0' }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Tabla */}
      <div style={S.card}>
        <div style={S.kicker}>Rendimiento por vendedor</div>
        <div style={{ overflowX:'auto', marginTop:12 }}>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ background:'#fdf0f0' }}>
                <th style={{...S.th, width:30}}>#</th>
                <th style={S.th}>Vendedor</th>
                <th style={{...S.th, textAlign:'right'}}>Unidades</th>
                <th style={{...S.th, textAlign:'right'}}>Ventas netas</th>
                <th style={{...S.th, textAlign:'right'}}>Costo</th>
                <th style={{...S.th, textAlign:'right'}}>Utilidad</th>
                <th style={{...S.th, textAlign:'right'}}>Margen</th>
                <th style={{...S.th, textAlign:'right'}}>Facturas</th>
                <th style={{...S.th, textAlign:'right'}}>Ticket prom.</th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map((v, i) => (
                <tr key={v.vendedor} style={{ background: i%2===0?'#fff':'#fdf8f8' }}>
                  <td style={{...S.td, fontWeight:700, color:C.muted}}>{medallas[i]||i+1}</td>
                  <td style={{...S.td, fontWeight:700}}>{v.vendedor}</td>
                  <td style={{...S.td, textAlign:'right'}}>{v.items.toLocaleString('es-CR',{maximumFractionDigits:1})}</td>
                  <td style={{...S.td, textAlign:'right', color:C.teal, fontWeight:600}}>{CRC(v.ventas)}</td>
                  <td style={{...S.td, textAlign:'right', color:C.muted}}>{CRC(v.costo)}</td>
                  <td style={{...S.td, textAlign:'right', color:C.green, fontWeight:700}}>{CRC(v.util)}</td>
                  <td style={{...S.td, textAlign:'right'}}>
                    <span style={{ fontWeight:800, color:margenColor(v.margen) }}>{v.margen.toFixed(1)}%</span>
                  </td>
                  <td style={{...S.td, textAlign:'right'}}>{v.facturas}</td>
                  <td style={{...S.td, textAlign:'right', color:C.muted}}>{v.facturas>0 ? CRC(v.ventas/v.facturas) : '—'}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background:'#fdf0f0', fontWeight:700 }}>
                <td style={S.td} colSpan={2}><strong>TOTAL</strong></td>
                <td style={{...S.td, textAlign:'right'}}>{totales.items.toLocaleString('es-CR',{maximumFractionDigits:1})}</td>
                <td style={{...S.td, textAlign:'right', color:C.teal}}><strong>{CRC(totales.ventas)}</strong></td>
                <td style={{...S.td, textAlign:'right', color:C.muted}}>{CRC(totales.costo)}</td>
                <td style={{...S.td, textAlign:'right', color:C.green}}><strong>{CRC(totales.util)}</strong></td>
                <td style={{...S.td, textAlign:'right'}}><strong style={{color:margenColor(margen)}}>{margen.toFixed(1)}%</strong></td>
                <td style={{...S.td, textAlign:'right'}}>{totales.trans}</td>
                <td style={S.td}></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
      <Leyenda />
    </div>
  );
}

// ── Tab Categorías — desde el informe de ventas por categoría ────────────────
function TabCategorias({ modo, periodoSel, fechaDesde, fechaHasta }) {
  const [datos, setDatos]       = useState([]);
  const [cargando, setCargando] = useState(false);
  const [expand, setExpand]     = useState({});

  useEffect(() => {
    const ready = modo === 'carga' ? !!periodoSel : !!(fechaDesde && fechaHasta);
    if (!ready) return;
    setCargando(true);
    (async () => {
      let todos = [], off = 0;
      while (true) {
        let q = supabase.from('neo_informe_ventas_categoria').select('*').range(off, off+999);
        if (modo === 'carga') q = q.eq('periodo_reporte', periodoSel);
        const { data } = await q;
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }
      setDatos(todos.filter(r => r.categoria && r.categoria.trim() && !r.es_total));
      setCargando(false);
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
      const total = subs.length ? {
        ventas:   subs.reduce((s,r)=>s+N(r.ventas_netas),0),
        notas:    subs.reduce((s,r)=>s+N(r.notas_totales),0),
        costo:    subs.reduce((s,r)=>s+N(r.costo),0),
        util:     subs.reduce((s,r)=>s+N(r.utilidad),0),
        unidades: subs.reduce((s,r)=>s+N(r.unidades_vendidas),0),
      } : (g.items[0] ? {
        ventas:   N(g.items[0].ventas_netas),
        notas:    N(g.items[0].notas_totales),
        costo:    N(g.items[0].costo),
        util:     N(g.items[0].utilidad),
        unidades: N(g.items[0].unidades_vendidas),
      } : { ventas:0, notas:0, costo:0, util:0, unidades:0 });
      total.margen = total.ventas > 0 ? total.util/total.ventas*100 : 0;
      return { ...g, subs, total };
    }).sort((a,b) => b.total.util - a.total.util);
  }, [datos]);

  const maxUtil = useMemo(() => Math.max(...grupos.map(g=>g.total.util), 1), [grupos]);

  if (cargando) return <Spinner />;
  if (!grupos.length) return <Vacío msg="Sin datos de categorías" sub={<>Subí <strong>Informe de ventas por Categoría</strong> en <a href="/reportes" style={{color:C.orange}}>Carga de reportes</a></>} />;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      <div style={{ ...S.cardSm, display:'flex', gap:28, flexWrap:'wrap', marginBottom:4 }}>
        <div><div style={S.caption}>Categorías</div><div style={{fontSize:'1.5rem',fontWeight:800,color:C.orange}}>{grupos.length}</div></div>
        <div><div style={S.caption}>Utilidad total</div><div style={{fontSize:'1.5rem',fontWeight:800,color:C.green}}>{CRC(grupos.reduce((s,g)=>s+g.total.util,0))}</div></div>
        <div><div style={S.caption}>Mayor utilidad</div><div style={{fontSize:'0.95rem',fontWeight:700,color:C.teal}}>{grupos[0]?.cat}</div></div>
      </div>

      {grupos.map((g, idx) => {
        const isOpen = expand[g.cat];
        const barW = Math.round(g.total.util / maxUtil * 100);
        return (
          <div key={g.cat} style={{...S.card, padding:0, overflow:'hidden'}}>
            <div onClick={()=>g.subs.length && setExpand(e=>({...e,[g.cat]:!isOpen}))}
              style={{padding:'13px 18px', cursor:g.subs.length?'pointer':'default', display:'flex', alignItems:'center', gap:14, flexWrap:'wrap'}}>
              <div style={{fontWeight:700,color:C.muted,width:22,textAlign:'center',fontSize:'0.8rem'}}>{idx+1}</div>
              <div style={{flex:1, minWidth:160}}>
                <div style={{fontWeight:700,fontSize:'0.93rem'}}>{semaforo(g.total.margen)} {g.cat}</div>
                <div style={{marginTop:5,height:4,borderRadius:2,background:C.border,width:'100%',maxWidth:200}}>
                  <div style={{height:'100%',borderRadius:2,background:margenColor(g.total.margen),width:barW+'%'}}/>
                </div>
              </div>
              <div style={{textAlign:'right',minWidth:90}}><div style={S.caption}>Ventas netas</div><div style={{fontWeight:700}}>{CRC(g.total.ventas)}</div></div>
              {g.total.notas > 0 && <div style={{textAlign:'right',minWidth:85}}><div style={{...S.caption,color:C.red}}>Notas crédito</div><div style={{fontWeight:600,color:C.red}}>−{CRC(g.total.notas)}</div></div>}
              <div style={{textAlign:'right',minWidth:85}}><div style={S.caption}>Utilidad</div><div style={{fontWeight:800,color:C.green}}>{CRC(g.total.util)}</div></div>
              <div style={{textAlign:'right',minWidth:65}}><div style={S.caption}>Margen</div><div style={{fontWeight:800,color:margenColor(g.total.margen)}}>{g.total.margen.toFixed(1)}%</div></div>
              {g.subs.length > 0 && <div style={{color:C.muted,fontSize:'0.78rem'}}>{isOpen?'▲':'▼'} {g.subs.length}</div>}
            </div>
            {isOpen && g.subs.length > 0 && (
              <div style={{borderTop:`1px solid ${C.border}`,background:'#fdf8f8'}}>
                <table style={{width:'100%',borderCollapse:'collapse'}}>
                  <thead><tr>
                    <th style={{...S.th,paddingLeft:48}}>Subcategoría</th>
                    <th style={{...S.th,textAlign:'right'}}>Unidades</th>
                    <th style={{...S.th,textAlign:'right'}}>Ventas</th>
                    <th style={{...S.th,textAlign:'right'}}>Notas</th>
                    <th style={{...S.th,textAlign:'right'}}>Costo</th>
                    <th style={{...S.th,textAlign:'right'}}>Utilidad</th>
                    <th style={{...S.th,textAlign:'right'}}>Margen</th>
                  </tr></thead>
                  <tbody>
                    {g.subs.sort((a,b)=>N(b.utilidad)-N(a.utilidad)).map((sub,si)=>{
                      const m = N(sub.pct_utilidad?.toString().replace('%',''))||0;
                      return (
                        <tr key={si} style={{borderTop:`1px solid ${C.border}`}}>
                          <td style={{...S.td,paddingLeft:48,color:C.teal,fontWeight:500}}>↳ {sub.subcategoria}</td>
                          <td style={{...S.td,textAlign:'right'}}>{N(sub.unidades_vendidas).toLocaleString('es-CR',{maximumFractionDigits:1})}</td>
                          <td style={{...S.td,textAlign:'right'}}>{CRC(sub.ventas_netas)}</td>
                          <td style={{...S.td,textAlign:'right',color:N(sub.notas_totales)>0?C.red:C.muted}}>{N(sub.notas_totales)>0?'−'+CRC(sub.notas_totales):'—'}</td>
                          <td style={{...S.td,textAlign:'right',color:C.muted}}>{CRC(sub.costo)}</td>
                          <td style={{...S.td,textAlign:'right',color:C.green,fontWeight:700}}>{CRC(sub.utilidad)}</td>
                          <td style={{...S.td,textAlign:'right'}}><span style={{fontWeight:700,color:margenColor(m)}}>{m.toFixed(1)}%</span></td>
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

// ── Tab Productos ────────────────────────────────────────────────────────────
function TabProductos({ productos, cargando }) {
  const [buscar, setBuscar]     = useState('');
  const [orden, setOrden]       = useState('util');
  const [filtro, setFiltro]     = useState('todos');

  const filtrados = useMemo(() => {
    let lista = productos;
    if (buscar) lista = lista.filter(p => p.item.toLowerCase().includes(buscar.toLowerCase()) || p.codigo.toLowerCase().includes(buscar.toLowerCase()));
    if (filtro === 'alto')    lista = lista.filter(p => p.margen >= 45);
    if (filtro === 'medio')   lista = lista.filter(p => p.margen >= 20 && p.margen < 45);
    if (filtro === 'bajo')    lista = lista.filter(p => p.margen < 20 && p.util >= 0);
    if (filtro === 'eliminar') lista = lista.filter(p => p.util < 0 || p.unidades <= 0);
    return [...lista].sort((a,b) =>
      orden==='util' ? b.util-a.util : orden==='ventas' ? b.ventas-a.ventas :
      orden==='margen' ? b.margen-a.margen : b.unidades-a.unidades
    );
  }, [productos, buscar, orden, filtro]);

  const stats = useMemo(() => ({
    total:     productos.length,
    alto:      productos.filter(p=>p.margen>=45).length,
    bajo:      productos.filter(p=>p.margen<20&&p.util>=0).length,
    eliminar:  productos.filter(p=>p.util<0||p.unidades<=0).length,
  }), [productos]);

  if (cargando) return <Spinner />;
  if (!productos.length) return <Vacío msg="Sin datos de productos" sub={<>Subí <strong>Lista de ítems facturados</strong> en <a href="/reportes" style={{color:C.orange}}>Carga de reportes</a></>} />;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
        {[
          { label:'Productos vendidos',    val: stats.total,    color: C.text   },
          { label:'🟢 Margen alto (≥45%)', val: stats.alto,     color: C.green  },
          { label:'🟡 Margen bajo (<20%)', val: stats.bajo,     color: C.gold   },
          { label:'🔴 Candidatos a salir', val: stats.eliminar, color: C.red    },
        ].map(k => (
          <div key={k.label} style={S.cardSm}>
            <div style={S.caption}>{k.label}</div>
            <div style={{fontSize:'1.7rem',fontWeight:800,color:k.color}}>{k.val}</div>
          </div>
        ))}
      </div>

      <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
        <input value={buscar} onChange={e=>setBuscar(e.target.value)} placeholder="🔍 Buscar producto o código..."
          style={{...S.input, flex:1, minWidth:200}} />
        <select value={orden} onChange={e=>setOrden(e.target.value)} style={S.select}>
          <option value="util">↓ Mayor utilidad</option>
          <option value="ventas">↓ Mayor ventas</option>
          <option value="margen">↓ Mayor margen</option>
          <option value="unidades">↓ Más unidades</option>
        </select>
        <select value={filtro} onChange={e=>setFiltro(e.target.value)} style={S.select}>
          <option value="todos">Todos los productos</option>
          <option value="alto">🟢 Margen alto (≥45%)</option>
          <option value="medio">🔵 Margen medio (20–44%)</option>
          <option value="bajo">🟡 Margen bajo (&lt;20%)</option>
          <option value="eliminar">🔴 Candidatos a eliminar</option>
        </select>
        <span style={S.caption}>{filtrados.length} productos</span>
      </div>

      <div style={S.card}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:'#fdf0f0'}}>
              <th style={S.th}>Producto</th>
              <th style={{...S.th,textAlign:'right'}}>Unidades</th>
              <th style={{...S.th,textAlign:'right'}}>Ventas</th>
              <th style={{...S.th,textAlign:'right'}}>Costo</th>
              <th style={{...S.th,textAlign:'right'}}>Utilidad</th>
              <th style={{...S.th,textAlign:'right'}}>Margen</th>
              <th style={{...S.th,textAlign:'right'}}>Facturas</th>
              <th style={S.th}>Vendedor(es)</th>
            </tr></thead>
            <tbody>
              {filtrados.slice(0,300).map((p,i)=>(
                <tr key={i} style={{background:i%2===0?'#fff':'#fdf8f8'}}>
                  <td style={S.td}>
                    <div style={{fontWeight:600,fontSize:'0.84rem'}}>{p.item||'—'}</div>
                    {p.codigo && <div style={{fontSize:'0.72rem',color:C.muted}}>{p.codigo}</div>}
                  </td>
                  <td style={{...S.td,textAlign:'right'}}>{p.unidades.toLocaleString('es-CR',{maximumFractionDigits:1})}</td>
                  <td style={{...S.td,textAlign:'right'}}>{CRC(p.ventas)}</td>
                  <td style={{...S.td,textAlign:'right',color:C.muted}}>{CRC(p.costo)}</td>
                  <td style={{...S.td,textAlign:'right',fontWeight:700,color:p.util>=0?C.green:C.red}}>{CRC(p.util)}</td>
                  <td style={{...S.td,textAlign:'right'}}>
                    <span style={{fontWeight:700,color:margenColor(p.margen)}}>{p.margen.toFixed(1)}%</span>
                  </td>
                  <td style={{...S.td,textAlign:'right'}}>{p.facturas}</td>
                  <td style={{...S.td,fontSize:'0.75rem',color:C.muted,maxWidth:160,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.vendedores}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length>300&&<div style={{padding:10,textAlign:'center',color:C.muted,fontSize:'0.78rem'}}>Mostrando 300 de {filtrados.length}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Tab Comisiones ───────────────────────────────────────────────────────────
function TabComisiones({ vendedores, cargando }) {
  const [params, setParams] = useState({ meta:500000, base:3, bMeta:1, bMgn:1, umbral:35 });
  const P = (k,l,mn,mx,st,suf='%') => (
    <div style={S.cardSm}>
      <label style={S.label}>{l}</label>
      <div style={{display:'flex',alignItems:'center',gap:6}}>
        <input type="number" min={mn} max={mx} step={st} value={params[k]}
          onChange={e=>setParams(p=>({...p,[k]:parseFloat(e.target.value)||0}))}
          style={{...S.input,width:90,fontWeight:700}}/>
        <span style={{fontSize:'0.83rem',color:C.muted}}>{suf}</span>
      </div>
    </div>
  );

  const comisiones = useMemo(()=>vendedores.map(v=>{
    const base = v.ventas*(params.base/100);
    const bm   = v.ventas >= params.meta ? v.ventas*(params.bMeta/100) : 0;
    const bmg  = v.margen >= params.umbral ? v.ventas*(params.bMgn/100) : 0;
    return {...v, base, bm, bmg, total:base+bm+bmg, avance: v.ventas/params.meta};
  }).sort((a,b)=>b.total-a.total), [vendedores,params]);

  if (cargando) return <Spinner />;
  if (!vendedores.length) return <Vacío msg="Sin datos" sub={<>Subí <strong>Lista de ítems facturados</strong> en <a href="/reportes" style={{color:C.orange}}>Carga de reportes</a></>} />;

  return (
    <div style={{display:'flex',flexDirection:'column',gap:18}}>
      <div style={S.card}>
        <div style={S.kicker}>Parámetros de comisión</div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(5,1fr)',gap:12,marginTop:12}}>
          {P('meta','Meta mensual',0,10000000,50000,'₡')}
          {P('base','Comisión base',0,20,0.5)}
          {P('bMeta','Bono si supera meta',0,20,0.5)}
          {P('bMgn','Bono margen alto',0,20,0.5)}
          {P('umbral','Umbral margen bono',0,80,1)}
        </div>
        <div style={{marginTop:8,fontSize:'0.76rem',color:C.muted}}>
          Comisión = base + bono meta (si ventas ≥ meta) + bono margen (si margen ≥ umbral). Calculado sobre ventas netas del período.
        </div>
      </div>
      <div style={S.card}>
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse'}}>
            <thead><tr style={{background:'#fdf0f0'}}>
              <th style={S.th}>Vendedor</th>
              <th style={{...S.th,textAlign:'right'}}>Ventas netas</th>
              <th style={{...S.th,textAlign:'right'}}>Avance meta</th>
              <th style={{...S.th,textAlign:'right'}}>Margen</th>
              <th style={{...S.th,textAlign:'right'}}>Com. base</th>
              <th style={{...S.th,textAlign:'right'}}>Bono meta</th>
              <th style={{...S.th,textAlign:'right'}}>Bono margen</th>
              <th style={{...S.th,textAlign:'right'}}>Total comisión</th>
            </tr></thead>
            <tbody>
              {comisiones.map((v,i)=>(
                <tr key={i} style={{background:i%2===0?'#fff':'#fdf8f8'}}>
                  <td style={{...S.td,fontWeight:700}}>{v.vendedor}</td>
                  <td style={{...S.td,textAlign:'right',color:C.teal,fontWeight:600}}>{CRC(v.ventas)}</td>
                  <td style={{...S.td,textAlign:'right'}}>
                    <div style={{display:'flex',alignItems:'center',gap:6,justifyContent:'flex-end'}}>
                      <div style={{width:72,height:5,borderRadius:3,background:C.border}}>
                        <div style={{height:'100%',borderRadius:3,background:v.avance>=1?C.green:C.orange,width:Math.min(100,v.avance*100)+'%'}}/>
                      </div>
                      <span style={{fontSize:'0.8rem',fontWeight:600,color:v.avance>=1?C.green:C.orange}}>{(v.avance*100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{...S.td,textAlign:'right',fontWeight:700,color:margenColor(v.margen)}}>{v.margen.toFixed(1)}%</td>
                  <td style={{...S.td,textAlign:'right'}}>{CRC(v.base)}</td>
                  <td style={{...S.td,textAlign:'right',color:v.bm>0?C.green:C.muted}}>{v.bm>0?CRC(v.bm):'—'}</td>
                  <td style={{...S.td,textAlign:'right',color:v.bmg>0?C.green:C.muted}}>{v.bmg>0?CRC(v.bmg):'—'}</td>
                  <td style={{...S.td,textAlign:'right'}}><strong style={{fontSize:'1rem',color:C.orange}}>{CRC(v.total)}</strong></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{background:'#fdf0f0',fontWeight:700}}>
                <td style={S.td}><strong>TOTAL</strong></td>
                <td style={{...S.td,textAlign:'right',color:C.teal}}><strong>{CRC(comisiones.reduce((s,v)=>s+v.ventas,0))}</strong></td>
                <td style={S.td} colSpan={2}></td>
                <td style={{...S.td,textAlign:'right'}}>{CRC(comisiones.reduce((s,v)=>s+v.base,0))}</td>
                <td style={{...S.td,textAlign:'right',color:C.green}}>{CRC(comisiones.reduce((s,v)=>s+v.bm,0))}</td>
                <td style={{...S.td,textAlign:'right',color:C.green}}>{CRC(comisiones.reduce((s,v)=>s+v.bmg,0))}</td>
                <td style={{...S.td,textAlign:'right'}}><strong style={{color:C.orange,fontSize:'1rem'}}>{CRC(comisiones.reduce((s,v)=>s+v.total,0))}</strong></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Helpers UI ───────────────────────────────────────────────────────────────
function Spinner() {
  return <div style={{padding:48,textAlign:'center',color:C.muted,fontSize:'0.9rem'}}>⏳ Cargando...</div>;
}
function Vacío({ msg, sub }) {
  return (
    <div style={{textAlign:'center',padding:60,color:C.muted}}>
      <div style={{fontSize:'2.2rem',marginBottom:10}}>📦</div>
      <div style={{fontWeight:700,color:C.text,marginBottom:6}}>{msg}</div>
      <div style={{fontSize:'0.84rem'}}>{sub}</div>
    </div>
  );
}
function Leyenda() {
  return (
    <div style={{display:'flex',gap:18,flexWrap:'wrap',fontSize:'0.75rem',color:C.muted,padding:'6px 2px'}}>
      <span>🟢 Margen ≥ 45%</span><span>🔵 30–44%</span><span>🟡 20–29%</span><span>🔴 &lt; 20%</span>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────────
export default function VendedoresPage() {
  const [tab, setTab]               = useState('resumen');
  const [modo, setModo]             = useState('carga');
  const [periodoSel, setPeriodoSel] = useState('');
  const [periodos, setPeriodos]     = useState([]);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  // Cargar lista de períodos disponibles
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('neo_items_facturados')
        .select('periodo_reporte')
        .not('periodo_reporte', 'is', null)
        .limit(500);
      const unicos = [...new Set((data||[]).map(r=>r.periodo_reporte).filter(Boolean))].sort().reverse();
      setPeriodos(unicos);
      if (unicos.length) setPeriodoSel(unicos[0]);
      // Default rango: último mes
      const hoy = new Date();
      const hace30 = new Date(hoy); hace30.setDate(hoy.getDate()-30);
      setFechaHasta(hoy.toISOString().slice(0,10));
      setFechaDesde(hace30.toISOString().slice(0,10));
    })();
  }, []);

  const { items, cargando } = useItems(modo, periodoSel, fechaDesde, fechaHasta);
  const { vendedores, productos } = useMétricas(items);

  const tabs = [
    { key:'resumen',    label:'📊 Resumen ejecutivo' },
    { key:'categorias', label:'📦 Categorías' },
    { key:'productos',  label:'🔍 Productos' },
    { key:'comisiones', label:'💰 Comisiones' },
  ];

  return (
    <div>
      <div style={S.kicker}>Comercial</div>
      <h1 style={{margin:'0 0 4px',fontSize:'1.9rem',fontWeight:800,color:C.text}}>👥 Equipo de ventas</h1>
      <p style={{color:C.muted,margin:'0 0 20px',fontSize:'0.9rem'}}>
        Rendimiento, utilidad y comisiones · Análisis por categoría y producto
      </p>

      <SelectorPeriodo
        modo={modo} setModo={setModo}
        periodoSel={periodoSel} setPeriodoSel={setPeriodoSel} periodos={periodos}
        fechaDesde={fechaDesde} setFechaDesde={setFechaDesde}
        fechaHasta={fechaHasta} setFechaHasta={setFechaHasta}
      />

      <div style={{display:'flex',gap:4,marginBottom:22,borderBottom:`1px solid ${C.border}`}}>
        {tabs.map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)} style={tab===t.key?S.tabOn:S.tab}>{t.label}</button>
        ))}
      </div>

      {tab==='resumen'    && <TabResumen    vendedores={vendedores} cargando={cargando} />}
      {tab==='categorias' && <TabCategorias modo={modo} periodoSel={periodoSel} fechaDesde={fechaDesde} fechaHasta={fechaHasta} />}
      {tab==='productos'  && <TabProductos  productos={productos}  cargando={cargando} />}
      {tab==='comisiones' && <TabComisiones vendedores={vendedores} cargando={cargando} />}
    </div>
  );
}
