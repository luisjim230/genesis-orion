'use client';
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// ── Estilos ────────────────────────────────────────────────────────────────
const S = {
  page:      { background:'var(--cream)', minHeight:'100vh', padding:'28px 32px', fontFamily:'DM Sans, sans-serif', color:'var(--text-primary)' },
  title:     { fontSize:'1.7rem', fontWeight:700, color:'var(--text-primary)', margin:0 },
  caption:   { fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'4px', marginBottom:'24px' },
  tabs:      { display:'flex', gap:'8px', marginBottom:'24px', borderBottom:'1px solid var(--border-soft)' },
  tab:       { padding:'8px 18px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer', fontSize:'0.9rem', fontWeight:500, background:'transparent', color:'var(--text-muted)', marginBottom:'-1px' },
  tabActive: { background:'var(--cream)', color:'var(--orange)', borderBottom:'2px solid var(--orange)' },
  card:      { background:'#fff', borderRadius:'12px', padding:'20px', marginBottom:'16px', border:'1px solid var(--border-soft)' },
  input:     { background:'var(--cream)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-primary)', padding:'8px 12px', fontSize:'0.9rem', width:'100%', outline:'none', boxSizing:'border-box' },
  select:    { background:'var(--cream)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-primary)', padding:'8px 12px', fontSize:'0.9rem', width:'100%', outline:'none' },
  btnPrimary:{ background:'var(--orange)', color:'#fff', border:'none', borderRadius:'8px', padding:'10px 24px', fontWeight:700, cursor:'pointer', fontSize:'0.95rem' },
  btnGhost:  { background:'var(--cream)', color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 16px', cursor:'pointer', fontSize:'0.88rem' },
  btnDanger: { background:'#3a1a1a', color:'#f87171', border:'1px solid #5a2020', borderRadius:'8px', padding:'8px 16px', cursor:'pointer', fontSize:'0.88rem' },
  label:     { fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:'4px', display:'block' },
  divider:   { border:'none', borderTop:'1px solid var(--border-soft)', margin:'20px 0' },
  info:      { background:'#EBF8FF', border:'1px solid #BEE3F8', borderRadius:'8px', padding:'12px 16px', color:'#2C5282', fontSize:'0.88rem', marginBottom:'12px' },
  success:   { background:'#F0FFF4', border:'1px solid #9AE6B4', borderRadius:'8px', padding:'10px 14px', color:'#276749', fontSize:'0.88rem', marginBottom:'12px' },
  warning:   { background:'#352a10', border:'1px solid #FAD776', borderRadius:'8px', padding:'10px 14px', color:'#7B341E', fontSize:'0.88rem', marginBottom:'12px' },
  error:     { background:'#351a1a', border:'1px solid #552020', borderRadius:'8px', padding:'10px 14px', color:'#f87171', fontSize:'0.88rem', marginBottom:'12px' },
  table:     { width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' },
  th:        { background:'var(--cream)', color:'var(--text-muted)', padding:'8px 10px', textAlign:'left', borderBottom:'1px solid var(--border-soft)', fontWeight:600, whiteSpace:'nowrap' },
  td:        { padding:'7px 10px', borderBottom:'1px solid #1a1e26', color:'var(--text-primary)' },
  metric:    { background:'#fff', borderRadius:'10px', padding:'14px 18px', border:'1px solid var(--border-soft)', textAlign:'center' },
  metricVal: { fontSize:'1.3rem', fontWeight:700, color:'var(--orange)' },
  metricLbl: { fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'4px' },
  grid3:     { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'16px', marginBottom:'16px' },
  grid4:     { display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:'12px', marginBottom:'16px' },
  grid2:     { display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'16px', marginBottom:'16px' },
};

// ── Constantes ────────────────────────────────────────────────────────────
const CONTENEDORES = {
  "20' Estándar":  { vol_max:25.0,  peso_max:21.7 },
  "40' Estándar":  { vol_max:57.0,  peso_max:26.5 },
  "40' High Cube": { vol_max:67.0,  peso_max:26.5 },
  "45' High Cube": { vol_max:78.0,  peso_max:27.6 },
  "Personalizado": { vol_max:null,  peso_max:null },
};

const METODOS = {
  "⚖️ Por peso (kg)":          "peso",
  "📦 Por volumen (m³)":       "volumen",
  "💵 Por valor FOB":           "fob",
  "🔢 Por unidades":            "unidades",
  "✏️ Manual (% por producto)": "manual",
};

const AYUDAS = {
  peso:     "💡 El flete se distribuye según el peso total de cada línea. Ideal cuando el contenedor se llena por tonelaje.",
  volumen:  "💡 El flete se distribuye según el m³ total de cada línea. Ideal cuando el contenedor se llena por espacio.",
  fob:      "💡 Los productos más caros absorben más flete. Útil para proteger el margen en productos baratos.",
  unidades: "💡 Cada unidad paga la misma parte del flete, sin importar peso ni tamaño.",
  manual:   "💡 Vos asignás qué % del flete absorbe cada línea. Control total sobre la estrategia de costos.",
};

// ── Lógica de cálculo CIF ─────────────────────────────────────────────────
function calcularCIF(filas, costos, tipoCambio, metodo) {
  const rows = filas.map(f => ({
    ...f,
    cantidad:    parseFloat(f.cantidad)   || 0,
    peso_kg:     parseFloat(f.peso_kg)    || 0,
    volumen_m3:  parseFloat(f.volumen_m3) || 0,
    FOB_unitario:parseFloat(f.FOB_unitario)||0,
    margen_pct:  parseFloat(f.margen_pct) || 0,
    prorrateo_manual_pct: parseFloat(f.prorrateo_manual_pct)||0,
  }));

  rows.forEach(r => {
    r.FOB_total  = r.FOB_unitario * r.cantidad;
    r.peso_total = r.peso_kg      * r.cantidad;
    r.vol_total  = r.volumen_m3   * r.cantidad;
  });

  // Calcular proporción de flete
  let totalBase = 0;
  if (metodo === 'peso')     totalBase = rows.reduce((s,r)=>s+r.peso_total,0);
  if (metodo === 'volumen')  totalBase = rows.reduce((s,r)=>s+r.vol_total,0);
  if (metodo === 'fob')      totalBase = rows.reduce((s,r)=>s+r.FOB_total,0);
  if (metodo === 'unidades') totalBase = rows.reduce((s,r)=>s+r.cantidad,0);
  if (metodo === 'manual') {
    const totalPct = rows.reduce((s,r)=>s+r.prorrateo_manual_pct,0);
    rows.forEach(r => r.prop_flete = totalPct > 0 ? r.prorrateo_manual_pct/totalPct : 1/rows.length);
  } else {
    rows.forEach(r => {
      const base = metodo==='peso'?r.peso_total : metodo==='volumen'?r.vol_total : metodo==='fob'?r.FOB_total : r.cantidad;
      r.prop_flete = totalBase > 0 ? base/totalBase : 1/rows.length;
    });
  }

  rows.forEach(r => {
    r.flete_asignado  = costos.flete   * r.prop_flete;
    r.seguro_asignado = costos.seguro  * r.prop_flete;
    r.peajes_asignado = costos.peajes  * r.prop_flete;
    r.otros_asignado  = costos.otros   * r.prop_flete;

    r.CIF_previo   = r.FOB_total + r.flete_asignado + r.seguro_asignado;
    r.DAI_asignado = r.CIF_previo * (costos.dai_pct / 100);
    r.base_iva     = r.CIF_previo + r.DAI_asignado + r.peajes_asignado + r.otros_asignado;
    r.IVA_asignado = r.base_iva * (costos.iva_pct / 100);

    r.costo_aterrizado_total  = r.base_iva + r.IVA_asignado;
    r.costo_CIF_unitario_USD  = r.cantidad > 0 ? r.costo_aterrizado_total / r.cantidad : 0;
    r.costo_CIF_unitario_CRC  = r.costo_CIF_unitario_USD * tipoCambio;
    r.precio_venta_USD        = r.costo_CIF_unitario_USD * (1 + r.margen_pct/100);
    r.precio_venta_CRC        = r.precio_venta_USD * tipoCambio;
  });

  return rows;
}

// ── Medidor de contenedor ─────────────────────────────────────────────────
function Medidor({ filas, volMax, pesoMax }) {
  const volUsado  = filas.reduce((s,f)=>(s + (parseFloat(f.volumen_m3)||0)*(parseFloat(f.cantidad)||0)),0);
  const pesoUsado = filas.reduce((s,f)=>(s + (parseFloat(f.peso_kg)||0)*(parseFloat(f.cantidad)||0)),0)/1000;

  const BarraProgreso = ({ usado, max, label, unidad }) => {
    if (!max || max <= 0) return (
      <div style={{ marginBottom:'12px' }}>
        <div style={{ fontWeight:600, color:'var(--text-primary)', marginBottom:'6px' }}>{label}</div>
        <div style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>{usado.toFixed(2)} {unidad} (sin límite)</div>
      </div>
    );
    const pct = Math.min(usado/max, 1.0);
    const color = pct < 0.85 ? '#4ade80' : pct < 1.0 ? '#fbbf24' : '#f87171';
    const emoji = pct < 0.85 ? '🟢' : pct < 1.0 ? '🟡' : '🔴';
    return (
      <div style={{ marginBottom:'16px' }}>
        <div style={{ fontWeight:600, color:'var(--text-primary)', marginBottom:'6px' }}>{emoji} {label}</div>
        <div style={{ background:'var(--cream)', borderRadius:'8px', height:'12px', overflow:'hidden', marginBottom:'6px' }}>
          <div style={{ width:`${pct*100}%`, height:'100%', background:color, borderRadius:'8px', transition:'width .3s' }}/>
        </div>
        <div style={{ fontSize:'0.8rem', color:'var(--text-muted)' }}>
          {usado.toFixed(2)} {unidad} de {max} {unidad} → <strong style={{ color:'var(--text-primary)' }}>{(pct*100).toFixed(1)}%</strong>
          &nbsp;· Disponible: <strong style={{ color:'var(--text-primary)' }}>{Math.max(max-usado,0).toFixed(2)} {unidad}</strong>
        </div>
        {pct >= 1.0 && <div style={S.error}>🔴 ¡Excedés el límite del contenedor!</div>}
        {pct >= 0.85 && pct < 1.0 && <div style={S.warning}>🟡 Estás casi en el límite.</div>}
      </div>
    );
  };

  const factorLimitante = volMax && pesoMax && volMax>0 && pesoMax>0 ? (() => {
    const pv = volUsado/volMax, pp = pesoUsado/pesoMax;
    if (pv > pp) return `📌 El volumen es tu factor limitante (${(pv*100).toFixed(1)}%). Usá método Por volumen.`;
    if (pp > pv) return `📌 El peso es tu factor limitante (${(pp*100).toFixed(1)}%). Usá método Por peso.`;
    return null;
  })() : null;

  return (
    <div style={S.card}>
      <h4 style={{ color:'var(--orange)', marginTop:0 }}>🌡️ ¿Qué tan llena está el Arca?</h4>
      <div style={S.grid2}>
        <BarraProgreso usado={volUsado}  max={volMax}  label="Volumen del contenedor" unidad="m³"/>
        <BarraProgreso usado={pesoUsado} max={pesoMax} label="Peso de la carga"       unidad="t"/>
      </div>
      {factorLimitante && <div style={S.info}>{factorLimitante}</div>}
    </div>
  );
}

// ── Fila de producto ──────────────────────────────────────────────────────
const FILA_BASE = { descripcion:'', codigo:'', cantidad:1, peso_kg:0, volumen_m3:0, FOB_unitario:0, margen_pct:30, prorrateo_manual_pct:0 };

function FilaProducto({ fila, idx, esManual, onChange, onEliminar }) {
  const upd = (k, v) => onChange(idx, { ...fila, [k]: v });
  const inp = (k, tipo='text', step=1, dec=2) => (
    <input style={{ ...S.input, padding:'5px 8px' }}
      type={tipo} step={step} min={tipo==='number'?0:undefined}
      value={fila[k]}
      onChange={e=> upd(k, tipo==='number' ? e.target.value : e.target.value)}/>
  );
  return (
    <tr>
      <td style={S.td}>{inp('descripcion')}</td>
      <td style={S.td}>{inp('codigo')}</td>
      <td style={S.td}>{inp('cantidad','number',1)}</td>
      <td style={S.td}>{inp('peso_kg','number',0.1)}</td>
      <td style={S.td}>{inp('volumen_m3','number',0.001)}</td>
      <td style={S.td}>{inp('FOB_unitario','number',0.01)}</td>
      <td style={S.td}>{inp('margen_pct','number',1)}</td>
      {esManual && <td style={S.td}>{inp('prorrateo_manual_pct','number',1)}</td>}
      <td style={S.td}>
        <button style={{ background:'transparent', border:'none', cursor:'pointer', color:'#f87171', fontSize:'1rem' }} onClick={()=>onEliminar(idx)}>🗑️</button>
      </td>
    </tr>
  );
}

// ── Tab Calculadora ───────────────────────────────────────────────────────
function TabCalculadora() {
  const [nombreImp, setNombreImp]   = useState('');
  const [tipoCambio, setTipoCambio] = useState(520);
  const [tcFuente, setTcFuente] = useState('');

  // Autocargar TC BAC al montar
  useEffect(() => {
    fetch('/api/mercado?fuente=bac')
      .then(r => r.json())
      .then(j => {
        if (j.ok && j.data?.compra) {
          setTipoCambio(Math.round(j.data.compra * 100) / 100);
          setTcFuente(j.data.fuente || 'BAC San José');
        }
      })
      .catch(() => {});
  }, []);

  const [metodoClave2, setMetodoClave2] = useState('⚖️ Por peso (kg)');
  const metodo = METODOS[metodoClave2];

  const [flete,   setFlete]   = useState(0);
  const [seguro,  setSeguro]  = useState(0);
  const [peajes,  setPeajes]  = useState(0);
  const [daiPct,  setDaiPct]  = useState(0);
  const [ivaPct,  setIvaPct]  = useState(13);
  const [otros,   setOtros]   = useState(0);

  const [tipoCont, setTipoCont] = useState("40' High Cube");
  const [volMaxCustom,  setVolMaxCustom]  = useState(67);
  const [pesoMaxCustom, setPesoMaxCustom] = useState(26.5);

  const specs   = CONTENEDORES[tipoCont];
  const volMax  = tipoCont === 'Personalizado' ? volMaxCustom  : specs.vol_max;
  const pesoMax = tipoCont === 'Personalizado' ? pesoMaxCustom : specs.peso_max;

  const [filas, setFilas] = useState([{ ...FILA_BASE }]);
  const [resultado, setResultado] = useState(null);
  const [msg, setMsg] = useState(null);
  const [guardando, setGuardando] = useState(false);

  const updFila   = (idx, fila) => setFilas(prev => prev.map((f,i)=>i===idx?fila:f));
  const delFila   = (idx)       => setFilas(prev => prev.filter((_,i)=>i!==idx));
  const addFila   = ()          => setFilas(prev => [...prev, { ...FILA_BASE }]);

  const costos = { flete, seguro, dai_pct:daiPct, peajes, iva_pct:ivaPct, otros };

  const calcular = () => {
    if (!filas.length) { setMsg({ tipo:'warning', txt:'⚠️ El Arca no puede zarpar vacía, pueblo.' }); return; }
    if (!nombreImp.trim()) { setMsg({ tipo:'warning', txt:'⚠️ Esta importación necesita un nombre.' }); return; }
    const r = calcularCIF(filas, costos, tipoCambio, metodo);
    setResultado(r);
    setMsg(null);
  };

  const guardarHistorial = async () => {
    if (!resultado) return;
    setGuardando(true);
    const fobTotal   = resultado.reduce((s,r)=>s+r.FOB_total,0);
    const costoTotal = resultado.reduce((s,r)=>s+r.costo_aterrizado_total,0);
    const volTotal   = resultado.reduce((s,r)=>s+r.vol_total,0);
    const pesoTotalT = resultado.reduce((s,r)=>s+r.peso_total,0)/1000;
    const now = new Date();
    const fecha = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const { error } = await supabase.from('halley_historial').insert({
      nombre: nombreImp.trim(),
      fecha,
      metodo: metodoClave2,
      contenedor: tipoCont,
      vol_total:       parseFloat(volTotal.toFixed(3)),
      peso_total_t:    parseFloat(pesoTotalT.toFixed(3)),
      fob_total:       parseFloat(fobTotal.toFixed(2)),
      costo_total_usd: parseFloat(costoTotal.toFixed(2)),
      costo_total_crc: Math.round(costoTotal * tipoCambio),
      tipo_cambio:     tipoCambio,
      n_productos:     resultado.length,
      costos,
      productos: resultado.map(r=>({
        descripcion:r.descripcion, codigo:r.codigo, cantidad:r.cantidad,
        peso_kg:r.peso_kg, volumen_m3:r.volumen_m3,
        FOB_unitario:r.FOB_unitario, margen_pct:r.margen_pct,
        costo_CIF_unitario_USD: parseFloat(r.costo_CIF_unitario_USD.toFixed(4)),
        costo_CIF_unitario_CRC: parseFloat(r.costo_CIF_unitario_CRC.toFixed(2)),
        precio_venta_USD:       parseFloat(r.precio_venta_USD.toFixed(4)),
        precio_venta_CRC:       parseFloat(r.precio_venta_CRC.toFixed(2)),
      })),
    });
    setGuardando(false);
    if (error) setMsg({ tipo:'error', txt:`❌ Error: ${error.message}` });
    else setMsg({ tipo:'success', txt:'✅ Importación inscrita en el historial para la eternidad.' });
  };

  const exportarCSV = () => {
    if (!resultado) return;
    const cols = ['descripcion','codigo','cantidad','peso_kg','volumen_m3','FOB_unitario','FOB_total','margen_pct','costo_CIF_unitario_USD','costo_CIF_unitario_CRC','precio_venta_USD','precio_venta_CRC'];
    const header = cols.join(',');
    const rows = resultado.map(r=>cols.map(c=>`"${String(r[c]||'').replace(/"/g,'""')}"`).join(','));
    const csv = [header,...rows].join('\n');
    const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href=url;
    a.download=`Halley_${nombreImp}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  const totalPctManual = filas.reduce((s,f)=>s+(parseFloat(f.prorrateo_manual_pct)||0),0);
  const fobTotal   = resultado ? resultado.reduce((s,r)=>s+r.FOB_total,0) : 0;
  const costoTotal = resultado ? resultado.reduce((s,r)=>s+r.costo_aterrizado_total,0) : 0;

  return (
    <div>
      {/* Parámetros generales */}
      <div style={S.card}>
        <h4 style={{ color:'var(--orange)', marginTop:0 }}>⚙️ Las Condiciones de la Travesía</h4>
        <div style={S.grid3}>
          <div>
            <label style={S.label}>Nombre de la importación</label>
            <input style={S.input} placeholder="Ej: Contenedor Marzo 2025" value={nombreImp} onChange={e=>setNombreImp(e.target.value)}/>
            <div style={{ marginTop:'10px' }}>
              <label style={S.label}>Tipo de cambio (₡ por USD) — Compra BAC</label>
              <input style={S.input} type="number" step="1" value={tipoCambio} onChange={e=>setTipoCambio(parseFloat(e.target.value)||0)}/>
              {tcFuente&&<div style={{fontSize:'0.72rem',color:'#4ec9b0',marginTop:'4px'}}>✓ Autocargado desde {tcFuente}</div>}
            </div>
            <div style={{ marginTop:'10px' }}>
              <label style={S.label}>Método de prorrateo del flete</label>
              <select style={S.select} value={metodoClave2} onChange={e=>setMetodoClave2(e.target.value)}>
                {Object.keys(METODOS).map(m=><option key={m}>{m}</option>)}
              </select>
              <div style={{ fontSize:'0.78rem', color:'var(--text-muted)', marginTop:'6px' }}>{AYUDAS[metodo]}</div>
            </div>
          </div>
          <div>
            {[
              ['Flete marítimo (USD)', flete, setFlete, 50],
              ['Seguro (USD)',         seguro, setSeguro, 10],
              ['Peajes / descarga (USD)', peajes, setPeajes, 10],
            ].map(([lbl,val,set,step])=>(
              <div key={lbl} style={{ marginBottom:'10px' }}>
                <label style={S.label}>{lbl}</label>
                <input style={S.input} type="number" step={step} min="0" value={val} onChange={e=>set(parseFloat(e.target.value)||0)}/>
              </div>
            ))}
          </div>
          <div>
            {[
              ['DAI – Impuesto aduanero (%)', daiPct, setDaiPct, 0.5],
              ['IVA al importar (%)',         ivaPct, setIvaPct, 0.5],
              ['Otros cargos locales (USD)',  otros,  setOtros,  10],
            ].map(([lbl,val,set,step])=>(
              <div key={lbl} style={{ marginBottom:'10px' }}>
                <label style={S.label}>{lbl}</label>
                <input style={S.input} type="number" step={step} min="0" value={val} onChange={e=>set(parseFloat(e.target.value)||0)}/>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tipo de contenedor */}
      <div style={S.card}>
        <h4 style={{ color:'var(--orange)', marginTop:0 }}>🚢 El Arca — Capacidad del Contenedor</h4>
        <div style={S.grid3}>
          <div>
            <label style={S.label}>Tipo de contenedor</label>
            <select style={S.select} value={tipoCont} onChange={e=>setTipoCont(e.target.value)}>
              {Object.keys(CONTENEDORES).map(c=><option key={c}>{c}</option>)}
            </select>
          </div>
          {tipoCont === 'Personalizado' ? <>
            <div>
              <label style={S.label}>Volumen máximo (m³)</label>
              <input style={S.input} type="number" step="0.5" value={volMaxCustom} onChange={e=>setVolMaxCustom(parseFloat(e.target.value)||0)}/>
            </div>
            <div>
              <label style={S.label}>Peso máximo carga (toneladas)</label>
              <input style={S.input} type="number" step="0.1" value={pesoMaxCustom} onChange={e=>setPesoMaxCustom(parseFloat(e.target.value)||0)}/>
            </div>
          </> : <>
            <div style={S.metric}><div style={S.metricVal}>{volMax} m³</div><div style={S.metricLbl}>Volumen máximo</div></div>
            <div style={S.metric}><div style={S.metricVal}>{pesoMax} t</div><div style={S.metricLbl}>Peso máximo</div></div>
          </>}
        </div>
      </div>

      {/* Tabla de productos */}
      <div style={S.card}>
        <h4 style={{ color:'var(--orange)', marginTop:0 }}>📦 Resumen del Contenedor</h4>
        <div style={{ overflowX:'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                {['Descripción','Código','Cant.','Peso kg/u','Vol m³/u','FOB Unit. $','Margen %',
                  ...(metodo==='manual'?['% Flete']:[]),''].map(h=><th key={h} style={S.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {filas.map((f,i)=>(
                <FilaProducto key={i} fila={f} idx={i} esManual={metodo==='manual'} onChange={updFila} onEliminar={delFila}/>
              ))}
            </tbody>
          </table>
        </div>
        {metodo==='manual' && (
          <div style={{ fontSize:'0.82rem', color: Math.abs(totalPctManual-100)<0.01?'#4ade80':'#f87171', marginTop:'8px' }}>
            {Math.abs(totalPctManual-100)<0.01?'🟢':'🔴'} Porcentajes manuales: <strong>{totalPctManual.toFixed(1)}%</strong> (deben sumar 100%)
          </div>
        )}
        <button style={{ ...S.btnGhost, marginTop:'12px' }} onClick={addFila}>➕ Agregar producto</button>
      </div>

      {/* Medidor */}
      {filas.length > 0 && <Medidor filas={filas} volMax={volMax} pesoMax={pesoMax}/>}

      {/* Botón calcular */}
      {msg && <div style={msg.tipo==='warning'?S.warning:msg.tipo==='error'?S.error:S.success}>{msg.txt}</div>}
      <button style={{ ...S.btnPrimary, width:'100%', padding:'14px', fontSize:'1rem', marginBottom:'20px' }} onClick={calcular}>
        🧮 Calcular CIF
      </button>

      {/* Resultados */}
      {resultado && (
        <div>
          <hr style={S.divider}/>
          <h3 style={{ color:'var(--text-primary)' }}>📊 La Revelación — Costos Aterrizados</h3>
          <div style={{ fontSize:'0.83rem', color:'var(--text-muted)', marginBottom:'16px' }}>
            Método: <strong style={{ color:'var(--text-primary)' }}>{metodoClave2}</strong> · Contenedor: <strong style={{ color:'var(--text-primary)' }}>{tipoCont}</strong>
          </div>

          <div style={S.grid4}>
            {[
              ['FOB Total',             `$${fobTotal.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}`],
              ['Costo aterrizado (USD)', `$${costoTotal.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}`],
              ['Costo aterrizado (₡)',  `₡${(costoTotal*tipoCambio).toLocaleString('es-CR',{maximumFractionDigits:0})}`],
              ['Incremento vs FOB',     fobTotal>0?`${((costoTotal/fobTotal-1)*100).toFixed(1)}%`:'—'],
            ].map(([l,v])=>(
              <div key={l} style={S.metric}>
                <div style={S.metricVal}>{v}</div>
                <div style={S.metricLbl}>{l}</div>
              </div>
            ))}
          </div>

          <div style={{ overflowX:'auto', borderRadius:'10px', border:'1px solid var(--border-soft)', marginBottom:'16px' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Descripción','Código','Cant.','FOB Unit.$','FOB Total$','Margen%','CIF Unit.$','CIF Unit.₡','P.Venta$','P.Venta₡'].map(h=>(
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {resultado.map((r,i)=>(
                  <tr key={i} style={{ background: i%2===0?'#0f1115':'#161920' }}>
                    <td style={S.td}>{r.descripcion||'—'}</td>
                    <td style={S.td}>{r.codigo||'—'}</td>
                    <td style={S.td}>{r.cantidad}</td>
                    <td style={S.td}>${parseFloat(r.FOB_unitario).toFixed(2)}</td>
                    <td style={S.td}>${r.FOB_total.toFixed(2)}</td>
                    <td style={S.td}>{r.margen_pct}%</td>
                    <td style={S.td} style={{ ...S.td, color:'var(--orange)', fontWeight:600 }}>${r.costo_CIF_unitario_USD.toFixed(4)}</td>
                    <td style={S.td}>₡{r.costo_CIF_unitario_CRC.toFixed(2)}</td>
                    <td style={S.td} style={{ ...S.td, color:'#276749' }}>${r.precio_venta_USD.toFixed(4)}</td>
                    <td style={S.td}>₡{r.precio_venta_CRC.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Desglose */}
          <details style={{ ...S.card, marginBottom:'16px' }}>
            <summary style={{ cursor:'pointer', color:'var(--orange)', fontWeight:600 }}>🔍 El Desglose de las Plagas — Todos los Costos</summary>
            <table style={{ ...S.table, marginTop:'12px' }}>
              <thead><tr><th style={S.th}>Concepto</th><th style={S.th}>USD</th><th style={S.th}>₡ colones</th></tr></thead>
              <tbody>
                {[
                  ['FOB Total',       resultado.reduce((s,r)=>s+r.FOB_total,0)],
                  ['Flete',           resultado.reduce((s,r)=>s+r.flete_asignado,0)],
                  ['Seguro',          resultado.reduce((s,r)=>s+r.seguro_asignado,0)],
                  ['DAI',             resultado.reduce((s,r)=>s+r.DAI_asignado,0)],
                  ['Peajes/descarga', resultado.reduce((s,r)=>s+r.peajes_asignado,0)],
                  ['Otros',           resultado.reduce((s,r)=>s+r.otros_asignado,0)],
                  ['IVA',             resultado.reduce((s,r)=>s+r.IVA_asignado,0)],
                ].map(([c,v])=>(
                  <tr key={c}><td style={S.td}>{c}</td><td style={S.td}>${v.toFixed(2)}</td><td style={S.td}>₡{(v*tipoCambio).toFixed(0)}</td></tr>
                ))}
                <tr style={{ background:'var(--cream)', fontWeight:700 }}>
                  <td style={S.td}>TOTAL ATERRIZADO</td>
                  <td style={{ ...S.td, color:'var(--orange)' }}>${costoTotal.toFixed(2)}</td>
                  <td style={{ ...S.td, color:'var(--orange)' }}>₡{(costoTotal*tipoCambio).toFixed(0)}</td>
                </tr>
              </tbody>
            </table>
          </details>

          <div style={S.grid2}>
            <button style={S.btnGhost} onClick={exportarCSV}>📥 Exportar CSV</button>
            <button style={S.btnPrimary} onClick={guardarHistorial} disabled={guardando}>
              {guardando ? 'Guardando...' : '💾 Guardar en historial'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tab Historial ─────────────────────────────────────────────────────────
function TabHistorial() {
  const [hist, setHist]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel]         = useState('');

  const cargar = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('halley_historial').select('*').order('creado_en', { ascending:false });
    setHist(data||[]);
    setLoading(false);
  }, []);

  useState(()=>{ cargar(); }, []);

  const selReg = sel ? hist.find(h=>`${h.nombre} (${h.fecha})` === sel) : null;

  return (
    <div>
      <h3 style={{ color:'var(--text-primary)', marginTop:0 }}>📁 Historial</h3>
      {loading ? <div style={{ color:'var(--text-muted)' }}>Cargando...</div>
      : hist.length===0
        ? <div style={S.info}>📜 Sin historial. Aún no se ha registrado ninguna importación.</div>
        : <>
          <div style={{ overflowX:'auto', borderRadius:'10px', border:'1px solid var(--border-soft)', marginBottom:'20px' }}>
            <table style={S.table}>
              <thead>
                <tr>{['Nombre','Fecha','Contenedor','Método','Vol m³','Peso t','Productos','FOB Total $','Costo $','Costo ₡'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {hist.map((h,i)=>(
                  <tr key={i} style={{ background:i%2===0?'#ffffff':'#fdf8f8' }}>
                    <td style={{ ...S.td, color:'var(--orange)', fontWeight:600 }}>{h.nombre}</td>
                    <td style={S.td}>{h.fecha}</td>
                    <td style={S.td}>{h.contenedor||'—'}</td>
                    <td style={S.td}>{h.metodo||'—'}</td>
                    <td style={S.td}>{h.vol_total||'—'}</td>
                    <td style={S.td}>{h.peso_total_t||'—'}</td>
                    <td style={S.td}>{h.n_productos}</td>
                    <td style={S.td}>${parseFloat(h.fob_total||0).toFixed(2)}</td>
                    <td style={S.td}>${parseFloat(h.costo_total_usd||0).toFixed(2)}</td>
                    <td style={S.td}>₡{parseInt(h.costo_total_crc||0).toLocaleString('es-CR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginBottom:'16px' }}>
            <label style={S.label}>Ver detalle de una importación</label>
            <select style={S.select} value={sel} onChange={e=>setSel(e.target.value)}>
              <option value="">— Seleccioná —</option>
              {hist.map(h=><option key={h.id}>{h.nombre} ({h.fecha})</option>)}
            </select>
          </div>

          {selReg && selReg.productos && (
            <div style={S.card}>
              <div style={{ marginBottom:'12px', color:'var(--text-primary)' }}>
                <strong>{selReg.nombre}</strong> · {selReg.fecha} · {selReg.metodo} · {selReg.contenedor}
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={S.table}>
                  <thead>
                    <tr>{['Descripción','Código','Cant.','Peso kg','Vol m³','FOB Unit.$','Margen%','CIF Unit.$','CIF Unit.₡','P.Venta$','P.Venta₡'].map(h=><th key={h} style={S.th}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {selReg.productos.map((p,i)=>(
                      <tr key={i} style={{ background:i%2===0?'#ffffff':'#fdf8f8' }}>
                        <td style={S.td}>{p.descripcion||'—'}</td>
                        <td style={S.td}>{p.codigo||'—'}</td>
                        <td style={S.td}>{p.cantidad}</td>
                        <td style={S.td}>{p.peso_kg}</td>
                        <td style={S.td}>{p.volumen_m3}</td>
                        <td style={S.td}>${p.FOB_unitario}</td>
                        <td style={S.td}>{p.margen_pct}%</td>
                        <td style={{ ...S.td, color:'var(--orange)' }}>${parseFloat(p.costo_CIF_unitario_USD||0).toFixed(4)}</td>
                        <td style={S.td}>₡{parseFloat(p.costo_CIF_unitario_CRC||0).toFixed(2)}</td>
                        <td style={{ ...S.td, color:'#276749' }}>${parseFloat(p.precio_venta_USD||0).toFixed(4)}</td>
                        <td style={S.td}>₡{parseFloat(p.precio_venta_CRC||0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      }
    </div>
  );
}

// ── Vista principal ───────────────────────────────────────────────────────
export default function HalleyCIF() {
  const [tab, setTab] = useState(0);
  const now = new Date();
  const fecha = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

  return (
    <div style={S.page}>
      <h1 style={S.title}>💫 Halley – Calculadora CIF</h1>
      <div style={S.caption}>
        💫 Módulo de cálculo · Última sesión: {fecha}<br/>
        <span style={{ color:'var(--text-muted)' }}>Porque de Egipto a Costa Rica, todo tiene un costo. · Génesis Suite</span>
      </div>

      <div style={S.tabs}>
        {['🧮 Calculadora','📁 Historial'].map((t,i)=>(
          <button key={i} style={{ ...S.tab, ...(tab===i?S.tabActive:{}) }} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {tab===0 && <TabCalculadora/>}
      {tab===1 && <TabHistorial/>}
    </div>
  );
}
