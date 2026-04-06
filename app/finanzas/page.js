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
const TC_IMP = 515; // ₡ por USD para pagos de importaciones (ajustable)

function TabFlujo({ tcC }) {
  const [bancos,     setBancos]    = useState([]);
  const [cobrar,     setCobrar]    = useState([]);
  const [pagar,      setPagar]     = useState([]);
  const [gastos,     setGastos]    = useState([]);
  const [ventasHist, setVentasHist]= useState([]);
  const [envios,     setEnvios]    = useState([]);
  const [loading,    setLoad]      = useState(true);

  useEffect(() => {
    (async () => {
      setLoad(true);
      try {
        // 1. Saldos bancarios
        const { data: bData } = await sb.from('fin_bancos').select('cuenta_codigo,saldo,moneda,notas');
        setBancos(bData || []);

        // 2. Cuentas por cobrar (última carga)
        const { data: fd1 } = await sb.from('fin_cuentas_cobrar')
          .select('fecha_carga').order('fecha_carga', { ascending: false }).limit(1);
        if (fd1?.length) {
          let all = [], off = 0;
          while (true) {
            const { data } = await sb.from('fin_cuentas_cobrar')
              .select('saldo_actual,sin_vencer,dias_1_30,dias_31_60')
              .eq('fecha_carga', fd1[0].fecha_carga).range(off, off + 999);
            if (!data?.length) break;
            all = [...all, ...data];
            if (data.length < 1000) break;
            off += 1000;
          }
          setCobrar(all);
        }

        // 3. Cuentas por pagar (última carga)
        const { data: fd2 } = await sb.from('fin_cuentas_pagar')
          .select('fecha_carga').order('fecha_carga', { ascending: false }).limit(1);
        if (fd2?.length) {
          let all = [], off = 0;
          while (true) {
            const { data } = await sb.from('fin_cuentas_pagar')
              .select('saldo_actual,sin_vencer,dias_1_30,dias_31_60')
              .eq('fecha_carga', fd2[0].fecha_carga).range(off, off + 999);
            if (!data?.length) break;
            all = [...all, ...data];
            if (data.length < 1000) break;
            off += 1000;
          }
          setPagar(all);
        }

        // 4. Gastos recurrentes — últimos 3 meses, cuentas 70-XX y 90-XX
        const hace3m = new Date();
        hace3m.setMonth(hace3m.getMonth() - 3);
        const fStr = hace3m.toISOString().slice(0, 10);
        let movs = [], mOff = 0;
        while (mOff < 50000) {
          const { data } = await sb.from('neo_movimientos_contables')
            .select('cuenta_contable,debe_moneda_asiento')
            .not('fecha', 'is', null)
            .gte('fecha', fStr)
            .or('cuenta_contable.ilike.70%,cuenta_contable.ilike.90%')
            .range(mOff, mOff + 999);
          if (!data?.length) break;
          movs = [...movs, ...data];
          if (data.length < 1000) break;
          mOff += 1000;
        }
        const cMap = {};
        movs.forEach(m => {
          const cc  = (m.cuenta_contable || '').trim() || '—';
          const amt = parseFloat(String(m.debe_moneda_asiento || '').replace(/,/g, '')) || 0;
          if (amt > 0) cMap[cc] = (cMap[cc] || 0) + amt;
        });
        setGastos(
          Object.entries(cMap)
            .map(([cuenta, total]) => ({ cuenta, mensual: total / 3, semanal: (total / 3) / 4 }))
            .filter(g => g.mensual >= 100000)
            .sort((a, b) => b.mensual - a.mensual)
            .slice(0, 20)
        );

        // 5. Ventas históricas mensuales
        let vAll = [], vOff = 0;
        while (true) {
          const { data } = await sb.from('neo_informe_ventas_vendedor')
            .select('periodo_reporte,ventas_netas')
            .not('ventas_netas', 'is', null)
            .order('periodo_reporte')
            .range(vOff, vOff + 999);
          if (!data?.length) break;
          vAll = [...vAll, ...data];
          if (data.length < 1000) break;
          vOff += 1000;
        }
        const vMap = {};
        vAll.forEach(r => {
          const p   = String(r.periodo_reporte || '').slice(0, 7);
          const amt = parseFloat(String(r.ventas_netas || '').replace(/,/g, '')) || 0;
          if (p && amt !== 0) vMap[p] = (vMap[p] || 0) + amt;
        });
        setVentasHist(
          Object.entries(vMap)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([periodo, total]) => ({ periodo, total }))
        );

        // 6. Envíos de importaciones pendientes
        const { data: eData } = await sb.from('neptuno_envios')
          .select('nombre,proveedor,eta,final_monto,estado')
          .not('archivado', 'is', true)
          .eq('final_pago', false)
          .gt('final_monto', 0)
          .not('eta', 'is', null)
          .order('eta');
        setEnvios(eData || []);
      } catch (e) { console.error('TabFlujo:', e); }
      setLoad(false);
    })();
  }, []);

  if (loading) return <div style={S.info}>⏳ Calculando flujo de caja...</div>;

  // ── Posición actual ──────────────────────────────────────────────────────
  const saldoCRC  = bancos.filter(b => b.moneda === 'CRC').reduce((s, b) => s + N(b.saldo), 0);
  const saldoUSD  = bancos.filter(b => b.moneda === 'USD').reduce((s, b) => s + N(b.saldo), 0);
  const totCobrar = cobrar.reduce((s, r) => s + N(r.saldo_actual), 0);
  const totPagar  = pagar.reduce((s, r) => s + N(r.saldo_actual), 0);

  // ── Ventas proyectadas (promedio 6 meses, -30% pesimista) ───────────────
  const now = new Date();
  const currentPeriod = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  const periodosCompletos = ventasHist
    .filter(v => v.periodo < currentPeriod && v.total > 0)
    .slice(-6);
  const promedioMensualReal = periodosCompletos.length > 0
    ? periodosCompletos.reduce((s, v) => s + v.total, 0) / periodosCompletos.length
    : 0;
  const promedioMensual = promedioMensualReal * 0.70; // escenario pesimista -30%
  const ventaW = promedioMensual / 4;

  // ── Pagos de importaciones por semana ────────────────────────────────────
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const envisConFecha = envios.map(e => {
    const eta = new Date(e.eta);
    const fechaPago = new Date(eta);
    fechaPago.setDate(fechaPago.getDate() - 25);
    const diffDays = Math.floor((fechaPago - today) / (1000 * 60 * 60 * 24));
    const weekIdx  = Math.floor(diffDays / 7);
    const montoUSD = N(e.final_monto);
    const montoCRC = montoUSD * TC_IMP;
    return { ...e, eta, fechaPago, diffDays, weekIdx, montoUSD, montoCRC };
  });
  const pagosImpSem = Array(8).fill(0);
  envisConFecha.forEach(e => {
    if (e.weekIdx >= 0 && e.weekIdx < 8) pagosImpSem[e.weekIdx] += e.montoCRC;
  });
  const totalImpUSD = envisConFecha.reduce((s, e) => s + e.montoUSD, 0);
  const totalImpCRC = envisConFecha.reduce((s, e) => s + e.montoCRC, 0);

  // ── Distribución semanal ─────────────────────────────────────────────────
  // sin_vencer → sem 1-2 · dias_1_30 → sem 3-6 · dias_31_60 → sem 7-8
  const cSV   = cobrar.reduce((s, r) => s + N(r.sin_vencer), 0);
  const c130  = cobrar.reduce((s, r) => s + N(r.dias_1_30), 0);
  const c3160 = cobrar.reduce((s, r) => s + N(r.dias_31_60), 0);
  const pSV   = pagar.reduce((s, r) => s + N(r.sin_vencer), 0);
  const p130  = pagar.reduce((s, r) => s + N(r.dias_1_30), 0);
  const p3160 = pagar.reduce((s, r) => s + N(r.dias_31_60), 0);
  const gastoW = gastos.reduce((s, g) => s + g.semanal, 0);

  const cobrosSem = [cSV/2, cSV/2, c130/4, c130/4, c130/4, c130/4, c3160/2, c3160/2];
  const pagosSem  = [pSV/2, pSV/2, p130/4, p130/4, p130/4, p130/4, p3160/2, p3160/2];

  const semanas = (() => {
    const arr = []; let sAcum = saldoCRC;
    for (let i = 0; i < 8; i++) {
      const d = new Date(); d.setDate(d.getDate() + i * 7);
      const sInicial = sAcum;
      sAcum = sAcum + cobrosSem[i] + ventaW - pagosSem[i] - gastoW - pagosImpSem[i];
      arr.push({ label: `S${i+1} ${d.getDate()}/${d.getMonth()+1}`, sInicial, cobro: cobrosSem[i], ventaProy: ventaW, pago: pagosSem[i], gasto: gastoW, pagoImp: pagosImpSem[i], sFinal: sAcum });
    }
    return arr;
  })();

  // ── SVG Chart ────────────────────────────────────────────────────────────
  const fM = v => {
    const a = Math.abs(v);
    if (a >= 1e9) return `₡${(v/1e9).toFixed(1)}B`;
    if (a >= 1e6) return `₡${(v/1e6).toFixed(1)}M`;
    if (a >= 1e3) return `₡${(v/1e3).toFixed(0)}K`;
    return '₡0';
  };

  const CW = 800, CH = 310, padL = 74, padR = 16, padT = 42, padB = 46;
  const pW = CW - padL - padR, pH = CH - padT - padB;
  const allBars = [...cobrosSem.map(c => c + ventaW), ...pagosSem.map((p, i) => p + gastoW + pagosImpSem[i])];
  const rawMax  = Math.max(...allBars, saldoCRC, 1);
  const rawMin  = Math.min(...semanas.map(s => s.sFinal), 0);
  const yMax    = rawMax * 1.18;
  const yMin    = rawMin < 0 ? rawMin * 1.15 : 0;
  const yRange  = yMax - yMin || 1;
  const yS      = v => padT + pH - ((v - yMin) / yRange) * pH;
  const wk      = pW / 8;
  const bW      = wk * 0.20;
  const gap     = 2;
  const startOff = wk / 2 - 1.5 * bW - gap;
  const grid    = Array.from({ length: 6 }, (_, i) => yMin + (yRange / 5) * i);

  const svgChart = (
    <svg viewBox={`0 0 ${CW} ${CH}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
      <defs>
        <pattern id="hatchVentas" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)">
          <rect width="5" height="5" fill="#C6F6D5" />
          <line x1="0" y1="0" x2="0" y2="5" stroke="#48BB78" strokeWidth="2" />
        </pattern>
      </defs>

      <rect x={padL} y={padT} width={pW} height={pH} fill="#FAFAFA" rx="4" />

      {grid.map((val, i) => (
        <g key={i}>
          <line x1={padL} y1={yS(val)} x2={CW - padR} y2={yS(val)} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3,3" />
          <text x={padL - 6} y={yS(val) + 4} textAnchor="end" fontSize="9.5" fill="#718096">{fM(val)}</text>
        </g>
      ))}
      <line x1={padL} y1={yS(0)} x2={CW - padR} y2={yS(0)} stroke="#A0AEC0" strokeWidth="1.2" />

      {semanas.map((s, i) => {
        const xBase = padL + i * wk;
        const xC = xBase + startOff;
        const xV = xC + bW + gap;
        const xP = xV + bW + gap;
        const yBase = yS(0);
        const hC = yBase - yS(s.cobro);
        const hV = yBase - yS(s.ventaProy);
        const hP = yBase - yS(s.pago + s.gasto + s.pagoImp);
        return (
          <g key={i}>
            {/* Cobros reales — verde sólido */}
            {hC > 0 && <rect x={xC} y={yS(s.cobro)} width={bW} height={hC} fill="#48BB78" rx="3" opacity="0.9" />}
            {hC > 14 && <text x={xC + bW/2} y={yS(s.cobro) - 3} textAnchor="middle" fontSize="7" fill="#276749">{fM(s.cobro)}</text>}
            {/* Ventas proyectadas — patrón rayado */}
            {hV > 0 && <rect x={xV} y={yS(s.ventaProy)} width={bW} height={hV} fill="url(#hatchVentas)" rx="3" stroke="#48BB78" strokeWidth="0.8" />}
            {hV > 14 && <text x={xV + bW/2} y={yS(s.ventaProy) - 3} textAnchor="middle" fontSize="7" fill="#276749">{fM(s.ventaProy)}</text>}
            {/* Pagos + gastos + importaciones — rojo */}
            {hP > 0 && <rect x={xP} y={yS(s.pago + s.gasto + s.pagoImp)} width={bW} height={hP} fill="#FC8181" rx="3" opacity="0.85" />}
            {hP > 14 && <text x={xP + bW/2} y={yS(s.pago + s.gasto + s.pagoImp) - 3} textAnchor="middle" fontSize="7" fill="#C53030">{fM(s.pago + s.gasto + s.pagoImp)}</text>}
            <text x={xBase + wk/2} y={CH - padB + 14} textAnchor="middle" fontSize="9" fill="#4A5568">{s.label}</text>
          </g>
        );
      })}

      {semanas.map((s, i) => {
        if (i === 0) return null;
        const x1 = padL + (i-1)*wk + wk/2, y1 = yS(semanas[i-1].sFinal);
        const x2 = padL + i*wk + wk/2,     y2 = yS(s.sFinal);
        const neg = s.sFinal < 0 || semanas[i-1].sFinal < 0;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={neg ? '#E53E3E' : '#3182CE'} strokeWidth="2.5" />;
      })}
      {semanas.map((s, i) => {
        const cx = padL + i*wk + wk/2, cy = yS(s.sFinal);
        const neg = s.sFinal < 0;
        return (
          <g key={i}>
            <circle cx={cx} cy={cy} r="4" fill={neg ? '#E53E3E' : '#3182CE'} stroke="#fff" strokeWidth="1.5" />
            <text x={cx} y={neg ? cy + 14 : cy - 7} textAnchor="middle" fontSize="7.5" fill={neg ? '#C53030' : '#2B6CB0'} fontWeight="600">{fM(s.sFinal)}</text>
          </g>
        );
      })}

      {/* Leyenda — 4 items */}
      <rect x={padL}       y={8} width="10" height="10" fill="#48BB78" rx="2" />
      <text x={padL + 14}  y={17} fontSize="9" fill="#4A5568">Cobros CxC</text>
      <rect x={padL + 100} y={8} width="10" height="10" fill="url(#hatchVentas)" stroke="#48BB78" strokeWidth="0.8" rx="2" />
      <text x={padL + 114} y={17} fontSize="9" fill="#4A5568">Ventas proy. (-30%)</text>
      <rect x={padL + 258} y={8} width="10" height="10" fill="#FC8181" rx="2" />
      <text x={padL + 272} y={17} fontSize="9" fill="#4A5568">Pagos + Gastos + Imp.</text>
      <line x1={padL + 418} y1={13} x2={padL + 432} y2={13} stroke="#3182CE" strokeWidth="2.5" />
      <circle cx={padL + 425} cy={13} r="3" fill="#3182CE" stroke="#fff" strokeWidth="1" />
      <text x={padL + 436} y={17} fontSize="9" fill="#4A5568">Saldo proyectado</text>
    </svg>
  );

  // ── Semáforos ─────────────────────────────────────────────────────────────
  const smf = sf =>
    sf < 0         ? { icon: '🔴', color: '#C53030', bg: '#FFF5F5' }
    : sf < 5000000 ? { icon: '🟡', color: '#B7791F', bg: '#FFFBEB' }
                   : { icon: '🟢', color: '#276749', bg: '#F0FFF4' };

  const smfImp = days =>
    days < 0    ? { icon: '🔴', label: 'Vencido',    color: '#C53030' }
    : days < 14 ? { icon: '🔴', label: `${days}d`,   color: '#C53030' }
    : days < 28 ? { icon: '🟡', label: `${days}d`,   color: '#B7791F' }
                : { icon: '🟢', label: `${days}d`,   color: '#276749' };

  const secH = { marginBottom: '6px', fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.06em', textTransform: 'uppercase' };

  return (
    <div>
      {/* ── Sección 1: Posición Actual ───────────────────────── */}
      <div style={secH}>Posición Actual</div>
      <div style={S.grid4}>
        <KPI label="🏦 Saldo bancos CRC"   value={fC(saldoCRC)}  color="#276749" />
        <KPI label="💵 Saldo bancos USD"   value={`$${saldoUSD.toLocaleString('es-CR',{minimumFractionDigits:2})}`} color="#3182CE" />
        <KPI label="📥 Cuentas por cobrar" value={fC(totCobrar)} color="var(--teal,#225F74)" />
        <KPI label="💸 Cuentas por pagar"  value={fC(totPagar)}  color="var(--orange)" />
      </div>

      {bancos.length > 0 && (
        <Exp title={`🏛 Cuentas bancarias (${bancos.length})`}>
          <table style={S.tbl}>
            <thead><tr>
              <th style={S.th}>Cuenta</th>
              <th style={S.th}>Moneda</th>
              <th style={{ ...S.th, textAlign:'right' }}>Saldo</th>
              <th style={S.th}>Notas</th>
            </tr></thead>
            <tbody>
              {bancos.map((b, i) => (
                <tr key={i}>
                  <td style={S.td(i)}>{b.cuenta_codigo||'—'}</td>
                  <td style={S.td(i)}>{b.moneda||'—'}</td>
                  <td style={{ ...S.td(i), textAlign:'right', fontWeight:600 }}>
                    {b.moneda==='USD' ? `$${N(b.saldo).toLocaleString('es-CR',{minimumFractionDigits:2})}` : fC(b.saldo)}
                  </td>
                  <td style={{ ...S.td(i), color:'var(--text-muted)' }}>{b.notas||'—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Exp>
      )}

      <hr style={S.divider}/>

      {/* ── Ventas Proyectadas — banner de advertencia ────────── */}
      {promedioMensualReal > 0 && (
        <div style={{ background:'#FFFBEB', border:'2px solid #F6AD55', borderRadius:'12px', padding:'16px 20px', marginBottom:'16px' }}>
          <div style={{ display:'flex', alignItems:'flex-start', gap:'12px' }}>
            <span style={{ fontSize:'1.6rem', lineHeight:1 }}>⚠️</span>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:'1rem', fontWeight:800, color:'#7B341E', letterSpacing:'0.01em', marginBottom:'6px' }}>
                PROYECCIÓN ESTIMADA — No son datos reales
              </div>
              <div style={{ fontSize:'0.88rem', color:'#744210', lineHeight:1.6 }}>
                Los ingresos por <strong>ventas proyectadas</strong> se calculan con base en el promedio de ventas
                de los últimos <strong>{periodosCompletos.length} meses</strong> completos
                ({periodosCompletos.map(p => p.periodo).join(', ')}).
                No son cobros confirmados.
              </div>
              <div style={{ marginTop:'10px', padding:'10px 14px', background:'#FED7AA', borderRadius:'8px', border:'1px solid #F6AD55' }}>
                <span style={{ fontWeight:800, color:'#C05621', fontSize:'0.92rem' }}>⚠️ ESCENARIO PESIMISTA -30%: Se aplicó -30% al promedio histórico para ser conservadores.</span>
                <div style={{ marginTop:'4px', fontSize:'0.86rem', color:'#7B341E' }}>
                  Promedio real: <strong>{fC(promedioMensualReal)}/mes</strong>
                  {' · '}
                  <span style={{ color:'#C05621', fontWeight:700 }}>Con -30%: {fC(promedioMensual)}/mes · {fC(ventaW)}/sem</span>
                </div>
              </div>
            </div>
          </div>
          {periodosCompletos.length > 0 && (
            <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginTop:'12px' }}>
              {periodosCompletos.map((p, i) => (
                <div key={i} style={{ padding:'4px 10px', background:'#fff', border:'1px solid #F6AD55', borderRadius:'6px', fontSize:'0.8rem', color:'#744210' }}>
                  <span style={{ fontWeight:600 }}>{p.periodo}</span>: {fC(p.total)}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Sección 2: Proyección Semanal ────────────────────── */}
      <div style={secH}>Proyección Semanal — Próximas 8 Semanas</div>

      {semanas.some(s => s.sFinal < 0) && (
        <div style={{ ...S.warn, marginBottom:'12px' }}>
          ⚠️ <strong>{semanas.filter(s => s.sFinal < 0).length} semana(s)</strong> con saldo proyectado negativo — revisá los compromisos de pago.
        </div>
      )}

      <div style={{ background:'#fff', border:'1px solid var(--border-soft)', borderRadius:'12px', padding:'16px 16px 8px', marginBottom:'16px' }}>
        {svgChart}
        <div style={{ display:'flex', gap:'12px', marginTop:'4px', fontSize:'0.75rem', color:'var(--text-muted)', justifyContent:'center', flexWrap:'wrap' }}>
          <span>📌 Línea azul/roja = saldo bancario CRC proyectado</span>
          <span>📌 Barras rayadas = ventas estimadas -30% (no confirmadas)</span>
          <span>📌 Barras rojas = pagos CxP + gastos recurrentes + importaciones</span>
        </div>
      </div>

      <hr style={S.divider}/>

      {/* ── Sección 3: Gastos Recurrentes ────────────────────── */}
      <div style={secH}>Gastos Recurrentes Estimados (promedio últimos 3 meses)</div>

      {gastos.length === 0 ? (
        <div style={{ ...S.info, marginBottom:'16px' }}>📭 Sin datos de movimientos contables para estimar gastos.</div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid var(--border-soft)', borderRadius:'12px', padding:'16px', marginBottom:'16px' }}>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:'6px' }}>
            {gastos.map((g, i) => (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', background:i%2===0?'var(--cream)':'#fff', borderRadius:'6px', border:'1px solid var(--border-soft)' }}>
                <span style={{ fontSize:'0.82rem', color:'var(--text-primary)', flex:1, marginRight:'8px', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }} title={g.cuenta}>{g.cuenta}</span>
                <div style={{ textAlign:'right', whiteSpace:'nowrap' }}>
                  <div style={{ fontSize:'0.83rem', fontWeight:600, color:'#C53030' }}>{fC(g.mensual)}<span style={{ fontWeight:400, color:'var(--text-muted)', fontSize:'0.76rem' }}>/mes</span></div>
                  <div style={{ fontSize:'0.74rem', color:'var(--text-muted)' }}>{fC(g.semanal)}/sem</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop:'12px', paddingTop:'10px', borderTop:'1px solid var(--border-soft)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:'0.88rem', fontWeight:600, color:'var(--text-primary)' }}>Total estimado</span>
            <span style={{ fontSize:'0.92rem', fontWeight:700, color:'#C53030' }}>
              {fC(gastos.reduce((s,g)=>s+g.mensual,0))}<span style={{ fontWeight:400, color:'var(--text-muted)', fontSize:'0.8rem' }}>/mes</span>
              {' · '}
              {fC(gastoW)}<span style={{ fontWeight:400, color:'var(--text-muted)', fontSize:'0.8rem' }}>/sem</span>
            </span>
          </div>
        </div>
      )}

      <hr style={S.divider}/>

      {/* ── Sección 4: Pagos de Importaciones ────────────────── */}
      <div style={secH}>🚢 Pagos de Importaciones Proyectados</div>

      {envisConFecha.length === 0 ? (
        <div style={{ ...S.info, marginBottom:'16px' }}>✅ Sin importaciones pendientes de pago.</div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid var(--border-soft)', borderRadius:'12px', padding:'16px', marginBottom:'16px' }}>
          <div style={{ fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:'10px' }}>
            TC importaciones: <strong style={{ color:'var(--text-primary)' }}>₡{TC_IMP}/USD</strong> ·{' '}
            Fecha pago estimada = ETA − 25 días ·{' '}
            {envisConFecha.filter(e => e.weekIdx >= 0 && e.weekIdx < 8).length > 0 && (
              <span style={{ color:'#C53030', fontWeight:600 }}>
                {envisConFecha.filter(e => e.weekIdx >= 0 && e.weekIdx < 8).length} pago(s) caen dentro de las próximas 8 semanas
              </span>
            )}
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={S.tbl}>
              <thead>
                <tr>
                  <th style={S.th}>🚦</th>
                  <th style={S.th}>Contenedor</th>
                  <th style={S.th}>Proveedor</th>
                  <th style={S.th}>ETA</th>
                  <th style={S.th}>Fecha pago est.</th>
                  <th style={{ ...S.th, textAlign:'right' }}>USD</th>
                  <th style={{ ...S.th, textAlign:'right' }}>CRC (₡{TC_IMP}/USD)</th>
                  <th style={S.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {envisConFecha.map((e, i) => {
                  const sm = smfImp(e.diffDays);
                  const enRango = e.weekIdx >= 0 && e.weekIdx < 8;
                  const etaStr = e.eta instanceof Date ? e.eta.toLocaleDateString('es-CR') : String(e.eta||'').slice(0,10);
                  return (
                    <tr key={i} style={enRango ? { background:'#FFF5F5' } : {}}>
                      <td style={S.td(i)} title={sm.label}>{sm.icon}</td>
                      <td style={{ ...S.td(i), fontWeight:600 }}>{e.nombre||'—'}</td>
                      <td style={S.td(i)}>{e.proveedor||'—'}</td>
                      <td style={S.td(i)}>{etaStr}</td>
                      <td style={{ ...S.td(i), color:sm.color, fontWeight:e.diffDays < 14 ? 700 : 400 }}>
                        {e.fechaPago.toLocaleDateString('es-CR')}
                        <span style={{ fontSize:'0.74rem', color:'var(--text-muted)', marginLeft:'4px' }}>({sm.label})</span>
                      </td>
                      <td style={{ ...S.td(i), textAlign:'right', fontWeight:600 }}>
                        ${e.montoUSD.toLocaleString('es-CR',{minimumFractionDigits:2})}
                      </td>
                      <td style={{ ...S.td(i), textAlign:'right', fontWeight:600, color:enRango?'#C53030':undefined }}>
                        {fC(e.montoCRC)}
                        {enRango && <span style={{ fontSize:'0.7rem', display:'block', color:'#C53030' }}>→ S{e.weekIdx+1}</span>}
                      </td>
                      <td style={{ ...S.td(i), fontSize:'0.78rem', color:'var(--text-muted)' }}>{e.estado||'—'}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={5} style={{ ...S.td(0), fontWeight:700, borderTop:'2px solid var(--border-soft)' }}>TOTAL PENDIENTE</td>
                  <td style={{ ...S.td(0), textAlign:'right', fontWeight:700, color:'#C53030', borderTop:'2px solid var(--border-soft)' }}>
                    ${totalImpUSD.toLocaleString('es-CR',{minimumFractionDigits:2})}
                  </td>
                  <td style={{ ...S.td(0), textAlign:'right', fontWeight:700, color:'#C53030', borderTop:'2px solid var(--border-soft)' }}>{fC(totalImpCRC)}</td>
                  <td style={{ ...S.td(0), borderTop:'2px solid var(--border-soft)' }}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <hr style={S.divider}/>

      {/* ── Sección 5: Tabla Detalle ──────────────────────────── */}
      <div style={secH}>Tabla Detalle por Semana</div>
      <div style={{ overflowX:'auto', borderRadius:'10px', border:'1px solid var(--border-soft)', marginBottom:'16px' }}>
        <table style={S.tbl}>
          <thead>
            <tr>
              <th style={{ ...S.th, minWidth:'195px' }}>Concepto</th>
              {semanas.map((s, i) => {
                const sm = smf(s.sFinal);
                return <th key={i} style={{ ...S.th, textAlign:'right', background:sm.bg, minWidth:'100px' }}>{s.label} {sm.icon}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {[
              { label:'💰 Saldo inicial',             key:'sInicial', color:'#3182CE', bold:false, est:false },
              { label:'📥 (+) Cobros CxC',             key:'cobro',    color:'#276749', bold:false, est:false },
              { label:'📊 (+) Ventas proy. (-30%) ⚠️', key:'ventaProy',color:'#B7791F', bold:false, est:true  },
              { label:'💸 (−) Pagos CxP',              key:'pago',     color:'#C53030', bold:false, est:false },
              { label:'🔧 (−) Gastos rec.',            key:'gasto',    color:'#7B341E', bold:false, est:false },
              { label:'🚢 (−) Pagos importaciones',    key:'pagoImp',  color:'#744210', bold:false, est:false },
              { label:'🏦 = Saldo final',              key:'sFinal',   color:null,      bold:true,  est:false },
            ].map((row, ri) => (
              <tr key={ri}>
                <td style={{ ...S.td(ri), fontWeight:row.bold?700:400, borderTop:row.bold?'2px solid var(--border-soft)':undefined, background:row.est?'#FFFBEB':undefined }}>
                  {row.label}
                </td>
                {semanas.map((s, ci) => {
                  const v  = s[row.key];
                  const sm = smf(s.sFinal);
                  const bg = row.bold ? sm.bg : row.est ? '#FFFBEB' : row.key==='pagoImp' && v > 0 ? '#FFF5F5' : ci%2===0?'#fff':'#fdf8f8';
                  return (
                    <td key={ci} style={{ ...S.td(ci), textAlign:'right', fontWeight:row.bold?700:400, color:row.bold?sm.color:(row.color||'var(--text-primary)'), background:bg, borderTop:row.bold?'2px solid var(--border-soft)':undefined }}>
                      {v > 0 || row.bold || row.key==='sInicial' ? fC(v) : '—'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display:'flex', gap:'10px', fontSize:'0.8rem', flexWrap:'wrap' }}>
        <span style={{ padding:'4px 10px', background:'#F0FFF4', border:'1px solid #9AE6B4', borderRadius:'6px', color:'#276749' }}>🟢 Saldo &gt; ₡5M — sin problema</span>
        <span style={{ padding:'4px 10px', background:'#FFFBEB', border:'1px solid #FAD776', borderRadius:'6px', color:'#B7791F' }}>🟡 Saldo ₡0–₡5M — atención</span>
        <span style={{ padding:'4px 10px', background:'#FFF5F5', border:'1px solid #FEB2B2', borderRadius:'6px', color:'#C53030' }}>🔴 Saldo negativo — alerta</span>
        <span style={{ padding:'4px 10px', background:'#FFFBEB', border:'1px solid #F6AD55', borderRadius:'6px', color:'#7B341E' }}>⚠️ Fondo amarillo = estimado (-30%)</span>
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
      <div style={S.tabs}>
        {TABS.map((t,i) => <button key={t} style={S.tab(tab===i)} onClick={() => setTab(i)}>{t}</button>)}
        <Link href="/finanzas/movimientos" style={S.tab(false)}>📒 Movimientos Contables</Link>
      </div>
      {tab === 0 && <TabPagar  tcC={tcBAC} />}
      {tab === 1 && <TabCobrar tcC={tcBAC} />}
      {tab === 2 && <TabFlujo  tcC={tcBAC} />}
    </div>
  );
}
