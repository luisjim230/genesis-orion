'use client';
import { useState, useEffect, useCallback } from 'react';
import { createBrowserClient } from '@supabase/ssr';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const S = {
  page:{ background:'var(--cream)', minHeight:'100vh', padding:'28px 32px', fontFamily:'DM Sans, sans-serif', color:'var(--text-primary)' },
  title:{ fontSize:'1.7rem', fontWeight:700, color:'var(--text-primary)', margin:0 },
  caption:{ fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'4px', marginBottom:'24px' },
  section:{ fontSize:'1.15rem', fontWeight:700, color:'var(--text-primary)', marginBottom:'4px', marginTop:'8px' },
  subCap:{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'16px' },
  divider:{ border:'none', borderTop:'1px solid var(--border-soft)', margin:'24px 0' },
  grid3:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', marginBottom:'16px' },
  grid2:{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'16px', marginBottom:'16px' },
  btnGhost:{ background:'var(--cream)', color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 16px', cursor:'pointer', fontSize:'0.88rem' },
  btnPrimary:{ background:'var(--orange)', color:'#fff', border:'none', borderRadius:'8px', padding:'8px 16px', cursor:'pointer', fontSize:'0.88rem', fontWeight:600 },
  card:{ background:'#fff', borderRadius:'12px', padding:'16px', border:'1px solid var(--border-soft)' },
  badge:{ display:'inline-block', borderRadius:20, padding:'2px 10px', fontSize:'0.72rem', fontWeight:600 },
  tab:{ padding:'8px 16px', cursor:'pointer', borderRadius:'8px 8px 0 0', fontSize:'0.85rem', fontWeight:500, border:'none' },
};

const CAT_LABELS = {
  pisos: '🏠 Pisos',
  paredes_revestimiento: '🧱 Paredes y Revestimiento',
  bano: '🚿 Baño',
  ventanas_puertas: '🪟 Ventanas y Puertas',
  iluminacion: '💡 Iluminación',
  cielos_techos: '☁️ Cielos y Techos',
  remodelacion_general: '🔨 Remodelación General',
  griferia_accesorios: '🚰 Grifería y Accesorios',
};

const REGION_FLAGS = { CR:'🇨🇷', GT:'🇬🇹', MX:'🇲🇽', US:'🇺🇸' };

function ScoreBadge({ score }) {
  let bg, color, label;
  if (score >= 70) { bg = '#C6F6D5'; color = '#22543D'; label = 'Oportunidad'; }
  else if (score >= 45) { bg = '#FEFCBF'; color = '#744210'; label = 'Monitorear'; }
  else if (score >= 25) { bg = '#BEE3F8'; color = '#2A4365'; label = 'Señal temprana'; }
  else { bg = '#EDF2F7'; color = '#718096'; label = 'Sin señal'; }
  return <span style={{ ...S.badge, background: bg, color }}>{label} · {score}</span>;
}

function ScoreBar({ value, max = 100, color = '#c8a84b' }) {
  return (
    <div style={{ background: 'var(--border-soft)', borderRadius: 4, height: 6, width: '100%' }}>
      <div style={{ background: color, borderRadius: 4, height: 6, width: `${Math.min((value / max) * 100, 100)}%`, transition: 'width 0.4s ease' }} />
    </div>
  );
}

function LogIndicator({ logs }) {
  if (!logs || logs.length === 0) return <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sin datos aún</span>;
  const ultimo = logs[0];
  const fecha = new Date(ultimo.fecha_ejecucion);
  const str = fecha.toLocaleDateString('es-CR', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + fecha.toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' });
  if (ultimo.estado === 'ok') return <span style={{ fontSize: '0.75rem', color: '#38A169' }}>✅ Actualizado {str}</span>;
  if (ultimo.estado === 'parcial') return <span style={{ fontSize: '0.75rem', color: '#D69E2E' }}>⚠️ Parcial {str}</span>;
  return <span style={{ fontSize: '0.75rem', color: '#E53E3E' }}>❌ Error {str} — {ultimo.mensaje?.slice(0, 60)}</span>;
}

export default function RadarPage() {
  const [evaluaciones, setEvaluaciones] = useState([]);
  const [tendencias, setTendencias] = useState([]);
  const [productosML, setProductosML] = useState([]);
  const [logs, setLogs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [disparando, setDisparando] = useState(false);
  const [tabCat, setTabCat] = useState('todas');
  const [ultimoRun, setUltimoRun] = useState(null);
  const [keywords, setKeywords] = useState([]);
  const [kwNueva, setKwNueva] = useState('');
  const [kwCat, setKwCat] = useState('pisos');
  const [kwGuardando, setKwGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);

    const [evalRes, tendRes, mlRes, logRes, kwRes] = await Promise.allSettled([
      supabase.from('radar_evaluaciones')
        .select('*')
        .order('score_total', { ascending: false })
        .limit(50),
      supabase.from('radar_tendencias')
        .select('keyword,categoria,region,interes,fecha_dato')
        .order('fecha_dato', { ascending: false })
        .limit(200),
      supabase.from('radar_productos_ml')
        .select('keyword,categoria,region,titulo,precio,moneda,vendidos,vendedor,url,fecha_scrape')
        .order('vendidos', { ascending: false })
        .limit(100),
      supabase.from('radar_logs')
        .select('*')
        .order('fecha_ejecucion', { ascending: false })
        .limit(10),
      supabase.from('radar_keywords')
        .select('*')
        .order('categoria', { ascending: true })
        .order('keyword', { ascending: true }),
    ]);

    if (evalRes.status === 'fulfilled') setEvaluaciones(evalRes.value.data || []);
    if (tendRes.status === 'fulfilled') setTendencias(tendRes.value.data || []);
    if (mlRes.status === 'fulfilled') setProductosML(mlRes.value.data || []);
    if (logRes.status === 'fulfilled') setLogs(logRes.value.data || []);
    if (kwRes.status === 'fulfilled') setKeywords(kwRes.value.data || []);

    // Estado del último workflow
    try {
      const r = await fetch('/api/radar');
      const data = await r.json();
      setUltimoRun(data.ultimo_run);
    } catch { /* ignore */ }

    setCargando(false);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  const agregarKeyword = async () => {
    if (!kwNueva.trim()) return;
    setKwGuardando(true);
    const { error } = await supabase.from('radar_keywords').insert({ keyword: kwNueva.trim(), categoria: kwCat });
    if (error) {
      alert(error.code === '23505' ? 'Esa keyword ya existe en esa categoría.' : 'Error: ' + error.message);
    } else {
      setKwNueva('');
      cargar();
    }
    setKwGuardando(false);
  };

  const toggleKeyword = async (id, activa) => {
    await supabase.from('radar_keywords').update({ activa: !activa }).eq('id', id);
    setKeywords(prev => prev.map(k => k.id === id ? { ...k, activa: !activa } : k));
  };

  const eliminarKeyword = async (id, keyword) => {
    if (!confirm('¿Eliminar "' + keyword + '" del monitoreo?')) return;
    await supabase.from('radar_keywords').delete().eq('id', id);
    setKeywords(prev => prev.filter(k => k.id !== id));
  };

  const dispararRadar = async () => {
    setDisparando(true);
    try {
      const r = await fetch('/api/radar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fuente: 'todas' }) });
      const data = await r.json();
      if (data.ok) {
        alert('Workflow disparado. Los datos se actualizarán en ~5 minutos.');
      } else {
        alert('Error: ' + (data.error || 'desconocido'));
      }
    } catch (e) {
      alert('Error de conexión: ' + e.message);
    }
    setDisparando(false);
  };

  // Filtrar evaluaciones por categoría
  const evalFiltradas = tabCat === 'todas' ? evaluaciones : evaluaciones.filter(e => e.categoria === tabCat);
  const categorias = [...new Set(evaluaciones.map(e => e.categoria))];

  // Top oportunidades (score >= 45)
  const oportunidades = evaluaciones.filter(e => e.score_total >= 45).slice(0, 6);

  // Stats resumen
  const totalKeywords = evaluaciones.length;
  const conSignal = evaluaciones.filter(e => e.score_total >= 25).length;
  const oportunidadesCount = evaluaciones.filter(e => e.score_total >= 70).length;
  const enCatalogo = evaluaciones.filter(e => e.ya_en_catalogo).length;

  if (cargando) {
    return (
      <div style={S.page}>
        <h1 style={S.title}>📡 RADAR</h1>
        <div style={{ fontSize: '1rem', color: 'var(--text-muted)', marginTop: 40, textAlign: 'center' }}>⏳ Cargando inteligencia de mercado...</div>
      </div>
    );
  }

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={S.title}>📡 RADAR — Inteligencia de Mercado</h1>
          <div style={S.caption}>Tendencias, oportunidades y señales de demanda · Google Trends + MercadoLibre + Datos internos</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <LogIndicator logs={logs} />
          <button style={S.btnPrimary} onClick={dispararRadar} disabled={disparando}>
            {disparando ? '⏳ Disparando...' : '🔄 Actualizar ahora'}
          </button>
        </div>
      </div>

      {/* Resumen rápido */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Keywords monitoreadas', value: totalKeywords, icon: '🔍', color: '#63b3ed' },
          { label: 'Con señal activa', value: conSignal, icon: '📶', color: '#D69E2E' },
          { label: 'Oportunidades fuertes', value: oportunidadesCount, icon: '🟢', color: '#38A169' },
          { label: 'Ya en catálogo', value: enCatalogo, icon: '📦', color: '#c8a84b' },
        ].map(({ label, value, icon, color }) => (
          <div key={label} style={{ ...S.card, borderLeft: `4px solid ${color}` }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{icon} {label}</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color }}>{value}</div>
          </div>
        ))}
      </div>

      <hr style={S.divider} />

      {/* Top Oportunidades */}
      {oportunidades.length > 0 && (
        <>
          <div style={S.section}>🎯 Top Oportunidades</div>
          <div style={S.subCap}>Productos con mayor score combinado (externo + interno)</div>
          <div style={S.grid3}>
            {oportunidades.map(ev => (
              <div key={ev.keyword} style={{ ...S.card, borderLeft: `4px solid ${ev.score_total >= 70 ? '#38A169' : '#D69E2E'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>{ev.keyword}</div>
                  <ScoreBadge score={ev.score_total} />
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>{CAT_LABELS[ev.categoria] || ev.categoria}</div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>🇨🇷 CR</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#c8a84b' }}>{ev.tendencia_cr || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>🇲🇽 MX</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#63b3ed' }}>{ev.tendencia_mx || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>🇺🇸 US</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#b794f4' }}>{ev.tendencia_us || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>ML</div>
                    <div style={{ fontSize: '1rem', fontWeight: 700, color: '#f48771' }}>{ev.productos_ml || 0} prod</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 55 }}>Externo</span>
                  <ScoreBar value={ev.score_externo} color="#63b3ed" />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 25 }}>{ev.score_externo}</span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 55 }}>Interno</span>
                  <ScoreBar value={ev.score_interno} color="#38A169" />
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: 25 }}>{ev.score_interno}</span>
                </div>
                {ev.ya_en_catalogo && <div style={{ fontSize: '0.72rem', color: '#38A169' }}>📦 Ya en catálogo</div>}
                {ev.precio_promedio_ml > 0 && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>💰 Precio promedio ML: ${ev.precio_promedio_ml?.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</div>}
                <div style={{ fontSize: '0.78rem', marginTop: 6, color: 'var(--text-primary)' }}>{ev.recomendacion}</div>
              </div>
            ))}
          </div>
          <hr style={S.divider} />
        </>
      )}

      {/* Tabla completa de evaluaciones */}
      <div style={S.section}>📊 Evaluación Completa por Keyword</div>
      <div style={S.subCap}>Score combinado: 60% señal externa (Trends + ML) + 40% señal interna (catálogo + velocidad)</div>

      {/* Tabs de categoría */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 12 }}>
        <button
          onClick={() => setTabCat('todas')}
          style={{ ...S.tab, background: tabCat === 'todas' ? 'var(--orange)' : 'var(--cream)', color: tabCat === 'todas' ? '#fff' : 'var(--text-muted)' }}
        >Todas</button>
        {categorias.map(cat => (
          <button
            key={cat}
            onClick={() => setTabCat(cat)}
            style={{ ...S.tab, background: tabCat === cat ? 'var(--orange)' : 'var(--cream)', color: tabCat === cat ? '#fff' : 'var(--text-muted)' }}
          >{CAT_LABELS[cat] || cat}</button>
        ))}
      </div>

      {evalFiltradas.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          📡 Sin evaluaciones aún. Presioná "Actualizar ahora" para correr el primer análisis.
        </div>
      ) : (
        <div style={{ ...S.card, overflowX: 'auto', padding: 0 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
            <thead>
              <tr>
                {['Keyword', 'Categoría', '🇨🇷', '🇲🇽', '🇺🇸', 'ML', 'Ext', 'Int', 'Total', 'Catálogo', 'Recomendación'].map(h => (
                  <th key={h} style={{ background: 'var(--cream)', color: 'var(--text-muted)', padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--border-soft)', fontWeight: 600, whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {evalFiltradas.map((ev, i) => (
                <tr key={ev.keyword + ev.fecha_evaluacion} style={{ background: i % 2 === 0 ? '#fff' : 'var(--cream)' }}>
                  <td style={{ padding: '8px 12px', fontWeight: 600, color: 'var(--text-primary)', borderBottom: '1px solid var(--border-soft)' }}>{ev.keyword}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border-soft)', fontSize: '0.75rem' }}>{CAT_LABELS[ev.categoria] || ev.categoria}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', fontWeight: 600, color: '#c8a84b' }}>{ev.tendencia_cr || 0}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', fontWeight: 600, color: '#63b3ed' }}>{ev.tendencia_mx || 0}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', fontWeight: 600, color: '#b794f4' }}>{ev.tendencia_us || 0}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-muted)' }}>{ev.productos_ml || 0}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', color: '#63b3ed', fontWeight: 600 }}>{ev.score_externo}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', color: '#38A169', fontWeight: 600 }}>{ev.score_interno}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)' }}><ScoreBadge score={ev.score_total} /></td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', textAlign: 'center' }}>{ev.ya_en_catalogo ? '📦' : '—'}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '1px solid var(--border-soft)', fontSize: '0.78rem' }}>{ev.recomendacion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <hr style={S.divider} />

      {/* Productos MercadoLibre */}
      <div style={S.section}>🛒 Productos Destacados en MercadoLibre</div>
      <div style={S.subCap}>Los más vendidos por keyword · Última captura</div>

      {productosML.length === 0 ? (
        <div style={{ ...S.card, textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
          Sin datos de MercadoLibre aún.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {productosML.slice(0, 12).map((p, i) => (
            <div key={i} style={{ ...S.card, borderLeft: '4px solid #f48771' }}>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: 4 }}>{REGION_FLAGS[p.region] || ''} {p.keyword}</div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {p.url ? <a href={p.url} target="_blank" rel="noreferrer" style={{ color: 'var(--text-primary)', textDecoration: 'none' }}>{p.titulo}</a> : p.titulo}
              </div>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#c8a84b' }}>{p.moneda} {p.precio?.toLocaleString('es-CR', { maximumFractionDigits: 0 })}</div>
                {p.vendidos > 0 && <div style={{ fontSize: '0.78rem', color: '#38A169' }}>{p.vendidos} vendidos</div>}
              </div>
              {p.vendedor && <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>Vendedor: {p.vendedor}</div>}
            </div>
          ))}
        </div>
      )}

      <hr style={S.divider} />

      {/* Gestión de Keywords */}
      <div style={S.section}>🔑 Keywords Monitoreadas</div>
      <div style={S.subCap}>Agregá o desactivá keywords que RADAR monitorea en cada ejecución</div>

      {/* Agregar nueva */}
      <div style={{ ...S.card, marginBottom: 16, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Nueva keyword</div>
          <input
            value={kwNueva}
            onChange={e => setKwNueva(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && agregarKeyword()}
            placeholder="Ej: piso porcelanato mate"
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--cream)', color: 'var(--text-primary)', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 4 }}>Categoría</div>
          <select
            value={kwCat}
            onChange={e => setKwCat(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--cream)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }}
          >
            {Object.entries(CAT_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
        </div>
        <button onClick={agregarKeyword} disabled={kwGuardando || !kwNueva.trim()} style={{ ...S.btnPrimary, opacity: kwGuardando || !kwNueva.trim() ? 0.5 : 1 }}>
          {kwGuardando ? '⏳' : '+ Agregar'}
        </button>
      </div>

      {/* Lista por categoría */}
      {Object.entries(CAT_LABELS).map(([catKey, catLabel]) => {
        const kwsCat = keywords.filter(k => k.categoria === catKey);
        if (kwsCat.length === 0) return null;
        return (
          <div key={catKey} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6 }}>{catLabel} <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 400 }}>({kwsCat.filter(k => k.activa).length} activas)</span></div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {kwsCat.map(k => (
                <div key={k.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: k.activa ? '#fff' : 'var(--cream)', border: '1px solid ' + (k.activa ? 'var(--border)' : 'var(--border-soft)'), borderRadius: 20, padding: '4px 12px', fontSize: '0.8rem', color: k.activa ? 'var(--text-primary)' : 'var(--text-muted)', opacity: k.activa ? 1 : 0.6 }}>
                  <span
                    onClick={() => toggleKeyword(k.id, k.activa)}
                    style={{ cursor: 'pointer', fontSize: '0.75rem' }}
                    title={k.activa ? 'Desactivar' : 'Activar'}
                  >{k.activa ? '🟢' : '⚪'}</span>
                  <span>{k.keyword}</span>
                  <span
                    onClick={() => eliminarKeyword(k.id, k.keyword)}
                    style={{ cursor: 'pointer', fontSize: '0.7rem', color: '#E53E3E', marginLeft: 2 }}
                    title="Eliminar"
                  >✕</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <hr style={S.divider} />

      {/* Logs de ejecución */}
      <details style={{ ...S.card }}>
        <summary style={{ cursor: 'pointer', color: 'var(--orange)', fontWeight: 600, fontSize: '0.9rem' }}>📋 Historial de ejecuciones</summary>
        <div style={{ marginTop: 14, overflowX: 'auto' }}>
          {logs.length === 0 ? (
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Sin ejecuciones registradas.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
              <thead>
                <tr>
                  {['Fecha', 'Fuente', 'Estado', 'Registros', 'Duración', 'Mensaje'].map(h => (
                    <th key={h} style={{ background: 'var(--cream)', color: 'var(--text-muted)', padding: '8px 12px', textAlign: 'left', borderBottom: '1px solid var(--border-soft)', fontWeight: 600 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {logs.map((l, i) => (
                  <tr key={l.id} style={{ background: i % 2 === 0 ? '#fff' : 'var(--cream)' }}>
                    <td style={{ padding: '7px 12px', borderBottom: '1px solid var(--border-soft)', whiteSpace: 'nowrap' }}>{new Date(l.fecha_ejecucion).toLocaleString('es-CR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                    <td style={{ padding: '7px 12px', borderBottom: '1px solid var(--border-soft)' }}>{l.fuente}</td>
                    <td style={{ padding: '7px 12px', borderBottom: '1px solid var(--border-soft)' }}>
                      {l.estado === 'ok' ? '✅' : l.estado === 'parcial' ? '⚠️' : '❌'} {l.estado}
                    </td>
                    <td style={{ padding: '7px 12px', borderBottom: '1px solid var(--border-soft)', fontWeight: 600 }}>{l.registros_guardados}</td>
                    <td style={{ padding: '7px 12px', borderBottom: '1px solid var(--border-soft)' }}>{l.duracion_segundos}s</td>
                    <td style={{ padding: '7px 12px', borderBottom: '1px solid var(--border-soft)', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.mensaje}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </details>

      <hr style={S.divider} />

      {/* Metodología */}
      <details style={{ ...S.card }}>
        <summary style={{ cursor: 'pointer', color: 'var(--orange)', fontWeight: 600, fontSize: '0.9rem' }}>📚 Metodología y fuentes</summary>
        <div style={{ marginTop: 14, fontSize: '0.82rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
          <div style={{ marginBottom: 12 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Score Externo (60%)</strong><br />
            Google Trends: interés de búsqueda ponderado por región (CR 40%, MX 35%, US 25%).<br />
            MercadoLibre: cantidad de productos y volumen de ventas como proxy de demanda real.
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Score Interno (40%)</strong><br />
            Ya en catálogo: +30 puntos si ya vendemos algo similar.<br />
            Velocidad de venta: hasta +40 puntos según facturación de categoría similar.<br />
            Complementarios: hasta +30 puntos por sinergia con productos existentes.
          </div>
          <div style={{ marginBottom: 12 }}>
            <strong style={{ color: 'var(--text-primary)' }}>Regiones monitoreadas</strong><br />
            🇨🇷 Costa Rica — señal local directa<br />
            🇬🇹 Guatemala — mercado vecino inmediato<br />
            🇲🇽 México — proxy adelantado ~6 meses<br />
            🇺🇸 Estados Unidos — adelantado 12-18 meses
          </div>
          <div>
            <strong style={{ color: 'var(--text-primary)' }}>Schedule</strong><br />
            Lunes 9:00am CR — análisis semanal de arranque<br />
            Jueves 2:00pm CR — actualización de mitad de semana<br />
            Botón manual disponible en cualquier momento
          </div>
        </div>
      </details>
    </div>
  );
}
