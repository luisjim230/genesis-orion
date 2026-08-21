'use client';
import { useState, useEffect } from 'react';
import { S, usd } from './estilos';

// Comparativo entre lo que Luis ya tenía cargado a mano y lo que dice el
// documento. Acá NUNCA se pisa nada solo: cada fila se aplica con un click, y
// el valor propuesto se puede editar antes de aplicarlo.

const ESTADO_INFO = {
  igual:    { txt:'Coincide',       color:'#38A169' },
  distinto: { txt:'No coincide',    color:'#DD6B20' },
  vacio:    { txt:'Lo tenés vacío', color:'#3182CE' },
};

export default function Diferencias({ docId, diferencias, onAplicado, compacto }) {
  const [filas, setFilas]   = useState(diferencias || []);
  const [sel, setSel]       = useState(() => new Set());
  const [edit, setEdit]     = useState({});
  const [msg, setMsg]       = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setFilas(diferencias || []);
    // Lo que está vacío se premarca (no hay nada que perder). Lo que difiere
    // queda sin marcar a propósito: eso lo decide Luis.
    setSel(new Set((diferencias || []).filter(f => f.estado === 'vacio').map(f => f.campo)));
    setEdit({});
  }, [diferencias]);

  const pendientes = filas.filter(f => f.estado !== 'igual');
  const coinciden  = filas.filter(f => f.estado === 'igual');

  function toggle(campo) {
    setSel(s => { const n = new Set(s); n.has(campo) ? n.delete(campo) : n.add(campo); return n; });
  }

  async function aplicar() {
    if (!sel.size) { setMsg({ tipo:'warn', txt:'No marcaste nada.' }); return; }
    setGuardando(true); setMsg(null);
    const valores = {};
    for (const campo of sel) {
      if (Object.prototype.hasOwnProperty.call(edit, campo)) {
        const f = filas.find(x => x.campo === campo);
        valores[campo] = f?.tipo === 'monto' ? (edit[campo] === '' ? null : Number(edit[campo])) : edit[campo];
      }
    }
    try {
      const r = await fetch(`/api/contenedores/docs/${docId}/aplicar`, {
        method:'POST',
        headers:{ 'content-type':'application/json' },
        body: JSON.stringify({ campos:[...sel], valores }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'No se pudo aplicar.');
      setFilas(j.diferencias || []);
      setSel(new Set());
      setMsg({ tipo:'ok', txt:`Listo: ${j.aplicados.length} dato(s) actualizado(s) en el envío.` });
      onAplicado?.(j.envio);
    } catch (e) {
      setMsg({ tipo:'err', txt: e.message });
    }
    setGuardando(false);
  }

  const mostrar = (f, v) => {
    if (v === null || v === undefined || v === '') return '—';
    if (f.tipo === 'monto') return f.campo === 'pct_adelanto' ? Number(v) + '%' : usd(v);
    return String(v);
  };

  if (!filas.length) {
    return <div style={S.aviso('warn')}>El archivo no trajo datos comparables.</div>;
  }

  return (
    <div>
      {msg && <div style={S.aviso(msg.tipo)}>{msg.txt}</div>}

      {pendientes.length === 0 ? (
        <div style={S.aviso('ok')}>✅ Todo lo del archivo coincide con lo que tenías cargado. Nada que corregir.</div>
      ) : (
        <>
          <div style={{ fontSize:'0.8em', color:'var(--text-muted)', marginBottom:'10px' }}>
            Marcá lo que querés traer del archivo. Lo que no marcás queda como lo tenías. Podés editar el valor antes de aplicarlo.
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={S.table}>
              <thead>
                <tr>
                  <th style={{ ...S.th, width:'34px' }}></th>
                  <th style={S.th}>Dato</th>
                  <th style={S.th}>Lo que tenés</th>
                  <th style={S.th}>Lo que dice el archivo</th>
                  <th style={S.th}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {pendientes.map(f => {
                  const info = ESTADO_INFO[f.estado] || ESTADO_INFO.distinto;
                  const valor = Object.prototype.hasOwnProperty.call(edit, f.campo) ? edit[f.campo] : f.propuesto;
                  return (
                    <tr key={f.campo}>
                      <td style={S.td}>
                        <input type="checkbox" checked={sel.has(f.campo)} onChange={()=>toggle(f.campo)}
                               style={{ accentColor:'#c8a84b', width:'16px', height:'16px', cursor:'pointer' }}/>
                      </td>
                      <td style={{ ...S.td, fontWeight:600 }}>{f.label}</td>
                      <td style={{ ...S.td, color:'var(--text-muted)' }}>{mostrar(f, f.actual)}</td>
                      <td style={S.td}>
                        {f.campo === 'resumen' ? (
                          <textarea style={{ ...S.inputSm, minHeight:'56px', resize:'vertical' }}
                                    value={valor ?? ''} onChange={e=>setEdit(x=>({ ...x, [f.campo]: e.target.value }))}/>
                        ) : (
                          <input style={{ ...S.inputSm, maxWidth:'220px' }}
                                 type={f.tipo === 'monto' ? 'number' : 'text'}
                                 value={valor ?? ''} onChange={e=>setEdit(x=>({ ...x, [f.campo]: e.target.value }))}/>
                        )}
                      </td>
                      <td style={S.td}><span style={S.badge(info.color)}>{info.txt}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', gap:'10px', alignItems:'center', marginTop:'12px', flexWrap:'wrap' }}>
            <button style={S.btn()} onClick={aplicar} disabled={guardando}>
              {guardando ? 'Aplicando...' : `✅ Aplicar lo marcado (${sel.size})`}
            </button>
            <button style={S.btnSm()} onClick={()=>setSel(new Set(pendientes.map(f=>f.campo)))}>Marcar todo</button>
            <button style={S.btnSm()} onClick={()=>setSel(new Set())}>Desmarcar todo</button>
          </div>
        </>
      )}

      {!compacto && coinciden.length > 0 && (
        <div style={{ marginTop:'14px', fontSize:'0.8em', color:'var(--text-muted)' }}>
          ✅ Ya coincidían: {coinciden.map(f => f.label).join(' · ')}
        </div>
      )}
    </div>
  );
}
