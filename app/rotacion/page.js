'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

const S = {
  page:      { background:'var(--cream)', minHeight:'100vh', padding:'28px 32px', fontFamily:'Rubik, sans-serif', color:'var(--text-primary)' },
  kicker:    { color:'var(--orange)', fontSize:'0.78rem', fontWeight:600, letterSpacing:'0.10em', textTransform:'uppercase', marginBottom:'6px' },
  title:     { fontSize:'1.7rem', fontWeight:700, color:'var(--text-primary)', margin:0 },
  caption:   { fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'4px', marginBottom:'28px' },
  card:      { background:'#fff', borderRadius:'12px', padding:'20px 24px', marginBottom:'16px', border:'1px solid var(--border-soft)', boxShadow:'var(--card-shadow)' },
  grid3:     { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'14px', marginBottom:'24px' },
  kpiCard:   { background:'#fff', borderRadius:'12px', padding:'18px 20px', border:'1px solid var(--border-soft)', boxShadow:'var(--card-shadow)' },
  kpiVal:    { fontSize:'1.6rem', fontWeight:700, color:'var(--text-primary)', margin:'6px 0 2px' },
  kpiLabel:  { fontSize:'0.78rem', color:'var(--text-muted)', fontWeight:500 },
  tabs:      { display:'flex', gap:'8px', marginBottom:'24px', borderBottom:'1px solid var(--border-soft)', paddingBottom:'0' },
  tab:       { padding:'8px 18px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer', fontSize:'0.9rem', fontWeight:500, background:'transparent', color:'var(--text-muted)', marginBottom:'-1px' },
  tabActive: { background:'var(--cream)', color:'var(--orange)', borderBottom:'2px solid var(--orange)' },
  table:     { width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' },
  th:        { background:'var(--cream)', color:'var(--text-muted)', padding:'9px 12px', textAlign:'left', borderBottom:'1px solid var(--border-soft)', fontWeight:600, whiteSpace:'nowrap', position:'sticky', top:0, zIndex:1 },
  td:        { padding:'8px 12px', borderBottom:'1px solid var(--border-soft)', color:'var(--text-primary)', whiteSpace:'nowrap' },
  badge:     (color, bg) => ({ display:'inline-block', padding:'2px 10px', borderRadius:'99px', fontSize:'0.72rem', fontWeight:600, color, background:bg }),
  input:     { background:'var(--cream)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-primary)', padding:'8px 12px', fontSize:'0.9rem', outline:'none', boxSizing:'border-box' },
  btnPrimary:{ background:'var(--orange)', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 20px', fontWeight:700, cursor:'pointer', fontSize:'0.9rem' },
  empty:     { background:'#fff', borderRadius:'12px', padding:'48px 24px', textAlign:'center', border:'1px dashed var(--border)', color:'var(--text-muted)' },
};

function semaforo(existencias, minimo, maximo, promedioMensual) {
  const e = parseFloat(existencias) || 0;
  const min = parseFloat(minimo) || 0;
  const max = parseFloat(maximo) || 0;
  const prom = parseFloat(promedioMensual) || 0;

  if (e <= 0) return { label:'Sin stock', color:'#C53030', bg:'#FFF5F5', prioridad:0 };
  if (e < min) return { label:'Bajo mínimo', color:'#C05621', bg:'#FFFAF0', prioridad:1 };
  if (max > 0 && e > max * 1.5) return { label:'Sobrestock', color:'#276749', bg:'#F0FFF4', prioridad:4 };
  if (prom > 0 && e > prom * 6) return { label:'Baja rotación', color:'#553C9A', bg:'#FAF5FF', prioridad:3 };
  return { label:'Normal', color:'#2C5282', bg:'#EBF8FF', prioridad:2 };
}

function calcDiasStock(existencias, promedioMensual) {
  const e = parseFloat(existencias) || 0;
  const pm = parseFloat(promedioMensual) || 0;
  if (pm <= 0) return null;
  return Math.round((e / pm) * 30);
}

export default function RotacionPage() {
  const [tab, setTab] = useState(0);
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [buscar, setBuscar] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [ultimaActualizacion, setUltimaActualizacion] = useState('');

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      // Cargar desde neo_minimos_maximos — última carga disponible
      const { data: latest } = await supabase
        .from('neo_minimos_maximos')
        .select('fecha_carga')
        .order('fecha_carga', { ascending: false })
        .limit(1);

      if (!latest?.length) { setCargando(false); return; }
      const fc = latest[0].fecha_carga;
      setUltimaActualizacion(fc);

      let todos = [], offset = 0;
      while (true) {
        const { data } = await supabase
          .from('neo_minimos_maximos')
          .select('*')
          .eq('fecha_carga', fc)
          .eq('activo', 'Activo')
          .range(offset, offset + 999);
        if (!data?.length) break;
        todos = [...todos, ...data];
        if (data.length < 1000) break;
        offset += 1000;
      }
      setItems(todos);
    } catch(e) { console.error(e); }
    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Enriquecer con semáforo
  const itemsEnriq = items.map(it => ({
    ...it,
    _sem: semaforo(it.existencias, it.minimo, it.maximo, it.promedio_mensual),
    _dias: calcDiasStock(it.existencias, it.promedio_mensual),
  }));

  // KPIs
  const sinStock    = itemsEnriq.filter(i => i._sem.prioridad === 0).length;
  const bajoMinimo  = itemsEnriq.filter(i => i._sem.prioridad === 1).length;
  const sobrestock  = itemsEnriq.filter(i => i._sem.prioridad === 4).length;
  const bajaRot     = itemsEnriq.filter(i => i._sem.prioridad === 3).length;

  // Filtrar
  const filtrados = itemsEnriq
    .filter(i => {
      if (filtroEstado === 'todos') return true;
      if (filtroEstado === 'sin_stock')   return i._sem.prioridad === 0;
      if (filtroEstado === 'bajo_minimo') return i._sem.prioridad === 1;
      if (filtroEstado === 'baja_rot')    return i._sem.prioridad === 3;
      if (filtroEstado === 'sobrestock')  return i._sem.prioridad === 4;
      return true;
    })
    .filter(i => {
      if (!buscar) return true;
      const q = buscar.toLowerCase();
      return [i.nombre, i.codigo, i.categoria, i.marca, i.ultimo_proveedor]
        .some(v => String(v||'').toLowerCase().includes(q));
    })
    .sort((a, b) => a._sem.prioridad - b._sem.prioridad);

  // Tab: Para pedir (bajo mínimo + sin stock)
  const paraPedir = itemsEnriq
    .filter(i => i._sem.prioridad <= 1)
    .map(i => ({
      ...i,
      _pedirCant: Math.max(0, (parseFloat(i.maximo)||0) - (parseFloat(i.existencias)||0)),
    }))
    .filter(i => i._pedirCant > 0)
    .sort((a, b) => a._sem.prioridad - b._sem.prioridad);

  // Tab: Para liquidar (sobrestock + baja rotación)
  const paraLiquidar = itemsEnriq
    .filter(i => i._sem.prioridad >= 3)
    .sort((a, b) => (b._dias||0) - (a._dias||0));

  const fmtDate = (iso) => {
    if (!iso) return '—';
    try { return new Intl.DateTimeFormat('es-CR',{day:'2-digit',month:'2-digit',year:'numeric',timeZone:'America/Costa_Rica'}).format(new Date(iso)); }
    catch { return iso?.slice(0,10)||'—'; }
  };

  if (cargando) return (
    <div style={S.page}>
      <div style={S.kicker}>Inventario</div>
      <h1 style={S.title}>🔄 Rotación de productos</h1>
      <p style={{color:'var(--text-muted)', marginTop:8}}>⏳ Cargando datos de inventario...</p>
    </div>
  );

  if (!items.length) return (
    <div style={S.page}>
      <div style={S.kicker}>Inventario</div>
      <h1 style={S.title}>🔄 Rotación de productos</h1>
      <p style={S.caption}>Análisis de qué comprar, qué liquidar y qué rota bien.</p>
      <div style={S.empty}>
        <div style={{fontSize:'2.5rem',marginBottom:12}}>📊</div>
        <p style={{margin:0,fontWeight:600}}>Sin datos de inventario</p>
        <p style={{margin:'8px 0 0',fontSize:'0.85rem'}}>
          Subí el reporte <strong>Lista de mínimos y máximos</strong> en{' '}
          <a href="/reportes" style={{color:'var(--orange)'}}>Carga de reportes</a>
        </p>
      </div>
    </div>
  );

  return (
    <div style={S.page}>
      <div style={S.kicker}>Inventario</div>
      <h1 style={S.title}>🔄 Rotación de productos</h1>
      <p style={S.caption}>
        {items.length.toLocaleString()} productos activos · Actualizado: {fmtDate(ultimaActualizacion)}
      </p>

      {/* KPIs */}
      <div style={S.grid3}>
        {[
          { label:'Sin stock',      val: sinStock,   color:'#C53030', bg:'#FFF5F5', filter:'sin_stock' },
          { label:'Bajo mínimo',    val: bajoMinimo, color:'#C05621', bg:'#FFFAF0', filter:'bajo_minimo' },
          { label:'Baja rotación',  val: bajaRot,    color:'#553C9A', bg:'#FAF5FF', filter:'baja_rot' },
          { label:'Sobrestock',     val: sobrestock, color:'#276749', bg:'#F0FFF4', filter:'sobrestock' },
          { label:'Para pedir hoy', val: paraPedir.length,   color:'#C05621', bg:'#FFFAF0', filter:'bajo_minimo' },
          { label:'Para liquidar',  val: paraLiquidar.length, color:'#553C9A', bg:'#FAF5FF', filter:'baja_rot' },
        ].map((k, i) => (
          <div key={i} style={{ ...S.kpiCard, background: k.bg, cursor:'pointer', border: `1px solid ${k.color}22` }}
               onClick={() => { setFiltroEstado(k.filter); setTab(0); }}>
            <div style={S.kpiLabel}>{k.label}</div>
            <div style={{ ...S.kpiVal, color: k.color }}>{k.val}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={S.tabs}>
        {['📋 Todos los productos','🛒 Para pedir','💸 Para liquidar'].map((t,i)=>(
          <button key={i} style={{...S.tab,...(tab===i?S.tabActive:{})}} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {/* Tab 0: Todos */}
      {tab === 0 && (
        <div style={S.card}>
          <div style={{display:'flex', gap:'12px', marginBottom:'16px', flexWrap:'wrap', alignItems:'center'}}>
            <input
              style={{...S.input, width:'280px'}}
              placeholder="🔍 Buscar producto, código, categoría..."
              value={buscar}
              onChange={e => setBuscar(e.target.value)}
            />
            <select style={{...S.input, width:'200px'}}
                    value={filtroEstado}
                    onChange={e => setFiltroEstado(e.target.value)}>
              <option value="todos">Todos los estados</option>
              <option value="sin_stock">Sin stock</option>
              <option value="bajo_minimo">Bajo mínimo</option>
              <option value="baja_rot">Baja rotación</option>
              <option value="sobrestock">Sobrestock</option>
            </select>
            <span style={{color:'var(--text-muted)', fontSize:'0.83rem'}}>
              {filtrados.length.toLocaleString()} productos
            </span>
          </div>
          <div style={{overflowX:'auto', borderRadius:8, border:'1px solid var(--border-soft)'}}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Estado','Código','Nombre','Categoría','Proveedor','Existencias','Mín','Máx','Prom/mes','Días stock','Últ. costo'].map(h=>(
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.slice(0,300).map((it,i)=>(
                  <tr key={i} style={{background: i%2===0?'#fff':'#FAFAFA'}}>
                    <td style={S.td}>
                      <span style={S.badge(it._sem.color, it._sem.bg)}>{it._sem.label}</span>
                    </td>
                    <td style={{...S.td, color:'var(--text-muted)', fontSize:'0.78rem'}}>{it.codigo||'—'}</td>
                    <td style={{...S.td, maxWidth:220, overflow:'hidden', textOverflow:'ellipsis'}} title={it.nombre}>{it.nombre||'—'}</td>
                    <td style={{...S.td, color:'var(--text-muted)'}}>{it.categoria||'—'}</td>
                    <td style={{...S.td, color:'var(--text-muted)', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis'}}>{it.ultimo_proveedor||'—'}</td>
                    <td style={{...S.td, fontWeight:600, color: parseFloat(it.existencias)<=0?'#C53030':'var(--text-primary)', textAlign:'right'}}>{it.existencias??'—'}</td>
                    <td style={{...S.td, textAlign:'right', color:'var(--text-muted)'}}>{it.minimo??'—'}</td>
                    <td style={{...S.td, textAlign:'right', color:'var(--text-muted)'}}>{it.maximo??'—'}</td>
                    <td style={{...S.td, textAlign:'right'}}>{parseFloat(it.promedio_mensual)?.toFixed(1)||'—'}</td>
                    <td style={{...S.td, textAlign:'right', fontWeight:600, color: it._dias!=null&&it._dias<30?'#C05621':it._dias!=null&&it._dias>180?'#553C9A':'var(--text-primary)'}}>
                      {it._dias != null ? `${it._dias}d` : '—'}
                    </td>
                    <td style={{...S.td, textAlign:'right'}}>
                      {it.ultimo_costo ? `₡${parseFloat(it.ultimo_costo).toLocaleString('es-CR',{minimumFractionDigits:0})}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filtrados.length > 300 && (
              <div style={{padding:'10px 16px', color:'var(--text-muted)', fontSize:'0.82rem', borderTop:'1px solid var(--border-soft)'}}>
                Mostrando 300 de {filtrados.length.toLocaleString()} · Usá los filtros para refinar
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 1: Para pedir */}
      {tab === 1 && (
        <div style={S.card}>
          <p style={{color:'var(--text-muted)', fontSize:'0.85rem', marginTop:0, marginBottom:16}}>
            Productos con existencias por debajo del mínimo. La columna <strong>Pedir</strong> = Máximo − Existencias actual.
          </p>
          <div style={{overflowX:'auto', borderRadius:8, border:'1px solid var(--border-soft)'}}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Prioridad','Código','Nombre','Proveedor','Existencias','Mínimo','Máximo','Pedir','Últ. costo','Inversión est.'].map(h=>(
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paraPedir.map((it,i)=>{
                  const inversion = it._pedirCant * (parseFloat(it.ultimo_costo)||0);
                  return (
                    <tr key={i} style={{background: i%2===0?'#fff':'#FAFAFA'}}>
                      <td style={S.td}>
                        <span style={S.badge(it._sem.color, it._sem.bg)}>{it._sem.label}</span>
                      </td>
                      <td style={{...S.td, color:'var(--text-muted)', fontSize:'0.78rem'}}>{it.codigo||'—'}</td>
                      <td style={{...S.td, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis'}} title={it.nombre}>{it.nombre||'—'}</td>
                      <td style={{...S.td, color:'var(--text-muted)', maxWidth:150, overflow:'hidden', textOverflow:'ellipsis'}}>{it.ultimo_proveedor||'—'}</td>
                      <td style={{...S.td, textAlign:'right', color:'#C53030', fontWeight:600}}>{it.existencias??'—'}</td>
                      <td style={{...S.td, textAlign:'right'}}>{it.minimo??'—'}</td>
                      <td style={{...S.td, textAlign:'right'}}>{it.maximo??'—'}</td>
                      <td style={{...S.td, textAlign:'right', fontWeight:700, color:'var(--orange)'}}>{it._pedirCant}</td>
                      <td style={{...S.td, textAlign:'right'}}>{it.ultimo_costo?`₡${parseFloat(it.ultimo_costo).toLocaleString('es-CR',{maximumFractionDigits:0})}`:'—'}</td>
                      <td style={{...S.td, textAlign:'right', fontWeight:600}}>
                        {inversion>0?`₡${inversion.toLocaleString('es-CR',{maximumFractionDigits:0})}`:'—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {paraPedir.length === 0 && (
            <div style={{textAlign:'center', padding:'32px', color:'var(--text-muted)'}}>
              ✅ Todos los productos están sobre el mínimo
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Para liquidar */}
      {tab === 2 && (
        <div style={S.card}>
          <p style={{color:'var(--text-muted)', fontSize:'0.85rem', marginTop:0, marginBottom:16}}>
            Productos con sobrestock o baja rotación. Los días de stock muestran cuánto tiempo tardaría en agotarse al ritmo actual de ventas.
          </p>
          <div style={{overflowX:'auto', borderRadius:8, border:'1px solid var(--border-soft)'}}>
            <table style={S.table}>
              <thead>
                <tr>
                  {['Estado','Código','Nombre','Categoría','Existencias','Máximo','Prom/mes','Días stock','Últ. costo','Valor en stock'].map(h=>(
                    <th key={h} style={S.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {paraLiquidar.map((it,i)=>{
                  const valorStock = (parseFloat(it.existencias)||0) * (parseFloat(it.ultimo_costo)||0);
                  return (
                    <tr key={i} style={{background: i%2===0?'#fff':'#FAFAFA'}}>
                      <td style={S.td}>
                        <span style={S.badge(it._sem.color, it._sem.bg)}>{it._sem.label}</span>
                      </td>
                      <td style={{...S.td, color:'var(--text-muted)', fontSize:'0.78rem'}}>{it.codigo||'—'}</td>
                      <td style={{...S.td, maxWidth:200, overflow:'hidden', textOverflow:'ellipsis'}} title={it.nombre}>{it.nombre||'—'}</td>
                      <td style={{...S.td, color:'var(--text-muted)'}}>{it.categoria||'—'}</td>
                      <td style={{...S.td, textAlign:'right', fontWeight:600}}>{it.existencias??'—'}</td>
                      <td style={{...S.td, textAlign:'right', color:'var(--text-muted)'}}>{it.maximo??'—'}</td>
                      <td style={{...S.td, textAlign:'right'}}>{parseFloat(it.promedio_mensual)?.toFixed(1)||'—'}</td>
                      <td style={{...S.td, textAlign:'right', fontWeight:700, color:'#553C9A'}}>
                        {it._dias != null ? `${it._dias}d` : '—'}
                      </td>
                      <td style={{...S.td, textAlign:'right'}}>{it.ultimo_costo?`₡${parseFloat(it.ultimo_costo).toLocaleString('es-CR',{maximumFractionDigits:0})}`:'—'}</td>
                      <td style={{...S.td, textAlign:'right', fontWeight:600, color:'#553C9A'}}>
                        {valorStock>0?`₡${valorStock.toLocaleString('es-CR',{maximumFractionDigits:0})}`:'—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {paraLiquidar.length === 0 && (
            <div style={{textAlign:'center', padding:'32px', color:'var(--text-muted)'}}>
              ✅ Sin productos en sobrestock ni baja rotación detectada
            </div>
          )}
        </div>
      )}
    </div>
  );
}
