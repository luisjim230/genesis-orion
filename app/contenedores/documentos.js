'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { S, usd } from './estilos';
import Diferencias from './diferencias';
import ZonaSubida from './zona-subida';

// Subida masiva: Luis tira todas las proformas juntas y el sistema propone a
// qué contenedor pertenece cada una (comparando adelanto, saldo y total contra
// lo que ya tiene cargado). Confirmar siempre es un click suyo.

export default function Documentos({ envios, onCambio }) {
  const [pendientes, setPendientes] = useState([]);
  const [subiendo, setSubiendo]     = useState(false);
  const [progreso, setProgreso]     = useState(null);
  const [msg, setMsg]               = useState(null);
  const [diffs, setDiffs]           = useState({});   // doc_id → diferencias
  const [destino, setDestino]       = useState({});   // doc_id → envio_id elegido a mano
  const [releyendo, setReleyendo]   = useState(null);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('neptuno_docs')
      .select('*').is('envio_id', null).order('created_at', { ascending:false });
    setPendientes(data || []);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function aviso(txt, tipo='ok') { setMsg({ txt, tipo }); setTimeout(()=>setMsg(null), 8000); }

  // De a un archivo por request (leer una proforma con IA tarda) y refrescando
  // la lista en cada vuelta, así Luis ve cómo van cayendo.
  async function subir(files) {
    if (!files?.length) return;
    setSubiendo(true); setMsg(null);
    const todos = [];
    for (let i = 0; i < files.length; i++) {
      setProgreso(files.length > 1 ? `Leyendo ${i + 1} de ${files.length}...` : null);
      const fd = new FormData();
      fd.append('files', files[i]);
      try {
        const r = await fetch('/api/contenedores/docs', { method:'POST', body: fd });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'No se pudo subir.');
        todos.push(...(j.resultados || []));
      } catch (e) {
        todos.push({ archivo: files[i].name, estado:'error', motivo: e.message });
      }
      await cargar();
    }
    setProgreso(null);
    const mal   = todos.filter(x => x.estado === 'error');
    const crudo = todos.filter(x => x.estado === 'sin_leer');
    const dup   = todos.filter(x => x.estado === 'duplicado');
    const ok    = todos.filter(x => x.estado === 'procesado');
    const partes = [];
    if (ok.length)    partes.push(`${ok.length} archivo(s) leído(s)`);
    if (dup.length)   partes.push(`${dup.length} ya estaba(n)`);
    if (crudo.length) partes.push(`${crudo.length} se guardó pero no se pudo leer: ${crudo.map(x=>x.motivo).join(' · ')}`);
    if (mal.length)   partes.push(`con problema: ${mal.map(x=>x.archivo+' — '+x.motivo).join(' · ')}`);
    aviso(partes.join(' · '), (mal.length || crudo.length) ? 'warn' : 'ok');
    setSubiendo(false);
  }

  async function asignar(docId, envioId) {
    if (!envioId) { aviso('Elegí a qué contenedor va.', 'warn'); return; }
    const r = await fetch(`/api/contenedores/docs/${docId}`, {
      method:'PATCH', headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ envio_id: envioId }),
    });
    const j = await r.json();
    if (!r.ok) { aviso(j.error || 'No se pudo asignar.', 'err'); return; }
    setDiffs(d => ({ ...d, [docId]: j.diferencias }));
    setPendientes(l => l.filter(d => d.id !== docId));
    aviso('Documento asignado. Abajo tenés el comparativo con lo que ya tenías cargado.');
    onCambio?.();
  }

  async function releer(docId) {
    setReleyendo(docId);
    const r = await fetch(`/api/contenedores/docs/${docId}/releer`, { method:'POST' });
    const j = await r.json();
    setReleyendo(null);
    if (!r.ok) { aviso(j.error || 'No se pudo leer.', 'err'); return; }
    aviso('Archivo leído: ' + j.items + ' línea(s) de mercadería.');
    await cargar();
  }

  async function borrar(docId) {
    if (!confirm('¿Borrar este archivo?')) return;
    await fetch(`/api/contenedores/docs/${docId}`, { method:'DELETE' });
    setPendientes(l => l.filter(d => d.id !== docId));
    aviso('Archivo borrado.');
  }

  return (
    <div>
      <div style={{ ...S.card, marginBottom:'16px' }}>
        <div style={S.seccion}>📤 Subir documentos de varias órdenes juntas</div>
        <ZonaSubida onArchivos={subir} subiendo={subiendo} progreso={progreso}
                    titulo="Arrastrá acá las proformas y facturas"
                    ayuda="O hacé click para elegirlas. Se leen solas y el sistema te dice a qué contenedor cree que van."/>
        {msg && <div style={{ ...S.aviso(msg.tipo), marginTop:'12px', marginBottom:0 }}>{msg.txt}</div>}
      </div>

      {Object.keys(diffs).length > 0 && Object.entries(diffs).map(([docId, d]) => (
        <div key={docId} style={S.card}>
          <div style={S.seccion}>🔍 Comparativo del último archivo asignado</div>
          <Diferencias docId={docId} diferencias={d} onAplicado={()=>onCambio?.()}/>
        </div>
      ))}

      <div style={{ fontSize:'0.82em', color:'var(--text-muted)', marginBottom:'12px' }}>
        {pendientes.length === 0 ? 'No hay archivos sin asignar.' : `${pendientes.length} archivo(s) esperando que les digas a qué contenedor van.`}
      </div>

      {pendientes.map(d => {
        const ex = d.extraido || {};
        const cands = d.match_sugerido?.candidatos || [];
        return (
          <div key={d.id} style={S.card}>
            <div style={{ display:'flex', justifyContent:'space-between', gap:'12px', flexWrap:'wrap' }}>
              <div>
                <div style={{ fontWeight:700 }}>📄 {d.nombre}</div>
                <div style={{ fontSize:'0.8em', color:'var(--text-muted)', marginTop:'4px' }}>
                  {[ex.proveedor, ex.pi_num && 'PI ' + ex.pi_num, ex.incoterm,
                    ex.total_monto && 'Total ' + usd(ex.total_monto),
                    ex.adelanto_monto && 'Adelanto ' + usd(ex.adelanto_monto),
                    ex.saldo_monto && 'Saldo ' + usd(ex.saldo_monto)].filter(Boolean).join(' · ')}
                </div>
                {ex.resumen && <div style={{ fontSize:'0.82em', marginTop:'8px', lineHeight:1.5 }}>{ex.resumen}</div>}
                {d.estado !== 'procesado' && (
                  <div style={{ ...S.aviso('warn'), marginTop:'8px', marginBottom:0 }}>
                    Este archivo está guardado pero todavía no se pudo leer.{d.error ? ' ' + d.error : ''} Cuando se arregle, apretá <strong>Leer de nuevo</strong>.
                  </div>
                )}
              </div>
              <div style={{ display:'flex', gap:'6px', alignItems:'flex-start' }}>
                <a href={`/api/contenedores/docs/${d.id}/archivo`} target="_blank" rel="noreferrer"
                   style={{ ...S.btnSm(), textDecoration:'none' }}>👁️ Ver</a>
                <button style={S.btnSm()} disabled={releyendo === d.id} onClick={()=>releer(d.id)}>
                  {releyendo === d.id ? '⏳ Leyendo...' : '🔄 Leer de nuevo'}
                </button>
                <button style={S.btnSm('#fff5f5')} onClick={()=>borrar(d.id)}>🗑️</button>
              </div>
            </div>

            <hr style={S.divider}/>

            {cands.length > 0 ? (
              <>
                <div style={{ fontSize:'0.8em', color:'var(--text-muted)', marginBottom:'8px' }}>
                  Por los montos, esto parece ser de:
                </div>
                <div style={{ display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'12px' }}>
                  {cands.map(c => (
                    <button key={c.envio_id} style={{ ...S.btn(c.score >= 60 ? 'var(--orange)' : '#8899aa'), textAlign:'left' }}
                            onClick={()=>asignar(d.id, c.envio_id)}>
                      🚢 {c.nombre}
                      <div style={{ fontSize:'0.78em', opacity:0.85, fontWeight:400 }}>{c.motivos.join(' · ')}</div>
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div style={{ fontSize:'0.8em', color:'var(--text-muted)', marginBottom:'10px' }}>
                No encontré un contenedor que calce por montos. Elegilo vos:
              </div>
            )}

            <div style={{ display:'flex', gap:'8px', alignItems:'center', flexWrap:'wrap' }}>
              <select style={{ ...S.input, maxWidth:'340px' }} value={destino[d.id] || ''}
                      onChange={e=>setDestino(x=>({ ...x, [d.id]: e.target.value }))}>
                <option value="">— Elegir contenedor a mano —</option>
                {envios.map(e => <option key={e.id} value={e.id}>{e.nombre}{e.proveedor ? ' · ' + e.proveedor : ''}</option>)}
              </select>
              <button style={S.btnSm()} onClick={()=>asignar(d.id, destino[d.id])}>Asignar</button>
            </div>
          </div>
        );
      })}

      {Object.keys(diffs).length > 0 && (
        <div style={{ fontSize:'0.78em', color:'var(--text-muted)', marginTop:'10px' }}>
          Los documentos ya asignados quedan dentro del expediente de su contenedor, en la pestaña de Envíos Activos.
        </div>
      )}

    </div>
  );
}
