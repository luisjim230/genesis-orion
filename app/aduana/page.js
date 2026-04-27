'use client';
import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { supabase } from '../../lib/supabase';

// ── Estilos Liquid Glass Light Mode (consistente con CIF / SOL) ──────────
const GOLD = '#c8a84b';
const BURGUNDY = '#5E2733';
const ORANGE = '#ED6E2E';
const TEAL = '#225F74';
const GREEN = '#2e7d4f';
const RED = '#c04040';
const AMBER = '#c8882b';

const S = {
  page:       { background:'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)', minHeight:'100vh', padding:'28px 32px', fontFamily:'Rubik, sans-serif', color:'rgba(0,0,0,0.8)' },
  title:      { fontSize:'1.7rem', fontWeight:700, color:'rgba(0,0,0,0.85)', margin:0, letterSpacing:'-0.02em' },
  caption:    { fontSize:'0.85rem', color:'rgba(0,0,0,0.45)', marginTop:'4px', marginBottom:'24px' },
  card:       { background:'rgba(255,255,255,0.55)', backdropFilter:'blur(24px) saturate(1.8)', WebkitBackdropFilter:'blur(24px) saturate(1.8)', border:'1px solid rgba(255,255,255,0.6)', borderRadius:20, padding:'22px', marginBottom:'16px', boxShadow:'0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' },
  cardInner:  { background:'rgba(255,255,255,0.4)', backdropFilter:'blur(12px)', WebkitBackdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.5)', borderRadius:14, padding:'16px', boxShadow:'0 2px 12px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)' },
  input:      { background:'rgba(255,255,255,0.6)', border:'1px solid rgba(0,0,0,0.1)', borderRadius:'10px', color:'rgba(0,0,0,0.85)', padding:'10px 14px', fontSize:'0.95rem', width:'100%', outline:'none', boxSizing:'border-box', backdropFilter:'blur(8px)', fontFamily:'inherit' },
  btnPrimary: { background:`linear-gradient(135deg, ${GOLD}, #a08930)`, color:'#fff', border:'none', borderRadius:'10px', padding:'10px 22px', fontWeight:600, cursor:'pointer', fontSize:'0.92rem', boxShadow:`0 4px 20px rgba(200,168,75,0.25)`, transition:'all 0.15s', fontFamily:'inherit', whiteSpace:'nowrap' },
  btnGhost:   { background:'rgba(255,255,255,0.55)', color:'rgba(0,0,0,0.7)', border:'1px solid rgba(0,0,0,0.1)', borderRadius:'10px', padding:'10px 18px', cursor:'pointer', fontSize:'0.88rem', backdropFilter:'blur(12px)', transition:'all 0.15s', fontFamily:'inherit', whiteSpace:'nowrap' },
  label:      { fontSize:'0.78rem', color:'rgba(0,0,0,0.5)', marginBottom:'6px', display:'block', fontWeight:500, letterSpacing:'0.02em' },
  metricBox:  { background:'rgba(255,255,255,0.5)', borderRadius:12, padding:'10px 14px', border:'1px solid rgba(0,0,0,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center' },
  rowFlex:    { display:'flex', gap:12, alignItems:'flex-end' },
};

// ── Helpers ──────────────────────────────────────────────────────────────
function categoriaInfo(cat) {
  const c = String(cat || '').trim().toUpperCase();
  if (c === 'A') return { texto:'Categoría A — desgravación inmediata (2011)', desgravadoEn:2011 };
  if (c === 'B') return { texto:'Categoría B — desgravación 5 años (completada 2016)', desgravadoEn:2016 };
  if (c === 'C') return { texto:'Categoría C — desgravación 10 años (completada 2021)', desgravadoEn:2021 };
  if (c === 'D') return { texto:'Categoría D — desgravación 15 años (completada 2026)', desgravadoEn:2026 };
  if (c === 'MFN E' || c === 'MFNE' || c === 'E') return { texto:'MFN E — Excluido del TLC', desgravadoEn:null };
  if (c === 'F') return { texto:'Categoría F — Caso especial', desgravadoEn:null };
  return { texto:`Categoría ${c}`, desgravadoEn:null };
}

function fmtPct(n) {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return num.toFixed(num % 1 === 0 ? 0 : 2) + '%';
}

function fmtUSD(n) {
  return '$' + Number(n || 0).toLocaleString('en-US', { minimumFractionDigits:2, maximumFractionDigits:2 });
}

// ── Componentes ──────────────────────────────────────────────────────────
function ResultCard({ partida, onCalcular, calculadora, setCalculadora }) {
  const info = categoriaInfo(partida.categoria_desgravacion);
  const libre = !partida.paga_dai;

  const colorPrincipal = libre ? GREEN : AMBER;
  const tituloEstado = libre ? '✅ ENTRA LIBRE BAJO TLC' : '⚠️ PAGA ARANCEL COMPLETO';
  const fondoEstado = libre ? 'rgba(46,125,79,0.08)' : 'rgba(200,136,43,0.10)';
  const bordeEstado = libre ? 'rgba(46,125,79,0.25)' : 'rgba(200,136,43,0.30)';

  return (
    <div style={S.card}>
      <div style={{ marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
        <div>
          <div style={{ fontSize:'0.72rem', color:'rgba(0,0,0,0.45)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:600 }}>Partida</div>
          <div style={{ fontSize:'1.5rem', fontWeight:700, color:'rgba(0,0,0,0.88)', fontFamily:'monospace', letterSpacing:'0.02em' }}>{partida.codigo_arancelario}</div>
          <div style={{ fontSize:'0.95rem', color:'rgba(0,0,0,0.7)', marginTop:6, lineHeight:1.4 }}>{partida.descripcion}</div>
        </div>
        <span style={{ background:fondoEstado, color:colorPrincipal, border:`1px solid ${bordeEstado}`, borderRadius:20, padding:'6px 14px', fontSize:'0.78rem', fontWeight:700, whiteSpace:'nowrap' }}>{info.texto}</span>
      </div>

      <div style={{ ...S.cardInner, background:fondoEstado, border:`1px solid ${bordeEstado}`, marginBottom:14 }}>
        <div style={{ fontSize:'1.15rem', fontWeight:700, color:colorPrincipal, marginBottom:14 }}>{tituloEstado}</div>

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:6 }}>
          <div style={S.metricBox}>
            <span style={{ fontSize:'0.85rem', color:'rgba(0,0,0,0.55)' }}>Arancel base (DAI sin TLC)</span>
            <span style={{ fontSize:'1.05rem', fontWeight:700, color:'rgba(0,0,0,0.8)' }}>{partida.arancel_base ? fmtPct(parseFloat(partida.arancel_base)) : 'n/a'}</span>
          </div>
          <div style={S.metricBox}>
            <span style={{ fontSize:'0.85rem', color:'rgba(0,0,0,0.55)' }}>DAI efectivo (TLC China)</span>
            <span style={{ fontSize:'1.05rem', fontWeight:700, color:libre ? GREEN : AMBER }}>{fmtPct(partida.dai_efectivo_2026)}</span>
          </div>
          <div style={S.metricBox}>
            <span style={{ fontSize:'0.85rem', color:'rgba(0,0,0,0.55)' }}>Ley 6946 (siempre aplica)</span>
            <span style={{ fontSize:'1.05rem', fontWeight:700, color:'rgba(0,0,0,0.8)' }}>{fmtPct(partida.ley_6946)}</span>
          </div>
          <div style={{ ...S.metricBox, background:colorPrincipal+'15', border:`2px solid ${colorPrincipal}55` }}>
            <span style={{ fontSize:'0.85rem', color:colorPrincipal, fontWeight:600 }}>TOTAL EFECTIVO</span>
            <span style={{ fontSize:'1.25rem', fontWeight:800, color:colorPrincipal }}>{fmtPct(partida.total_efectivo)}</span>
          </div>
        </div>
      </div>

      {libre ? (
        <div style={{ background:'rgba(46,125,79,0.06)', border:'1px solid rgba(46,125,79,0.18)', borderRadius:12, padding:'12px 16px', color:'#1c5e36', fontSize:'0.9rem', lineHeight:1.5 }}>
          <strong>💡 Recomendación:</strong> Importar desde China bajo TLC es muy ventajoso para esta partida — solo paga el 1% de Ley 6946.
        </div>
      ) : (
        <>
          <div style={{ background:'rgba(200,136,43,0.08)', border:'1px solid rgba(200,136,43,0.25)', borderRadius:12, padding:'12px 16px', color:'#7a5215', fontSize:'0.9rem', lineHeight:1.5, marginBottom:14 }}>
            <strong>⚠️ Atención:</strong> Esta partida está excluida del TLC. Conviene evaluar otros orígenes o revisar si existe sustituto bajo otra partida que sí entre al TLC.
            {partida.notas && <div style={{ marginTop:6, fontSize:'0.85rem', opacity:0.85 }}>{partida.notas}</div>}
          </div>

          {/* Calculadora de costo nacionalizado para MFN E */}
          <div style={{ ...S.cardInner, marginTop:6 }}>
            <div style={{ fontSize:'0.95rem', fontWeight:700, color:'rgba(0,0,0,0.8)', marginBottom:10 }}>🧮 Calculadora de costo nacionalizado</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:12 }}>
              <div>
                <label style={S.label}>FOB (USD)</label>
                <input type="number" min="0" step="0.01" value={calculadora.fob} onChange={e=>setCalculadora({...calculadora, fob:e.target.value})} placeholder="0.00" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Flete (USD)</label>
                <input type="number" min="0" step="0.01" value={calculadora.flete} onChange={e=>setCalculadora({...calculadora, flete:e.target.value})} placeholder="0.00" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Seguro (USD)</label>
                <input type="number" min="0" step="0.01" value={calculadora.seguro} onChange={e=>setCalculadora({...calculadora, seguro:e.target.value})} placeholder="0.00" style={S.input} />
              </div>
            </div>
            {(() => {
              const fob = parseFloat(calculadora.fob) || 0;
              const flete = parseFloat(calculadora.flete) || 0;
              const seguro = parseFloat(calculadora.seguro) || 0;
              const cif = fob + flete + seguro;
              const dai = cif * (Number(partida.dai_efectivo_2026) / 100);
              const ley = cif * 0.01;
              const nacional = cif + dai + ley;
              if (cif === 0) return <div style={{ fontSize:'0.82rem', color:'rgba(0,0,0,0.4)' }}>Ingresá los valores arriba para ver el cálculo.</div>;
              return (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10 }}>
                  <div style={S.metricBox}><span style={{ fontSize:'0.78rem', color:'rgba(0,0,0,0.5)' }}>CIF</span><span style={{ fontWeight:700 }}>{fmtUSD(cif)}</span></div>
                  <div style={S.metricBox}><span style={{ fontSize:'0.78rem', color:'rgba(0,0,0,0.5)' }}>DAI</span><span style={{ fontWeight:700, color:AMBER }}>{fmtUSD(dai)}</span></div>
                  <div style={S.metricBox}><span style={{ fontSize:'0.78rem', color:'rgba(0,0,0,0.5)' }}>Ley 6946</span><span style={{ fontWeight:700 }}>{fmtUSD(ley)}</span></div>
                  <div style={{ ...S.metricBox, background:AMBER+'18', border:`2px solid ${AMBER}55` }}><span style={{ fontSize:'0.78rem', color:AMBER, fontWeight:600 }}>NACIONALIZADO</span><span style={{ fontWeight:800, color:AMBER }}>{fmtUSD(nacional)}</span></div>
                </div>
              );
            })()}
            <div style={{ fontSize:'0.72rem', color:'rgba(0,0,0,0.4)', marginTop:8 }}>* No incluye IVA porque es acreditable. No incluye gastos portuarios ni honorarios de agente.</div>
          </div>
        </>
      )}
    </div>
  );
}

function PartidaRow({ partida, onClick }) {
  const libre = !partida.paga_dai;
  return (
    <div onClick={onClick} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', background:'rgba(255,255,255,0.4)', border:'1px solid rgba(0,0,0,0.06)', borderRadius:10, marginBottom:6, cursor:'pointer', transition:'all 0.15s' }}
      onMouseEnter={e=>{ e.currentTarget.style.background='rgba(255,255,255,0.7)'; e.currentTarget.style.transform='translateX(2px)'; }}
      onMouseLeave={e=>{ e.currentTarget.style.background='rgba(255,255,255,0.4)'; e.currentTarget.style.transform='translateX(0)'; }}>
      <div style={{ minWidth:0, flex:1 }}>
        <div style={{ fontFamily:'monospace', fontSize:'0.88rem', fontWeight:600, color:'rgba(0,0,0,0.8)' }}>{partida.codigo_arancelario}</div>
        <div style={{ fontSize:'0.82rem', color:'rgba(0,0,0,0.55)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{partida.descripcion}</div>
      </div>
      <span style={{ fontSize:'0.72rem', fontWeight:700, padding:'3px 10px', borderRadius:12, background: libre ? 'rgba(46,125,79,0.12)' : 'rgba(200,136,43,0.14)', color: libre ? GREEN : AMBER, border:`1px solid ${libre ? 'rgba(46,125,79,0.25)' : 'rgba(200,136,43,0.30)'}`, whiteSpace:'nowrap', marginLeft:10 }}>
        {libre ? `TLC · ${fmtPct(partida.total_efectivo)}` : `${partida.categoria_desgravacion} · ${fmtPct(partida.total_efectivo)}`}
      </span>
    </div>
  );
}

// ── Página principal ─────────────────────────────────────────────────────
function AduanaInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codigoUrl = searchParams.get('codigo') || '';

  const [codigo, setCodigo] = useState(codigoUrl);
  const [busquedaTexto, setBusquedaTexto] = useState('');
  const [resultado, setResultado] = useState(null);   // partida única
  const [resultadosTexto, setResultadosTexto] = useState([]); // top 10 por descripción
  const [relacionadas, setRelacionadas] = useState([]); // misma partida (4 dígitos)
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [calculadora, setCalculadora] = useState({ fob:'', flete:'', seguro:'' });
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [totalPartidas, setTotalPartidas] = useState(null);

  // Stats globales del módulo
  useEffect(() => {
    (async () => {
      const { count } = await supabase.from('tlc_china_partidas').select('*', { count:'exact', head:true });
      setTotalPartidas(count || 0);
      const { data } = await supabase.from('tlc_china_partidas').select('updated_at').order('updated_at', { ascending:false }).limit(1);
      if (data?.[0]?.updated_at) setUltimaActualizacion(new Date(data[0].updated_at));
    })();
  }, []);

  const buscarPorCodigo = useCallback(async (codigoBuscar) => {
    const limpio = String(codigoBuscar || '').replace(/\D/g, '');
    if (!limpio) { setError('Ingresá un código arancelario.'); return; }
    setError('');
    setLoading(true);
    setResultadosTexto([]);
    try {
      // Búsqueda exacta primero
      let { data: exacta } = await supabase
        .from('tlc_china_partidas')
        .select('*')
        .eq('codigo_arancelario', limpio)
        .maybeSingle();

      // Si no hay match exacto y son <10 dígitos, buscar por prefijo
      if (!exacta && limpio.length < 10) {
        const { data: prefijo } = await supabase
          .from('tlc_china_partidas')
          .select('*')
          .like('codigo_arancelario', `${limpio}%`)
          .order('codigo_arancelario')
          .limit(20);
        if (prefijo && prefijo.length === 1) {
          exacta = prefijo[0];
        } else if (prefijo && prefijo.length > 1) {
          setResultado(null);
          setResultadosTexto(prefijo);
          setLoading(false);
          return;
        }
      }

      if (!exacta) {
        setResultado(null);
        setError(`No encontré la partida ${limpio} en la base cargada. Verificalo en el portal oficial: https://www.hacienda.go.cr/contenido/14271-tica-tarifa-importacion-clasificacion-arancelaria`);
        setLoading(false);
        return;
      }

      setResultado(exacta);
      router.replace(`/aduana?codigo=${exacta.codigo_arancelario}`, { scroll:false });

      // Sugerencias relacionadas: misma partida (4 dígitos)
      if (exacta.partida) {
        const { data: rel } = await supabase
          .from('tlc_china_partidas')
          .select('*')
          .eq('partida', exacta.partida)
          .neq('codigo_arancelario', exacta.codigo_arancelario)
          .limit(8);
        setRelacionadas(rel || []);
      } else {
        setRelacionadas([]);
      }
    } catch (e) {
      setError('Error consultando la base: ' + e.message);
    }
    setLoading(false);
  }, [router]);

  const buscarPorTexto = useCallback(async () => {
    const q = busquedaTexto.trim();
    if (!q || q.length < 3) { setError('Escribí al menos 3 letras para buscar.'); return; }
    setError('');
    setLoading(true);
    setResultado(null);
    setRelacionadas([]);
    try {
      const { data, error: errBusca } = await supabase
        .from('tlc_china_partidas')
        .select('*')
        .textSearch('descripcion', q.split(/\s+/).filter(Boolean).join(' & '), { config:'spanish' })
        .limit(10);

      if (errBusca || !data?.length) {
        // Fallback ILIKE si full-text no devuelve nada
        const { data: ilike } = await supabase
          .from('tlc_china_partidas')
          .select('*')
          .ilike('descripcion', `%${q}%`)
          .limit(10);
        setResultadosTexto(ilike || []);
        if (!ilike?.length) setError(`No encontré partidas con "${q}".`);
      } else {
        setResultadosTexto(data);
      }
    } catch (e) {
      setError('Error en la búsqueda: ' + e.message);
    }
    setLoading(false);
  }, [busquedaTexto]);

  // Si llega con ?codigo= en la URL, hacer la búsqueda al cargar
  useEffect(() => {
    if (codigoUrl) buscarPorCodigo(codigoUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigoUrl]);

  const limpiarBusqueda = () => {
    setCodigo('');
    setBusquedaTexto('');
    setResultado(null);
    setResultadosTexto([]);
    setRelacionadas([]);
    setError('');
    setCalculadora({ fob:'', flete:'', seguro:'' });
    router.replace('/aduana', { scroll:false });
  };

  return (
    <div style={S.page}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, marginBottom:4 }}>
        <h1 style={S.title}>🚢 Aduana — Consulta TLC China-CR</h1>
        {totalPartidas !== null && (
          <span style={{ fontSize:'0.78rem', color:'rgba(0,0,0,0.5)', background:'rgba(255,255,255,0.55)', border:'1px solid rgba(0,0,0,0.08)', borderRadius:20, padding:'4px 12px' }}>
            {totalPartidas.toLocaleString('es-CR')} partidas cargadas
          </span>
        )}
      </div>
      <p style={S.caption}>Verificá el trato arancelario de cualquier partida bajo el TLC vigente desde agosto 2011.</p>

      {/* Barra de búsqueda */}
      <div style={S.card}>
        <label style={S.label}>Código arancelario (8 ó 10 dígitos)</label>
        <div style={{ ...S.rowFlex, marginBottom:14 }}>
          <input
            type="text"
            value={codigo}
            onChange={e=>setCodigo(e.target.value)}
            onKeyDown={e=>{ if (e.key === 'Enter') buscarPorCodigo(codigo); }}
            placeholder="ej: 39172310"
            style={{ ...S.input, fontFamily:'monospace', fontSize:'1rem', letterSpacing:'0.04em' }}
            autoFocus
          />
          <button onClick={()=>buscarPorCodigo(codigo)} disabled={loading} style={{ ...S.btnPrimary, opacity: loading?0.6:1 }}>
            {loading ? 'Buscando…' : 'Buscar'}
          </button>
        </div>

        <label style={S.label}>O buscar por descripción</label>
        <div style={S.rowFlex}>
          <input
            type="text"
            value={busquedaTexto}
            onChange={e=>setBusquedaTexto(e.target.value)}
            onKeyDown={e=>{ if (e.key === 'Enter') buscarPorTexto(); }}
            placeholder='ej: "tubos PVC", "puertas aluminio"'
            style={S.input}
          />
          <button onClick={buscarPorTexto} disabled={loading} style={{ ...S.btnGhost, opacity: loading?0.6:1 }}>
            Buscar
          </button>
        </div>

        {(resultado || resultadosTexto.length > 0 || error) && (
          <div style={{ marginTop:12 }}>
            <button onClick={limpiarBusqueda} style={{ background:'transparent', border:'none', color:'rgba(0,0,0,0.5)', fontSize:'0.82rem', cursor:'pointer', textDecoration:'underline', padding:0, fontFamily:'inherit' }}>
              ← Limpiar y volver a buscar
            </button>
          </div>
        )}
      </div>

      {/* Errores */}
      {error && (
        <div style={{ background:'rgba(192,64,64,0.08)', border:'1px solid rgba(192,64,64,0.25)', borderRadius:12, padding:'12px 16px', color:'#8a2929', fontSize:'0.9rem', marginBottom:16 }}>
          {error}
        </div>
      )}

      {/* Resultado único */}
      {resultado && (
        <ResultCard partida={resultado} calculadora={calculadora} setCalculadora={setCalculadora} />
      )}

      {/* Lista de resultados (búsqueda por texto o por prefijo de código) */}
      {resultadosTexto.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize:'0.95rem', fontWeight:700, color:'rgba(0,0,0,0.75)', marginBottom:10 }}>
            {resultadosTexto.length} {resultadosTexto.length === 1 ? 'resultado' : 'resultados'} encontrados
          </div>
          {resultadosTexto.map(p => (
            <PartidaRow key={p.codigo_arancelario} partida={p} onClick={()=>{
              setResultadosTexto([]);
              setCodigo(p.codigo_arancelario);
              buscarPorCodigo(p.codigo_arancelario);
            }} />
          ))}
        </div>
      )}

      {/* Sugerencias relacionadas */}
      {resultado && relacionadas.length > 0 && (
        <div style={S.card}>
          <div style={{ fontSize:'0.95rem', fontWeight:700, color:'rgba(0,0,0,0.75)', marginBottom:10 }}>
            🔗 También te puede interesar (misma partida {String(resultado.partida).padStart(4,'0')})
          </div>
          {relacionadas.map(p => (
            <PartidaRow key={p.codigo_arancelario} partida={p} onClick={()=>{
              setCodigo(p.codigo_arancelario);
              buscarPorCodigo(p.codigo_arancelario);
            }} />
          ))}
        </div>
      )}

      {/* Estado vacío inicial — guía rápida */}
      {!resultado && resultadosTexto.length === 0 && !error && !loading && (
        <div style={S.card}>
          <div style={{ fontSize:'1rem', fontWeight:600, color:'rgba(0,0,0,0.8)', marginBottom:12 }}>📖 Cómo leer el resultado</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:12 }}>
            <div style={S.cardInner}>
              <div style={{ fontSize:'0.85rem', fontWeight:700, color:GREEN, marginBottom:4 }}>✅ Categorías A, B, C, D</div>
              <div style={{ fontSize:'0.82rem', color:'rgba(0,0,0,0.65)', lineHeight:1.5 }}>Desgravadas. Pagan 0% DAI + 1% Ley 6946. <strong>Total: 1%</strong></div>
            </div>
            <div style={S.cardInner}>
              <div style={{ fontSize:'0.85rem', fontWeight:700, color:AMBER, marginBottom:4 }}>⚠️ MFN E</div>
              <div style={{ fontSize:'0.82rem', color:'rgba(0,0,0,0.65)', lineHeight:1.5 }}>Excluido del TLC. Paga arancel base completo + 1% Ley 6946.</div>
            </div>
            <div style={S.cardInner}>
              <div style={{ fontSize:'0.85rem', fontWeight:700, color:TEAL, marginBottom:4 }}>📌 Categoría F</div>
              <div style={{ fontSize:'0.82rem', color:'rgba(0,0,0,0.65)', lineHeight:1.5 }}>Caso especial. Revisar Notas Generales del TLC.</div>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div style={{ marginTop:24, padding:'14px 18px', fontSize:'0.78rem', color:'rgba(0,0,0,0.45)', textAlign:'center', lineHeight:1.6 }}>
        Datos según Anexo 2 del TLC China-CR publicado por COMEX
        {ultimaActualizacion && ` · Última actualización: ${ultimaActualizacion.toLocaleDateString('es-CR', { day:'2-digit', month:'long', year:'numeric' })}`}
        <br />
        <a href="https://www.comex.go.cr/media/2871/04_anexo-02_lista-de-cr.pdf" target="_blank" rel="noopener noreferrer" style={{ color:GOLD, textDecoration:'none' }}>📄 Anexo 2 (PDF oficial)</a>
        {' · '}
        <a href="https://www.hacienda.go.cr/contenido/14271-tica-tarifa-importacion-clasificacion-arancelaria" target="_blank" rel="noopener noreferrer" style={{ color:GOLD, textDecoration:'none' }}>🔗 TICA Hacienda</a>
      </div>
    </div>
  );
}

export default function AduanaPage() {
  return (
    <Suspense fallback={<div style={S.page}><div style={S.caption}>Cargando…</div></div>}>
      <AduanaInner />
    </Suspense>
  );
}
