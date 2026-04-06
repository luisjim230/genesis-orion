'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase as sb } from '../../lib/supabase';

// ── Estilos ────────────────────────────────────────────────────────────────
const S = {
  page:    { background:'var(--cream)', minHeight:'100vh', padding:'28px 32px', fontFamily:'DM Sans,sans-serif', color:'var(--text-primary)' },
  title:   { fontSize:'1.7rem', fontWeight:700, color:'var(--text-primary)', margin:0 },
  caption: { fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'4px', marginBottom:'24px' },
  divider: { border:'none', borderTop:'1px solid var(--border-soft)', margin:'20px 0' },
  tabs:    { display:'flex', gap:'4px', marginBottom:'24px', flexWrap:'wrap' },
  tab:     (a) => ({ background:a?'var(--orange)':'#fff', color:a?'#fff':'var(--text-muted)', border:'1px solid '+(a?'var(--orange)':'var(--border)'), borderRadius:'8px', padding:'8px 16px', cursor:'pointer', fontWeight:a?700:400, fontSize:'0.88rem' }),
  grid4:   { display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'20px' },
  grid2:   { display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'16px' },
  kpi:     { background:'#fff', borderRadius:'12px', padding:'16px', border:'1px solid var(--border-soft)' },
  kpiL:    { fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:'6px' },
  kpiV:    { fontSize:'1.4rem', fontWeight:700, color:'var(--orange)' },
  input:   { background:'var(--cream)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-primary)', padding:'8px 12px', fontSize:'0.9rem', outline:'none', boxSizing:'border-box' },
  label:   { fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:'4px', display:'block' },
  btnG:    { background:'#fff', color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 16px', cursor:'pointer', fontSize:'0.88rem' },
  info:    { background:'#EBF8FF', border:'1px solid #BEE3F8', borderRadius:'8px', padding:'14px', color:'#2C5282', fontSize:'0.88rem' },
  warn:    { background:'#FFFBEB', border:'1px solid #FAD776', borderRadius:'8px', padding:'12px', color:'#7B341E', fontSize:'0.85rem' },
  ok:      { background:'#F0FFF4', border:'1px solid #9AE6B4', borderRadius:'8px', padding:'12px', color:'#276749', fontSize:'0.85rem' },
  tbl:     { width:'100%', borderCollapse:'collapse', fontSize:'0.83rem' },
  th:      { background:'var(--cream)', color:'var(--text-muted)', padding:'8px 10px', textAlign:'left', borderBottom:'1px solid var(--border-soft)', fontWeight:600, fontSize:'0.8rem', whiteSpace:'nowrap' },
  td:      (i) => ({ padding:'7px 10px', borderBottom:'1px solid var(--border-soft)', background:i%2===0?'#ffffff':'#fdf8f8', color:'var(--text-primary)', fontSize:'0.82rem' }),
  exp:     { background:'#fff', border:'1px solid var(--border-soft)', borderRadius:'8px', marginBottom:'6px', overflow:'hidden' },
  exph:    { padding:'12px 16px', cursor:'pointer', display:'flex', justifyContent:'space-between', alignItems:'center', userSelect:'none' },
};

// ── Utilidades ─────────────────────────────────────────────────────────────
const fC = (v) => { try { return '₡' + parseFloat(v).toLocaleString('es-CR', { maximumFractionDigits:0 }); } catch { return '—'; }};
const N  = (v) => parseFloat(v) || 0;

const SEM_P = ['dias_91_120','mas_120_dias'];
const SEM_A = ['dias_61_90'];
const SEM_Y = ['dias_31_60','dias_23_30'];

function semaforo(row) {
  if (SEM_P.some(k => N(row[k]) > 0)) return '🔴';
  if (SEM_A.some(k => N(row[k]) > 0)) return '🟠';
  if (SEM_Y.some(k => N(row[k]) > 0)) return '🟡';
  return '🟢';
}

function Exp({ title, children }) {
  const [o, sO] = useState(false);
  return (
    <div style={S.exp}>
      <div style={S.exph} onClick={() => sO(!o)}>
        <span style={{ fontSize:'0.88rem', color:'var(--text-primary)' }}>{title}</span>
        <span style={{ color:'var(--orange)', fontSize:'0.85rem' }}>{o ? '▲' : '▼'}</span>
      </div>
      {o && <div style={{ padding:'0 16px 16px' }}>{children}</div>}
    </div>
  );
}

function KPI({ label, value, color }) {
  return (
    <div style={S.kpi}>
      <div style={S.kpiL}>{label}</div>
      <div style={{ ...S.kpiV, color: color || 'var(--orange)' }}>{value}</div>
    </div>
  );
}

function UltimaActualizacion({ fecha }) {
  if (!fecha) return null;
  const f = new Date(fecha).toLocaleString('es-CR', { timeZone:'America/Costa_Rica', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  return <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginBottom:'12px' }}>📅 Datos al: <strong style={{ color:'var(--text-primary)' }}>{f}</strong></div>;
}

// ── Tab: Cuentas por Pagar ─────────────────────────────────────────────────
function TabPagar({ tcC }) {
  const [rows, setRows]     = useState([]);
  const [fecha, setFecha]   = useState(null);
  const [loading, setLoad]  = useState(true);
  const [filtroSem, setFS]  = useState('Todos');
  const [buscar, setBus]    = useState('');
  const [colExtra, setColX] = useState(['sin_vencer','dias_1_30','dias_31_60','mas_120_dias']);

  useEffect(() => {
    (async () => {
      setLoad(true);
      // Obtener fecha de la carga más reciente
      const { data: fd } = await sb.from('fin_cuentas_pagar').select('fecha_carga')
        .order('fecha_carga', { ascending:false }).limit(1);
      if (!fd?.length) { setLoad(false); return; }
      const fc = fd[0].fecha_carga;
      setFecha(fc);
      // Cargar todos los registros de esa carga
      let all = [], off = 0;
      while (true) {
        const { data } = await sb.from('fin_cuentas_pagar').select('*').eq('fecha_carga', fc).range(off, off+999);
        if (!data?.length) break;
        all = [...all, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }
      setRows(all);
      setLoad(false);
    })();
  }, []);

  if (loading) return <div style={S.info}>⏳ Cargando cuentas por pagar...</div>;
  if (!rows.length) return (
    <div style={S.info}>
      📭 Sin datos. Subí el reporte <strong>Antigüedad de saldos de proveedores</strong> en{' '}
      <a href="/reportes" style={{ color:'var(--orange)' }}>Carga de reportes</a> y se sincronizará automáticamente.
    </div>
  );

  const tot    = rows.reduce((s,r) => s + N(r.saldo_actual), 0);
  const sv     = rows.reduce((s,r) => s + N(r.sin_vencer), 0);
  const v30    = rows.reduce((s,r) => s + N(r.dias_1_30), 0);
  const v60    = rows.reduce((s,r) => s + N(r.dias_31_60), 0);
  const crit   = rows.reduce((s,r) => s + N(r.dias_91_120) + N(r.mas_120_dias), 0);
  const hayUSD = rows.some(r => r.moneda === 'USD');
  const totUSD = rows.filter(r => r.moneda === 'USD').reduce((s,r) => s + N(r.saldo_actual), 0);

  let df = rows.map(r => ({ ...r, _sem: semaforo(r) }));
  if (filtroSem === '🔴') df = df.filter(r => r._sem === '🔴');
  if (filtroSem === '🟠') df = df.filter(r => r._sem === '🟠');
  if (filtroSem === '🟡') df = df.filter(r => r._sem === '🟡');
  if (filtroSem === '🟢') df = df.filter(r => r._sem === '🟢');
  if (buscar) df = df.filter(r => String(r.proveedor||'').toLowerCase().includes(buscar.toLowerCase()) || String(r.numero||'').toLowerCase().includes(buscar.toLowerCase()));

  // Resumen por proveedor
  const resProv = Object.entries(df.reduce((a,r) => {
    const k = r.proveedor || '—';
    a[k] = (a[k] || 0) + N(r.saldo_actual);
    return a;
  }, {})).sort((a,b) => b[1]-a[1]).map(([p,s]) => ({ proveedor:p, saldo_actual:s }));

  const COLS_ANT = [
    { key:'sin_vencer',   label:'Sin vencer' },
    { key:'dias_1_8',     label:'1-8d' },
    { key:'dias_9_15',    label:'9-15d' },
    { key:'dias_16_22',   label:'16-22d' },
    { key:'dias_23_30',   label:'23-30d' },
    { key:'dias_1_30',    label:'1-30d' },
    { key:'dias_31_60',   label:'31-60d' },
    { key:'dias_61_90',   label:'61-90d' },
    { key:'dias_91_120',  label:'91-120d' },
    { key:'mas_120_dias', label:'+120d' },
  ];

  const exportCSV = () => {
    const cols = ['_sem','proveedor','moneda','tipo','numero','saldo_actual','fecha_vencimiento',...colExtra];
    const csv = [cols.join(','), ...df.map(r => cols.map(c => `"${String(r[c]||'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,\ufeff'+encodeURIComponent(csv);
    a.download = `cuentas_pagar_${fecha?.slice(0,10)||'export'}.csv`; a.click();
  };

  return (
    <div>
      <UltimaActualizacion fecha={fecha} />

      {/* KPIs */}
      <div style={S.grid4}>
        <KPI label="💰 Total por pagar"     value={fC(tot)}  color="var(--orange)" />
        <KPI label="🟢 Sin vencer"          value={fC(sv)}   color="#276749" />
        <KPI label="🟡 Vencido 1-30d"       value={fC(v30)}  color="#B7791F" />
        <KPI label="🔴 Crítico (+90d)"      value={fC(crit)} color="#C53030" />
      </div>

      {hayUSD && tcC && (
        <div style={{ ...S.warn, marginBottom:'12px', fontSize:'0.82rem' }}>
          💵 Hay <strong>${totUSD.toLocaleString('es-CR',{minimumFractionDigits:2})}</strong> USD → <strong style={{ color:'#4ec9b0' }}>₡{(totUSD*tcC).toLocaleString('es-CR',{maximumFractionDigits:0})}</strong> al TC ₡{tcC.toFixed(2)}
        </div>
      )}

      <hr style={S.divider}/>

      {/* Filtros */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'12px', marginBottom:'16px' }}>
        <div>
          <label style={S.label}>Semáforo</label>
          <select style={{ ...S.input, width:'100%' }} value={filtroSem} onChange={e => setFS(e.target.value)}>
            {['Todos','🔴','🟠','🟡','🟢'].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Buscar proveedor o número</label>
          <input style={{ ...S.input, width:'100%' }} placeholder="Nombre..." value={buscar} onChange={e => setBus(e.target.value)} />
        </div>
      </div>

      {/* Columnas de antigüedad visibles */}
      <div style={{ marginBottom:'16px' }}>
        <label style={S.label}>Columnas de antigüedad a mostrar</label>
        <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
          {COLS_ANT.map(c => (
            <label key={c.key} style={{ display:'flex', alignItems:'center', gap:'4px', fontSize:'0.8rem', color:'var(--text-primary)', cursor:'pointer' }}>
              <input type="checkbox" checked={colExtra.includes(c.key)}
                onChange={e => setColX(prev => e.target.checked ? [...prev,c.key] : prev.filter(x=>x!==c.key))} />
              {c.label}
            </label>
          ))}
        </div>
      </div>

      {/* Tabla */}
      <div style={{ overflowX:'auto', borderRadius:'10px', border:'1px solid var(--border-soft)', marginBottom:'16px' }}>
        <table style={S.tbl}>
          <thead>
            <tr>
              <th style={S.th}>🚦</th>
              <th style={S.th}>Proveedor</th>
              <th style={S.th}>Moneda</th>
              <th style={S.th}>Tipo</th>
              <th style={S.th}>Número</th>
              <th style={{ ...S.th, textAlign:'right' }}>Saldo actual</th>
              <th style={S.th}>Vencimiento</th>
              {colExtra.map(k => <th key={k} style={{ ...S.th, textAlign:'right' }}>{COLS_ANT.find(c=>c.key===k)?.label||k}</th>)}
            </tr>
          </thead>
          <tbody>
            {df.map((r,i) => (
              <tr key={i}>
                <td style={S.td(i)}>{r._sem}</td>
                <td style={S.td(i)}>{r.proveedor||'—'}</td>
                <td style={S.td(i)}>{r.moneda||'—'}</td>
                <td style={S.td(i)}>{r.tipo||'—'}</td>
                <td style={S.td(i)}>{r.numero||'—'}</td>
                <td style={{ ...S.td(i), textAlign:'right', fontWeight:600 }}>{fC(r.saldo_actual)}</td>
                <td style={S.td(i)}>{r.fecha_vencimiento||'—'}</td>
                {colExtra.map(k => <td key={k} style={{ ...S.td(i), textAlign:'right' }}>{N(r[k])>0?fC(r[k]):'—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Resumen por proveedor */}
      <Exp title={`📊 Resumen por proveedor (${resProv.length})`}>
        <table style={S.tbl}>
          <thead><tr><th style={S.th}>Proveedor</th><th style={{ ...S.th, textAlign:'right' }}>Saldo actual</th></tr></thead>
          <tbody>
            {resProv.map((r,i) => (
              <tr key={i}>
                <td style={S.td(i)}>{r.proveedor}</td>
                <td style={{ ...S.td(i), textAlign:'right', fontWeight:600 }}>{fC(r.saldo_actual)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Exp>

      <button style={{ ...S.btnG, marginTop:'12px' }} onClick={exportCSV}>⬇️ Exportar CSV</button>
    </div>
  );
}

// ── Tab: Cuentas por Cobrar ────────────────────────────────────────────────
function TabCobrar({ tcC }) {
  const [rows, setRows]    = useState([]);
  const [fecha, setFecha]  = useState(null);
  const [loading, setLoad] = useState(true);
  const [filtroSem, setFS] = useState('Todos');
  const [buscar, setBus]   = useState('');

  useEffect(() => {
    (async () => {
      setLoad(true);
      const { data: fd } = await sb.from('fin_cuentas_cobrar').select('fecha_carga')
        .order('fecha_carga', { ascending:false }).limit(1);
      if (!fd?.length) { setLoad(false); return; }
      const fc = fd[0].fecha_carga;
      setFecha(fc);
      let all = [], off = 0;
      while (true) {
        const { data } = await sb.from('fin_cuentas_cobrar').select('*').eq('fecha_carga', fc).range(off, off+999);
        if (!data?.length) break;
        all = [...all, ...data];
        if (data.length < 1000) break;
        off += 1000;
      }
      setRows(all);
      setLoad(false);
    })();
  }, []);

  if (loading) return <div style={S.info}>⏳ Cargando cuentas por cobrar...</div>;
  if (!rows.length) return (
    <div style={S.info}>
      📭 Sin datos. Subí el reporte <strong>Antigüedad de saldos de clientes</strong> en{' '}
      <a href="/reportes" style={{ color:'var(--orange)' }}>Carga de reportes</a>.
    </div>
  );

  const SEM_CC = (row) => {
    if (N(row.dias_91_120)>0 || N(row.mas_120_dias)>0) return '🔴';
    if (N(row.dias_61_90)>0) return '🟠';
    if (N(row.dias_31_60)>0) return '🟡';
    return '🟢';
  };

  const tot  = rows.reduce((s,r) => s + N(r.saldo_actual), 0);
  const sv   = rows.reduce((s,r) => s + N(r.sin_vencer), 0);
  const nC   = new Set(rows.map(r => r.cliente)).size;
  const venc = tot - sv;

  let df = rows.map(r => ({ ...r, _sem: SEM_CC(r) }));
  if (filtroSem !== 'Todos') df = df.filter(r => r._sem === filtroSem);
  if (buscar) df = df.filter(r => String(r.cliente||'').toLowerCase().includes(buscar.toLowerCase()));

  const exportCSV = () => {
    const cols = ['_sem','cliente','vendedor','tipo','numero','saldo_actual','fecha_vencimiento','sin_vencer','dias_1_30','dias_31_60','dias_61_90','dias_91_120','mas_120_dias'];
    const csv = [cols.join(','), ...df.map(r => cols.map(c => `"${String(r[c]||'').replace(/"/g,'""')}"`).join(','))].join('\n');
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,\ufeff'+encodeURIComponent(csv);
    a.download = `cuentas_cobrar_${fecha?.slice(0,10)||'export'}.csv`; a.click();
  };

  return (
    <div>
      <UltimaActualizacion fecha={fecha} />
      <div style={S.grid4}>
        <KPI label="📥 Total por cobrar" value={fC(tot)}  color="var(--teal, #225F74)" />
        <KPI label="🟢 Sin vencer"       value={fC(sv)}   color="#276749" />
        <KPI label="🔴 Vencido"          value={fC(venc)} color="#C53030" />
        <KPI label="👥 Clientes"         value={nC}       color="#3182CE" />
      </div>
      <hr style={S.divider}/>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:'12px', marginBottom:'16px' }}>
        <div>
          <label style={S.label}>Semáforo</label>
          <select style={{ ...S.input, width:'100%' }} value={filtroSem} onChange={e => setFS(e.target.value)}>
            {['Todos','🔴','🟠','🟡','🟢'].map(o => <option key={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label style={S.label}>Buscar cliente</label>
          <input style={{ ...S.input, width:'100%' }} placeholder="Nombre..." value={buscar} onChange={e => setBus(e.target.value)} />
        </div>
      </div>
      <div style={{ overflowX:'auto', borderRadius:'10px', border:'1px solid var(--border-soft)', marginBottom:'16px' }}>
        <table style={S.tbl}>
          <thead>
            <tr>
              <th style={S.th}>🚦</th>
              <th style={S.th}>Cliente</th>
              <th style={S.th}>Vendedor</th>
              <th style={S.th}>Tipo</th>
              <th style={S.th}>Número</th>
              <th style={{ ...S.th, textAlign:'right' }}>Saldo actual</th>
              <th style={S.th}>Vencimiento</th>
              <th style={{ ...S.th, textAlign:'right' }}>Sin vencer</th>
              <th style={{ ...S.th, textAlign:'right' }}>1-30d</th>
              <th style={{ ...S.th, textAlign:'right' }}>31-60d</th>
              <th style={{ ...S.th, textAlign:'right' }}>61-90d</th>
              <th style={{ ...S.th, textAlign:'right' }}>91-120d</th>
              <th style={{ ...S.th, textAlign:'right' }}>+120d</th>
            </tr>
          </thead>
          <tbody>
            {df.map((r,i) => (
              <tr key={i}>
                <td style={S.td(i)}>{r._sem}</td>
                <td style={S.td(i)}>{r.cliente||'—'}</td>
                <td style={S.td(i)}>{r.vendedor||'—'}</td>
                <td style={S.td(i)}>{r.tipo||'—'}</td>
                <td style={S.td(i)}>{r.numero||'—'}</td>
                <td style={{ ...S.td(i), textAlign:'right', fontWeight:600 }}>{fC(r.saldo_actual)}</td>
                <td style={S.td(i)}>{r.fecha_vencimiento||'—'}</td>
                {['sin_vencer','dias_1_30','dias_31_60','dias_61_90','dias_91_120','mas_120_dias'].map(k => (
                  <td key={k} style={{ ...S.td(i), textAlign:'right' }}>{N(r[k])>0?fC(r[k]):'—'}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button style={S.btnG} onClick={exportCSV}>⬇️ Exportar CSV</button>
    </div>
  );
}

// ── Tab: Flujo de Caja ─────────────────────────────────────────────────────
function TabFlujo({ tcC }) {
  const [rP, setRP] = useState([]);
  const [rC, setRC] = useState([]);
  const [saldo, setSaldo] = useState(0);
  const [loading, setLoad] = useState(true);

  useEffect(() => {
    (async () => {
      setLoad(true);
      const [pRes, cRes] = await Promise.all([
        (async () => {
          const { data: fd } = await sb.from('fin_cuentas_pagar').select('fecha_carga').order('fecha_carga',{ascending:false}).limit(1);
          if (!fd?.length) return [];
          const { data } = await sb.from('fin_cuentas_pagar').select('*').eq('fecha_carga', fd[0].fecha_carga);
          return data || [];
        })(),
        (async () => {
          const { data: fd } = await sb.from('fin_cuentas_cobrar').select('fecha_carga').order('fecha_carga',{ascending:false}).limit(1);
          if (!fd?.length) return [];
          const { data } = await sb.from('fin_cuentas_cobrar').select('*').eq('fecha_carga', fd[0].fecha_carga);
          return data || [];
        })(),
      ]);
      setRP(pRes);
      setRC(cRes);
      setLoad(false);
    })();
  }, []);

  if (loading) return <div style={S.info}>⏳ Cargando flujo de caja...</div>;
  if (!rP.length && !rC.length) return (
    <div style={S.info}>📭 Subí ambos reportes de antigüedad de saldos en <a href="/reportes" style={{ color:'var(--orange)' }}>Carga de reportes</a> para ver el flujo.</div>
  );

  const TRAMOS_C = ['sin_vencer','dias_1_30','dias_31_60','dias_61_90','dias_91_120','mas_120_dias'];
  const TRAMOS_P = ['sin_vencer','dias_1_8','dias_9_15','dias_16_22','dias_23_30','dias_1_30','dias_31_60','dias_61_90','dias_91_120','mas_120_dias'];

  const flujo = [];
  TRAMOS_C.forEach(k => {
    const m = rC.reduce((s,r) => s + N(r[k]), 0);
    if (m > 0) flujo.push({ tipo:'📥 Cobro', tramo:k.replace('dias_','').replace('_',' ').replace('sin vencer','Sin vencer').replace('mas','Más de'), monto:m, signo:m });
  });
  TRAMOS_P.forEach(k => {
    const m = rP.reduce((s,r) => s + N(r[k]), 0);
    if (m > 0) flujo.push({ tipo:'💸 Pago', tramo:k.replace('dias_','').replace('_',' ').replace('sin vencer','Sin vencer').replace('mas','Más de'), monto:m, signo:-m });
  });

  const ent = flujo.filter(x => x.signo > 0).reduce((s,x) => s + x.signo, 0);
  const sal = flujo.filter(x => x.signo < 0).reduce((s,x) => s + Math.abs(x.signo), 0);
  const net = saldo + ent - sal;

  return (
    <div>
      <div style={{ marginBottom:'16px' }}>
        <label style={S.label}>💵 Saldo inicial en caja (₡)</label>
        <input style={{ ...S.input, width:'200px' }} type="number" step="100000" value={saldo} onChange={e => setSaldo(parseFloat(e.target.value)||0)} />
      </div>
      <div style={S.grid4}>
        <KPI label="💵 Saldo inicial"  value={fC(saldo)} />
        <KPI label="📥 Total cobros"   value={fC(ent)}   color="#276749" />
        <KPI label="💸 Total pagos"    value={fC(sal)}   color="#C53030" />
        <KPI label="🏦 Posición neta"  value={fC(net)}   color={net>=0?'#276749':'#C53030'} />
      </div>
      <hr style={S.divider}/>
      <div style={{ overflowX:'auto', borderRadius:'10px', border:'1px solid var(--border-soft)', marginBottom:'16px' }}>
        <table style={S.tbl}>
          <thead><tr>
            <th style={S.th}>Tipo</th>
            <th style={S.th}>Tramo</th>
            <th style={{ ...S.th, textAlign:'right' }}>Monto</th>
          </tr></thead>
          <tbody>
            {flujo.map((x,i) => (
              <tr key={i}>
                <td style={S.td(i)}>{x.tipo}</td>
                <td style={S.td(i)}>{x.tramo}</td>
                <td style={{ ...S.td(i), textAlign:'right', fontWeight:600, color:x.signo>0?'#276749':'#C53030' }}>{fC(x.monto)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={net<0 ? S.warn : S.ok}>
        {net<0 ? `⚠️ Posición neta negativa: ${fC(net)}` : `✅ Posición proyectada: ${fC(net)}`}
      </div>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
export default function FinanzasPage() {
  const [tab, setTab]      = useState(0);
  const [tcBAC, setTcBAC]  = useState(null);
  const [loading, setLoad] = useState(true);

  useEffect(() => {
    setLoad(false);
    fetch('/api/mercado?fuente=bccr_ref')
      .then(r => r.json())
      .then(j => { if (j.ok && j.data?.venta) setTcBAC(j.data.venta); })
      .catch(() => {});
  }, []);

  const TABS = ['💸 Cuentas por Pagar', '📥 Cuentas por Cobrar', '🌊 Flujo de Caja'];
  const MODULOS = [{ href: '/finanzas/movimientos', label: '📒 Movimientos Contables', desc: 'Desglose por categoría y comparativo mensual' }];

  return (
    <div style={S.page}>
      <h1 style={S.title}>💰 Módulo Financiero</h1>
      <div style={S.caption}>
        Cuentas por pagar · Cuentas por cobrar · Flujo de caja
        {tcBAC && <span style={{ marginLeft:'12px', fontSize:'0.78rem', color:'#4ec9b0' }}>💱 TC BCCR venta: ₡{tcBAC.toFixed(2)}</span>}
        <div style={{ marginTop:'6px', fontSize:'0.78rem', color:'var(--text-muted)' }}>
          Los datos se actualizan automáticamente al subir reportes en <a href="/reportes" style={{ color:'var(--orange)' }}>Carga de reportes</a>.
        </div>
      </div>
      <hr style={S.divider} />
      {/* Accesos rápidos a sub-módulos */}
      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
        {MODULOS.map(m => (
          <Link key={m.href} href={m.href} style={{ background: '#fff', border: '1px solid var(--border-soft)', borderRadius: '10px', padding: '10px 16px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)' }}>{m.label}</span>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{m.desc}</span>
            <span style={{ color: 'var(--orange)', fontSize: '0.8rem' }}>→</span>
          </Link>
        ))}
      </div>

      <div style={S.tabs}>
        {TABS.map((t,i) => <button key={t} style={S.tab(tab===i)} onClick={() => setTab(i)}>{t}</button>)}
      </div>
      {tab === 0 && <TabPagar  tcC={tcBAC} />}
      {tab === 1 && <TabCobrar tcC={tcBAC} />}
      {tab === 2 && <TabFlujo  tcC={tcBAC} />}
    </div>
  );
}
