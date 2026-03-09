'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const S = {
  page:      { background:'var(--cream)', minHeight:'100vh', padding:'28px 32px', fontFamily:'Rubik, sans-serif', color:'var(--text-primary)' },
  kicker:    { color:'var(--orange)', fontSize:'0.78rem', fontWeight:600, letterSpacing:'0.10em', textTransform:'uppercase', marginBottom:'6px' },
  title:     { fontSize:'1.7rem', fontWeight:700, color:'var(--text-primary)', margin:0 },
  caption:   { fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'4px', marginBottom:'28px' },
  card:      { background:'#fff', borderRadius:'12px', padding:'20px 24px', marginBottom:'16px', border:'1px solid var(--border-soft)', boxShadow:'var(--card-shadow)' },
  tabs:      { display:'flex', gap:'8px', marginBottom:'24px', borderBottom:'1px solid var(--border-soft)', paddingBottom:'0' },
  tab:       { padding:'8px 18px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer', fontSize:'0.9rem', fontWeight:500, background:'transparent', color:'var(--text-muted)', marginBottom:'-1px' },
  tabActive: { background:'var(--cream)', color:'var(--orange)', borderBottom:'2px solid var(--orange)' },
  table:     { width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' },
  th:        { background:'var(--cream)', color:'var(--text-muted)', padding:'9px 12px', textAlign:'left', borderBottom:'1px solid var(--border-soft)', fontWeight:600, whiteSpace:'nowrap' },
  td:        { padding:'8px 12px', borderBottom:'1px solid var(--border-soft)', color:'var(--text-primary)', whiteSpace:'nowrap' },
  input:     { background:'var(--cream)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-primary)', padding:'8px 12px', fontSize:'0.9rem', outline:'none', boxSizing:'border-box' },
  btnPrimary:{ background:'var(--orange)', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 20px', fontWeight:700, cursor:'pointer', fontSize:'0.9rem' },
  btnGhost:  { background:'var(--cream)', color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 16px', cursor:'pointer', fontSize:'0.88rem' },
  label:     { fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:'4px', display:'block' },
  empty:     { background:'#fff', borderRadius:'12px', padding:'48px 24px', textAlign:'center', border:'1px dashed var(--border)', color:'var(--text-muted)' },
  kpiCard:   { background:'#fff', borderRadius:'12px', padding:'18px 20px', border:'1px solid var(--border-soft)', boxShadow:'var(--card-shadow)' },
  kpiVal:    { fontSize:'1.6rem', fontWeight:700, color:'var(--text-primary)', margin:'6px 0 2px' },
  kpiLabel:  { fontSize:'0.78rem', color:'var(--text-muted)', fontWeight:500 },
  grid4:     { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'14px', marginBottom:'24px' },
  medal:     { display:'inline-block', fontSize:'1.1rem', marginRight:6 },
};

const CRC = (v) => v != null ? `₡${parseFloat(v).toLocaleString('es-CR',{minimumFractionDigits:0,maximumFractionDigits:0})}` : '—';
const PCT = (v) => v != null ? `${(parseFloat(v)*100).toFixed(1)}%` : '—';

function usarFechas() {
  const [fechas, setFechas] = useState([]);
  const [fechaSel, setFechaSel] = useState('');
  const [periodo, setPeriodo] = useState('');

  useEffect(() => {
    supabase.from('neo_items_facturados')
      .select('fecha_carga, periodo_reporte')
      .order('fecha_carga', { ascending: false })
      .then(({ data }) => {
        if (!data?.length) return;
        const vistos = new Set(); const unicas = [];
        for (const r of data) {
          if (!vistos.has(r.fecha_carga)) { vistos.add(r.fecha_carga); unicas.push(r); }
        }
        setFechas(unicas);
        setFechaSel(unicas[0].fecha_carga);
        setPeriodo(unicas[0].periodo_reporte || '');
      });
  }, []);

  return { fechas, fechaSel, setFechaSel, periodo, setPeriodo };
}

// ── Resumen ejecutivo ─────────────────────────────────────────────────────
function TabResumen({ fechaSel }) {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!fechaSel) return;
    setCargando(true);
    (async () => {
      let todos = [], off = 0;
      while (true) {
        const { data } = await supabase.from('neo_items_facturados')
          .select('vendedor,subtotal,costo_unitario,cantidad_facturada,descuento,impuestos,total,factura')
          .eq('fecha_carga', fechaSel)
          .range(off, off+999);
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }
      setDatos(todos);
      setCargando(false);
    })();
  }, [fechaSel]);

  if (cargando) return <p style={{color:'var(--text-muted)'}}>⏳ Calculando...</p>;
  if (!datos.length) return null;

  // Agrupar por vendedor
  const byVendedor = {};
  for (const row of datos) {
    const v = row.vendedor || '(sin vendedor)';
    if (!byVendedor[v]) byVendedor[v] = { facturas: new Set(), items:0, ventas:0, costo:0, descuento:0, impuestos:0, total:0 };
    const g = byVendedor[v];
    g.facturas.add(row.factura);
    g.items    += parseFloat(row.cantidad_facturada)||0;
    g.ventas   += parseFloat(row.subtotal)||0;
    g.costo    += (parseFloat(row.costo_unitario)||0) * (parseFloat(row.cantidad_facturada)||0);
    g.descuento+= parseFloat(row.descuento)||0;
    g.impuestos+= parseFloat(row.impuestos)||0;
    g.total    += parseFloat(row.total)||0;
  }

  const lista = Object.entries(byVendedor)
    .map(([v, g]) => ({
      vendedor: v,
      facturas: g.facturas.size,
      items: g.items,
      ventas: g.ventas,
      costo: g.costo,
      descuento: g.descuento,
      impuestos: g.impuestos,
      total: g.total,
      utilidad: g.ventas - g.costo,
      margen: g.ventas > 0 ? (g.ventas - g.costo) / g.ventas : 0,
      ticket: g.total / g.facturas.size,
    }))
    .sort((a,b) => b.total - a.total);

  const totalVentas  = lista.reduce((s,r) => s + r.total, 0);
  const totalUtil    = lista.reduce((s,r) => s + r.utilidad, 0);
  const totalFact    = lista.reduce((s,r) => s + r.facturas, 0);
  const margenGlobal = lista.reduce((s,r)=>s+r.ventas,0) > 0
    ? totalUtil / lista.reduce((s,r)=>s+r.ventas,0) : 0;

  const medals = ['🥇','🥈','🥉'];

  return (
    <div>
      {/* KPIs globales */}
      <div style={S.grid4}>
        {[
          { label:'Total facturado', val: CRC(totalVentas), color:'var(--orange)' },
          { label:'Utilidad bruta',  val: CRC(totalUtil),   color:'#276749' },
          { label:'Margen global',   val: PCT(margenGlobal),color:'#2C5282' },
          { label:'Facturas emitidas',val:`${totalFact}`,   color:'var(--text-primary)' },
        ].map((k,i)=>(
          <div key={i} style={S.kpiCard}>
            <div style={S.kpiLabel}>{k.label}</div>
            <div style={{...S.kpiVal, color:k.color, fontSize:'1.3rem'}}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Tabla ranking */}
      <div style={{overflowX:'auto', borderRadius:8, border:'1px solid var(--border-soft)'}}>
        <table style={S.table}>
          <thead>
            <tr>
              {['#','Vendedor','Facturas','Ítems','Ventas netas','Descuentos','Impuestos','Total cobrado','Costo','Utilidad','Margen','Ticket prom.'].map(h=>(
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lista.map((r,i)=>(
              <tr key={i} style={{background: i%2===0?'#fff':'#FAFAFA'}}>
                <td style={{...S.td, fontWeight:700}}>{medals[i]||`${i+1}°`}</td>
                <td style={{...S.td, fontWeight:600}}>{r.vendedor}</td>
                <td style={{...S.td, textAlign:'right'}}>{r.facturas}</td>
                <td style={{...S.td, textAlign:'right'}}>{r.items.toFixed(0)}</td>
                <td style={{...S.td, textAlign:'right'}}>{CRC(r.ventas)}</td>
                <td style={{...S.td, textAlign:'right', color:'#C05621'}}>{r.descuento>0?CRC(r.descuento):'—'}</td>
                <td style={{...S.td, textAlign:'right', color:'var(--text-muted)'}}>{CRC(r.impuestos)}</td>
                <td style={{...S.td, textAlign:'right', fontWeight:700}}>{CRC(r.total)}</td>
                <td style={{...S.td, textAlign:'right', color:'var(--text-muted)'}}>{CRC(r.costo)}</td>
                <td style={{...S.td, textAlign:'right', fontWeight:600, color: r.utilidad>=0?'#276749':'#C53030'}}>{CRC(r.utilidad)}</td>
                <td style={{...S.td, textAlign:'right', fontWeight:700,
                  color: r.margen>=0.40?'#276749': r.margen>=0.30?'#2C5282':'#C05621',
                  background: r.margen>=0.40?'#F0FFF4': r.margen>=0.30?'#EBF8FF':'#FFFAF0',
                }}>{PCT(r.margen)}</td>
                <td style={{...S.td, textAlign:'right'}}>{CRC(r.ticket)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Comisiones ────────────────────────────────────────────────────────────
function TabComisiones({ fechaSel }) {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);
  // Parámetros editables
  const [metaGlobal, setMetaGlobal]   = useState(2000000);
  const [pctBase, setPctBase]         = useState(2.0);
  const [pctBonoMeta, setPctBonoMeta] = useState(1.5);
  const [pctBonoMgn, setPctBonoMgn]   = useState(0.5);
  const [umbralMgn, setUmbralMgn]     = useState(40);

  useEffect(() => {
    if (!fechaSel) return;
    setCargando(true);
    (async () => {
      let todos = [], off = 0;
      while (true) {
        const { data } = await supabase.from('neo_items_facturados')
          .select('vendedor,subtotal,costo_unitario,cantidad_facturada,total,factura')
          .eq('fecha_carga', fechaSel).range(off, off+999);
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }
      setDatos(todos);
      setCargando(false);
    })();
  }, [fechaSel]);

  const byV = {};
  for (const row of datos) {
    const v = row.vendedor || '(sin vendedor)';
    if (!byV[v]) byV[v] = { total:0, ventas:0, costo:0, facturas: new Set() };
    byV[v].total  += parseFloat(row.total)||0;
    byV[v].ventas += parseFloat(row.subtotal)||0;
    byV[v].costo  += (parseFloat(row.costo_unitario)||0)*(parseFloat(row.cantidad_facturada)||0);
    byV[v].facturas.add(row.factura);
  }

  const lista = Object.entries(byV).map(([v, g]) => {
    const margen = g.ventas > 0 ? (g.ventas - g.costo) / g.ventas : 0;
    const comBase = g.total * (pctBase / 100);
    const bonoMeta = g.total > metaGlobal ? (g.total - metaGlobal) * (pctBonoMeta / 100) : 0;
    const bonoMgn  = margen * 100 >= umbralMgn ? g.total * (pctBonoMgn / 100) : 0;
    return { vendedor:v, total:g.total, margen, comBase, bonoMeta, bonoMgn,
             totalCom: comBase + bonoMeta + bonoMgn, pctAvance: g.total / metaGlobal };
  }).sort((a,b)=>b.total-a.total);

  const numInput = (val, set, label) => (
    <div>
      <label style={S.label}>{label}</label>
      <input style={{...S.input, width:'140px'}} type="number" value={val}
             onChange={e=>set(parseFloat(e.target.value)||0)} step="0.1"/>
    </div>
  );

  return (
    <div>
      {/* Config panel */}
      <div style={{...S.card, background:'#EBF8FF', border:'1px solid #BEE3F8', marginBottom:20}}>
        <p style={{margin:'0 0 12px', color:'#2C5282', fontWeight:600, fontSize:'0.9rem'}}>⚙️ Parámetros de comisión — editá los valores y la tabla se actualiza automáticamente</p>
        <div style={{display:'flex', gap:'16px', flexWrap:'wrap', alignItems:'flex-end'}}>
          {numInput(metaGlobal,   setMetaGlobal,   'Meta mensual (₡)')}
          {numInput(pctBase,      setPctBase,      '% Comisión base')}
          {numInput(pctBonoMeta,  setPctBonoMeta,  '% Bono si supera meta')}
          {numInput(pctBonoMgn,   setPctBonoMgn,   '% Bono margen alto')}
          {numInput(umbralMgn,    setUmbralMgn,    'Margen umbral (%)')}
        </div>
      </div>

      {cargando && <p style={{color:'var(--text-muted)'}}>⏳ Calculando...</p>}

      {!cargando && (
        <div style={{overflowX:'auto', borderRadius:8, border:'1px solid var(--border-soft)'}}>
          <table style={S.table}>
            <thead>
              <tr>
                {['Vendedor','Ventas','Meta','Avance','Margen','Com. base','Bono meta','Bono margen','Total comisión'].map(h=>(
                  <th key={h} style={S.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.map((r,i)=>(
                <tr key={i} style={{background: i%2===0?'#fff':'#FAFAFA'}}>
                  <td style={{...S.td, fontWeight:600}}>{r.vendedor}</td>
                  <td style={{...S.td, textAlign:'right', fontWeight:600}}>{CRC(r.total)}</td>
                  <td style={{...S.td, textAlign:'right', color:'var(--text-muted)'}}>{CRC(metaGlobal)}</td>
                  <td style={{...S.td, textAlign:'right'}}>
                    <div style={{display:'flex', alignItems:'center', gap:8, justifyContent:'flex-end'}}>
                      <div style={{width:60, height:6, borderRadius:3, background:'#e8e8e8', overflow:'hidden'}}>
                        <div style={{width:`${Math.min(100,r.pctAvance*100)}%`, height:'100%', background: r.pctAvance>=1?'#276749':'var(--orange)', borderRadius:3}}/>
                      </div>
                      <span style={{fontWeight:600, color:r.pctAvance>=1?'#276749':'var(--orange)'}}>{(r.pctAvance*100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{...S.td, textAlign:'right', color:r.margen*100>=umbralMgn?'#276749':'var(--text-primary)', fontWeight:r.margen*100>=umbralMgn?700:400}}>
                    {PCT(r.margen)}
                  </td>
                  <td style={{...S.td, textAlign:'right'}}>{CRC(r.comBase)}</td>
                  <td style={{...S.td, textAlign:'right', color:'#276749', fontWeight:r.bonoMeta>0?700:400}}>
                    {r.bonoMeta>0?CRC(r.bonoMeta):'—'}
                  </td>
                  <td style={{...S.td, textAlign:'right', color:'#2C5282', fontWeight:r.bonoMgn>0?700:400}}>
                    {r.bonoMgn>0?CRC(r.bonoMgn):'—'}
                  </td>
                  <td style={{...S.td, textAlign:'right', fontWeight:700, background:'#FFF8F0', color:'var(--orange)'}}>
                    {CRC(r.totalCom)}
                  </td>
                </tr>
              ))}
              {/* Total */}
              <tr style={{background:'var(--cream)', fontWeight:700}}>
                <td style={{...S.td, fontWeight:700}}>TOTAL</td>
                <td style={{...S.td, textAlign:'right'}}>{CRC(lista.reduce((s,r)=>s+r.total,0))}</td>
                <td colSpan={5}/>
                <td/>
                <td style={{...S.td, textAlign:'right', fontWeight:700, color:'var(--orange)'}}>{CRC(lista.reduce((s,r)=>s+r.totalCom,0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
      <p style={{color:'var(--text-muted)', fontSize:'0.8rem', marginTop:12}}>
        💡 Estos datos son del período seleccionado. Para metas mensuales, subí el reporte del mes completo.
      </p>
    </div>
  );
}

// ── Medios de pago ────────────────────────────────────────────────────────
function TabMediosPago({ fechaSel }) {
  const [datos, setDatos] = useState([]);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    if (!fechaSel) return;
    setCargando(true);
    supabase.from('neo_consolidado_facturas')
      .select('vendedor,modo_pago,total')
      .eq('fecha_carga', fechaSel)
      .then(({ data }) => {
        setDatos(data || []);
        setCargando(false);
      });
  }, [fechaSel]);

  if (cargando) return <p style={{color:'var(--text-muted)'}}>⏳ Cargando...</p>;
  if (!datos.length) return (
    <div style={S.empty}>
      <p>Sin datos de consolidado de facturas para este período.</p>
      <p style={{fontSize:'0.83rem'}}>Subí el reporte <strong>Consolidado de facturas</strong> en <a href="/reportes" style={{color:'var(--orange)'}}>Carga de reportes</a></p>
    </div>
  );

  // Pivot
  const modos = [...new Set(datos.map(d=>d.modo_pago||'N/D'))].sort();
  const byV = {};
  for (const row of datos) {
    const v = row.vendedor || '(sin)';
    if (!byV[v]) { byV[v] = {}; for (const m of modos) byV[v][m] = 0; byV[v].__total = 0; }
    byV[v][row.modo_pago||'N/D'] += parseFloat(row.total)||0;
    byV[v].__total += parseFloat(row.total)||0;
  }
  const lista = Object.entries(byV).sort((a,b)=>b[1].__total-a[1].__total);

  return (
    <div style={{overflowX:'auto', borderRadius:8, border:'1px solid var(--border-soft)'}}>
      <table style={S.table}>
        <thead>
          <tr>
            <th style={S.th}>Vendedor</th>
            {modos.map(m=><th key={m} style={S.th}>{m}</th>)}
            <th style={S.th}>Total</th>
          </tr>
        </thead>
        <tbody>
          {lista.map(([v, g], i)=>(
            <tr key={i} style={{background: i%2===0?'#fff':'#FAFAFA'}}>
              <td style={{...S.td, fontWeight:600}}>{v}</td>
              {modos.map(m=><td key={m} style={{...S.td, textAlign:'right'}}>{g[m]>0?CRC(g[m]):'—'}</td>)}
              <td style={{...S.td, textAlign:'right', fontWeight:700, background:'#FFF8F0', color:'var(--orange)'}}>{CRC(g.__total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Vista principal ───────────────────────────────────────────────────────
export default function VendedoresPage() {
  const [tab, setTab] = useState(0);
  const { fechas, fechaSel, setFechaSel, periodo, setPeriodo } = usarFechas();
  const [sinDatos, setSinDatos] = useState(false);

  useEffect(() => {
    if (fechas.length === 0) {
      setTimeout(() => setSinDatos(fechas.length === 0), 3000);
    }
  }, [fechas]);

  const fmtDate = (iso) => {
    try { return new Intl.DateTimeFormat('es-CR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',timeZone:'America/Costa_Rica'}).format(new Date(iso)); }
    catch { return iso?.slice(0,10)||iso||''; }
  };

  if (sinDatos && !fechas.length) return (
    <div style={S.page}>
      <div style={S.kicker}>Comercial</div>
      <h1 style={S.title}>👥 Equipo de ventas</h1>
      <p style={S.caption}>Rendimiento, utilidad y comisiones por vendedor.</p>
      <div style={S.empty}>
        <div style={{fontSize:'2.5rem', marginBottom:12}}>👥</div>
        <p style={{margin:0, fontWeight:600}}>Sin datos de ventas</p>
        <p style={{margin:'8px 0 0', fontSize:'0.85rem'}}>
          Subí <strong>Lista de ítems facturados</strong> y <strong>Consolidado de facturas</strong> en{' '}
          <a href="/reportes" style={{color:'var(--orange)'}}>Carga de reportes</a>
        </p>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.kicker}>Comercial</div>
      <h1 style={S.title}>👥 Equipo de ventas</h1>
      <p style={S.caption}>Rendimiento, utilidad y comisiones por vendedor.</p>

      {/* Selector de período */}
      {fechas.length > 0 && (
        <div style={{display:'flex', gap:12, alignItems:'center', marginBottom:24, flexWrap:'wrap'}}>
          <div>
            <label style={S.label}>Período</label>
            <select style={{...S.input, minWidth:300}}
                    value={fechaSel}
                    onChange={e=>{
                      const sel = fechas.find(f=>f.fecha_carga===e.target.value);
                      setFechaSel(e.target.value);
                      setPeriodo(sel?.periodo_reporte||'');
                    }}>
              {fechas.map(f=>(
                <option key={f.fecha_carga} value={f.fecha_carga}>
                  {fmtDate(f.fecha_carga)} — {f.periodo_reporte||'Sin período'}
                </option>
              ))}
            </select>
          </div>
          {periodo && <span style={{color:'var(--text-muted)', fontSize:'0.83rem', alignSelf:'flex-end', paddingBottom:4}}>📅 {periodo}</span>}
        </div>
      )}

      {/* Tabs */}
      <div style={S.tabs}>
        {['📊 Resumen ejecutivo','🎯 Comisiones','💳 Medios de pago'].map((t,i)=>(
          <button key={i} style={{...S.tab,...(tab===i?S.tabActive:{})}} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {fechaSel ? (
        <>
          {tab===0 && <div style={S.card}><TabResumen fechaSel={fechaSel}/></div>}
          {tab===1 && <div style={S.card}><TabComisiones fechaSel={fechaSel}/></div>}
          {tab===2 && <div style={S.card}><TabMediosPago fechaSel={fechaSel}/></div>}
        </>
      ) : (
        <div style={S.empty}>
          <p>⏳ Cargando períodos disponibles...</p>
        </div>
      )}
    </div>
  );
}
