'use client';
import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { S, usd, usd2, numFmt } from './estilos';
import Diferencias from './diferencias';
import ZonaSubida from './zona-subida';
import { subirDocumentos, resumirSubida } from './subir-doc';

// Expediente de UN envío: los archivos de la orden (proforma, factura,
// contrato), la mercadería que trae y el estimado de impuestos.
// Todo lo que se extrae de un archivo se puede corregir a mano acá mismo.

const TIPO_DOC = {
  proforma: { txt:'Proforma', color:'#63b3ed' },
  factura:  { txt:'Factura',  color:'#68d391' },
  contrato: { txt:'Contrato', color:'#b794f4' },
  packing:  { txt:'Packing',  color:'#f6ad55' },
  bl:       { txt:'BL',       color:'#fc8181' },
  otro:     { txt:'Documento', color:'#a0aec0' },
};

export default function Expediente({ envio, onEnvioActualizado }) {
  const [docs, setDocs]         = useState([]);
  const [items, setItems]       = useState([]);
  const [cargando, setCargando] = useState(true);
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [msg, setMsg]           = useState(null);
  const [abierto, setAbierto]   = useState(null);   // { doc, diferencias }
  const [impuesto, setImpuesto] = useState('');
  const [releyendo, setReleyendo] = useState(null);
  const sucios    = useRef(new Set());   // líneas tocadas y todavía sin guardar
  const itemsRef  = useRef([]);
  itemsRef.current = items;

  const cargar = useCallback(async () => {
    setCargando(true);
    const [{ data: d }, { data: i }] = await Promise.all([
      supabase.from('neptuno_docs').select('*').eq('envio_id', envio.id).order('created_at', { ascending:false }),
      supabase.from('neptuno_items').select('*').eq('envio_id', envio.id).order('linea', { ascending:true }),
    ]);
    setDocs(d || []); setItems(i || []); setCargando(false);
  }, [envio.id]);

  useEffect(() => { cargar(); }, [cargar]);
  useEffect(() => { setImpuesto(envio.impuestos_monto ? String(envio.impuestos_monto) : ''); }, [envio.impuestos_monto]);

  function aviso(txt, tipo='ok') { setMsg({ txt, tipo }); setTimeout(()=>setMsg(null), 6000); }

  // ── Subida de archivos ────────────────────────────────────────────────────
  async function subir(files) {
    if (!files?.length) return;
    setSubiendo(true); setMsg(null);
    const todos = await subirDocumentos(files, { envioId: envio.id, onProgreso: setProgreso });
    const res = resumirSubida(todos);
    aviso(res.texto, res.tipo);
    await cargar();
    onEnvioActualizado?.();
    // Se abre solo el comparativo del primero que se leyó bien.
    if (res.ok.length) abrirComparativo(res.ok[0].doc_id);
    setSubiendo(false);
  }

  async function abrirComparativo(docId) {
    if (abierto?.doc?.id === docId) { setAbierto(null); return; }
    const r = await fetch(`/api/contenedores/docs/${docId}`);
    const j = await r.json();
    if (!r.ok) { aviso(j.error || 'No se pudo abrir el documento.', 'err'); return; }
    setAbierto({ doc: j.doc, diferencias: j.diferencias });
  }

  async function releerDoc(docId) {
    setReleyendo(docId);
    const r = await fetch(`/api/contenedores/docs/${docId}/releer`, { method:'POST' });
    const j = await r.json();
    setReleyendo(null);
    if (!r.ok) { aviso(j.error || 'No se pudo leer el archivo.', 'err'); return; }
    aviso('Archivo leído: ' + j.items + ' línea(s) de mercadería.');
    setAbierto({ doc: j.doc, diferencias: j.diferencias });
    await cargar();
    onEnvioActualizado?.();
  }

  async function borrarDoc(docId) {
    if (!confirm('¿Borrar este archivo? Las líneas de mercadería que hayas editado a mano se quedan.')) return;
    const r = await fetch(`/api/contenedores/docs/${docId}`, { method:'DELETE' });
    if (!r.ok) { aviso('No se pudo borrar.', 'err'); return; }
    if (abierto?.doc?.id === docId) setAbierto(null);
    aviso('Archivo borrado.');
    await cargar(); onEnvioActualizado?.();
  }

  // ── Mercadería ────────────────────────────────────────────────────────────
  // Se escribe en pantalla al toque y se guarda al salir de la celda: así no
  // se manda un update a Supabase por cada tecla.
  const CAMPOS_ITEM = ['item_no','descripcion','nombre_comercial','categoria','color','medida',
                       'unidad','cantidad','precio_unitario','monto','cbm','partida','codigo_interno','notas'];

  function setItem(id, patch) {
    setItems(list => list.map(it => it.id === id ? { ...it, ...patch } : it));
    sucios.current.add(id);
  }

  async function guardarItem(id) {
    if (!sucios.current.has(id)) return;
    sucios.current.delete(id);
    const it = itemsRef.current.find(x => x.id === id);
    if (!it) return;
    const patch = { editado:true, updated_at:new Date().toISOString() };
    for (const c of CAMPOS_ITEM) patch[c] = it[c] ?? null;

    // Si cambió la partida, se vuelve a buscar el DAI que le corresponde.
    const partida = String(patch.partida || '').replace(/\D/g, '');
    if (partida.length === 8) {
      const { data: p } = await supabase.from('tlc_china_partidas')
        .select('dai_efectivo_2026').eq('codigo_arancelario', partida).maybeSingle();
      patch.dai_pct = p ? Number(p.dai_efectivo_2026) : null;
    } else if (!partida) {
      patch.dai_pct = null;
    }

    const { error } = await supabase.from('neptuno_items').update(patch).eq('id', id);
    if (error) { aviso('No se pudo guardar el cambio: ' + error.message, 'err'); return; }
    if (patch.dai_pct !== it.dai_pct) setItems(l => l.map(x => x.id === id ? { ...x, dai_pct: patch.dai_pct } : x));
  }

  async function agregarLinea() {
    const { data, error } = await supabase.from('neptuno_items').insert({
      envio_id: envio.id, linea: (items.length ? Math.max(...items.map(i=>i.linea||0)) : 0) + 1,
      descripcion: '', cantidad: 0, origen:'manual', editado:true,
    }).select('*').single();
    if (error) { aviso('No se pudo agregar: ' + error.message, 'err'); return; }
    setItems(l => [...l, data]);
  }

  async function borrarLinea(id) {
    if (!confirm('¿Borrar esta línea?')) return;
    await supabase.from('neptuno_items').delete().eq('id', id);
    setItems(l => l.filter(i => i.id !== id));
  }

  // ── Impuestos ─────────────────────────────────────────────────────────────
  async function recalcular() {
    const r = await fetch('/api/contenedores/estimar', {
      method:'POST', headers:{ 'content-type':'application/json' },
      body: JSON.stringify({ envio_id: envio.id }),
    });
    const j = await r.json();
    if (!r.ok) { aviso(j.error || 'No se pudo estimar.', 'err'); return; }
    aviso('Estimado recalculado.');
    onEnvioActualizado?.();
  }

  async function guardarImpuesto(valor) {
    const monto = valor === '' ? 0 : Number(valor);
    const { error } = await supabase.from('neptuno_envios')
      .update({ impuestos_monto: monto, impuestos_fijado: true }).eq('id', envio.id);
    if (error) { aviso('No se pudo guardar: ' + error.message, 'err'); return; }
    aviso('Impuestos guardados: ' + usd(monto));
    onEnvioActualizado?.();
  }

  const totalItems = items.reduce((s,i)=>s+(Number(i.monto)||0), 0);
  const totalCbm   = items.reduce((s,i)=>s+(Number(i.cbm)||0), 0);
  const totalUnid  = items.reduce((s,i)=>s+(Number(i.cantidad)||0), 0);
  const det        = envio.impuestos_detalle || null;

  return (
    <div style={{ marginTop:'16px' }}>
      {msg && <div style={S.aviso(msg.tipo)}>{msg.txt}</div>}

      {/* ── Archivos ─────────────────────────────────────────────────────── */}
      <div style={{ ...S.caja, marginBottom:'14px' }}>
        <div style={S.seccion}>📎 Archivos de esta orden</div>
        <div style={{ marginBottom:'12px' }}>
          <ZonaSubida onArchivos={subir} subiendo={subiendo} progreso={progreso}
                      titulo="Arrastrá acá la proforma o la factura"
                      ayuda="O hacé click para elegirla. Se lee sola y te muestra qué coincide con lo que ya cargaste."/>
        </div>

        {cargando ? <div style={{ fontSize:'0.82em', color:'var(--text-muted)' }}>Cargando...</div>
        : docs.length === 0 ? <div style={{ fontSize:'0.82em', color:'var(--text-muted)' }}>Todavía no subiste ningún archivo de esta orden.</div>
        : docs.map(d => {
          const t = TIPO_DOC[d.tipo_doc] || TIPO_DOC.otro;
          const ex = d.extraido || {};
          const activo = abierto?.doc?.id === d.id;
          return (
            <div key={d.id} style={{ background:'#fff', border:'1px solid var(--border-soft)', borderRadius:'8px', padding:'10px 12px', marginBottom:'8px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', gap:'10px', flexWrap:'wrap', alignItems:'center' }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:'8px', flexWrap:'wrap' }}>
                    <span style={S.badge(t.color)}>{t.txt}</span>
                    <span style={{ fontWeight:600, fontSize:'0.86em' }}>{d.nombre}</span>
                  </div>
                  <div style={{ fontSize:'0.76em', color:'var(--text-muted)', marginTop:'3px' }}>
                    {[ex.proveedor, ex.pi_num && 'PI ' + ex.pi_num, ex.total_monto && 'Total ' + usd(ex.total_monto), ex.incoterm]
                      .filter(Boolean).join(' · ') || 'Sin datos'}
                  </div>
                </div>
                <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                  <a href={`/api/contenedores/docs/${d.id}/archivo`} target="_blank" rel="noreferrer" style={{ ...S.btnSm(), textDecoration:'none', display:'inline-block' }}>👁️ Ver</a>
                  {d.estado === 'procesado' && (
                    <button style={S.btnSm(activo ? '#fff7e6' : '#fff')} onClick={()=>abrirComparativo(d.id)}>
                      {activo ? '✖️ Cerrar' : '🔍 Comparar'}
                    </button>
                  )}
                  <button style={S.btnSm()} disabled={releyendo === d.id} onClick={()=>releerDoc(d.id)}>
                    {releyendo === d.id ? '⏳ Leyendo...' : '🔄 Leer de nuevo'}
                  </button>
                  <button style={S.btnSm('#fff5f5')} onClick={()=>borrarDoc(d.id)}>🗑️</button>
                </div>
              </div>
              {d.estado !== 'procesado' && (
                <div style={{ ...S.aviso('warn'), marginTop:'10px', marginBottom:0 }}>
                  Guardado, pero todavía no se pudo leer.{d.error ? ' ' + d.error : ''} Cuando se arregle, apretá <strong>Leer de nuevo</strong>.
                </div>
              )}
              {activo && (
                <div style={{ marginTop:'12px', paddingTop:'12px', borderTop:'1px solid var(--border-soft)' }}>
                  <Diferencias docId={d.id} diferencias={abierto.diferencias}
                               onAplicado={()=>{ onEnvioActualizado?.(); }}/>
                </div>
              )}
            </div>
          );
        })}

        {envio.resumen && (
          <div style={{ marginTop:'10px', background:'#fff', border:'1px solid var(--border-soft)', borderRadius:'8px', padding:'10px 12px', fontSize:'0.83em', lineHeight:1.5 }}>
            <strong>📝 Qué viene:</strong> {envio.resumen}
          </div>
        )}
      </div>

      {/* ── Impuestos estimados ──────────────────────────────────────────── */}
      <div style={{ ...S.caja, marginBottom:'14px' }}>
        <div style={S.seccion}>🧮 Impuestos de aduana</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'10px', marginBottom:'10px' }}>
          {[
            ['Valor mercadería', usd(det?.mercaderia ?? envio.mercaderia_monto)],
            ['Flete', usd(det?.flete ?? envio.flete_monto)],
            ['Base CIF', usd(det?.cif)],
            ['DAI' + (det?.dai_pct_promedio ? ` (${det.dai_pct_promedio}%)` : ''), usd(det?.dai)],
            ['Ley 6946 (1%)', usd(det?.ley_6946)],
            ['IVA (13%)', usd(det?.iva)],
          ].map(([l,v]) => (
            <div key={l} style={{ background:'#fff', borderRadius:'8px', padding:'8px 10px' }}>
              <div style={{ fontSize:'0.65em', color:'var(--text-muted)', textTransform:'uppercase' }}>{l}</div>
              <div style={{ fontSize:'0.92em', fontWeight:600, marginTop:'2px' }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={{ display:'flex', gap:'10px', alignItems:'flex-end', flexWrap:'wrap' }}>
          <div>
            <label style={S.label}>Estimado automático</label>
            <div style={{ fontSize:'1.15em', fontWeight:700, color:'#c8a84b' }}>{usd(envio.impuestos_estimado)}</div>
          </div>
          <div style={{ minWidth:'170px' }}>
            <label style={S.label}>Lo que vas a pagar (manda este)</label>
            <input style={S.input} type="number" value={impuesto}
                   onChange={e=>setImpuesto(e.target.value)}
                   onBlur={e=>guardarImpuesto(e.target.value)} placeholder="0"/>
          </div>
          <button style={S.btnSm()} disabled={!envio.impuestos_estimado}
                  onClick={()=>{ setImpuesto(String(envio.impuestos_estimado)); guardarImpuesto(envio.impuestos_estimado); }}>
            ⬅️ Usar el estimado
          </button>
          <button style={S.btnSm()} onClick={recalcular}>🔄 Recalcular</button>
        </div>

        <div style={{ fontSize:'0.74em', color:'var(--text-muted)', marginTop:'10px', lineHeight:1.5 }}>
          {det?.nota || 'Estimado sobre CIF: DAI según la partida de cada producto (TLC China) + 1% Ley 6946 + 13% IVA. No incluye agente aduanal ni almacenaje.'}
          {det?.lineas_totales > 0 && (
            <> {' '}Partida arancelaria identificada en {det.cobertura_partidas}% del valor ({det.lineas_con_partida} de {det.lineas_totales} líneas).</>
          )}
          {envio.impuestos_fijado && <> {' '}<strong>Este monto lo fijaste vos a mano.</strong></>}
        </div>
      </div>

      {/* ── Mercadería ───────────────────────────────────────────────────── */}
      <div style={S.caja}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:'8px' }}>
          <div style={{ ...S.seccion, marginBottom:0 }}>📦 Mercadería que viene ({items.length} líneas)</div>
          <button style={S.btnSm()} onClick={agregarLinea}>➕ Agregar línea a mano</button>
        </div>

        {items.length === 0 ? (
          <div style={{ fontSize:'0.82em', color:'var(--text-muted)', marginTop:'10px' }}>
            Sin mercadería cargada. Subí la proforma y se llena sola, o agregá las líneas a mano.
          </div>
        ) : (
          <>
            <div style={{ overflowX:'auto', marginTop:'10px' }}>
              <table style={{ ...S.table, minWidth:'1050px' }}>
                <thead>
                  <tr>
                    {['Código','Descripción','Nombre comercial','Categoría','Cant.','Unid.','P. unit.','Total','CBM','Partida','',''].map((h,i)=>(
                      <th key={i} style={S.th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    /* onBlur burbujea: al salir de cualquier celda se guarda la línea */
                    <tr key={it.id} onBlur={()=>guardarItem(it.id)}>
                      <td style={{ ...S.td, minWidth:'90px' }}>
                        <input style={S.inputSm} value={it.item_no ?? ''} onChange={e=>setItem(it.id,{ item_no:e.target.value })}/>
                      </td>
                      <td style={{ ...S.td, minWidth:'210px' }}>
                        <input style={S.inputSm} value={it.descripcion ?? ''} onChange={e=>setItem(it.id,{ descripcion:e.target.value })}/>
                      </td>
                      <td style={{ ...S.td, minWidth:'120px' }}>
                        <input style={S.inputSm} value={it.nombre_comercial ?? ''} onChange={e=>setItem(it.id,{ nombre_comercial:e.target.value })}/>
                      </td>
                      <td style={{ ...S.td, minWidth:'110px' }}>
                        <input style={S.inputSm} value={it.categoria ?? ''} onChange={e=>setItem(it.id,{ categoria:e.target.value })}/>
                      </td>
                      <td style={{ ...S.td, width:'80px' }}>
                        <input style={S.inputSm} type="number" value={it.cantidad ?? ''}
                               onChange={e=>{
                                 const cantidad = e.target.value === '' ? null : Number(e.target.value);
                                 const monto = cantidad !== null && it.precio_unitario ? Math.round(cantidad * Number(it.precio_unitario) * 100)/100 : it.monto;
                                 setItem(it.id,{ cantidad, monto });
                               }}/>
                      </td>
                      <td style={{ ...S.td, width:'70px' }}>
                        <input style={S.inputSm} value={it.unidad ?? ''} onChange={e=>setItem(it.id,{ unidad:e.target.value })}/>
                      </td>
                      <td style={{ ...S.td, width:'90px' }}>
                        <input style={S.inputSm} type="number" step="0.01" value={it.precio_unitario ?? ''}
                               onChange={e=>{
                                 const precio_unitario = e.target.value === '' ? null : Number(e.target.value);
                                 const monto = precio_unitario !== null && it.cantidad ? Math.round(precio_unitario * Number(it.cantidad) * 100)/100 : it.monto;
                                 setItem(it.id,{ precio_unitario, monto });
                               }}/>
                      </td>
                      <td style={{ ...S.td, width:'100px' }}>
                        <input style={S.inputSm} type="number" step="0.01" value={it.monto ?? ''}
                               onChange={e=>setItem(it.id,{ monto: e.target.value === '' ? null : Number(e.target.value) })}/>
                      </td>
                      <td style={{ ...S.td, width:'80px' }}>
                        <input style={S.inputSm} type="number" step="0.001" value={it.cbm ?? ''}
                               onChange={e=>setItem(it.id,{ cbm: e.target.value === '' ? null : Number(e.target.value) })}/>
                      </td>
                      <td style={{ ...S.td, width:'120px' }}>
                        <input style={S.inputSm} value={it.partida ?? ''} placeholder="—"
                               onChange={e=>setItem(it.id,{ partida:e.target.value })}/>
                        {it.dai_pct !== null && it.dai_pct !== undefined && (
                          <div style={{ fontSize:'0.68em', color: Number(it.dai_pct) > 0 ? '#DD6B20' : '#38A169', marginTop:'2px' }}>
                            DAI {Number(it.dai_pct)}%
                          </div>
                        )}
                      </td>
                      <td style={{ ...S.td, width:'30px' }}>
                        {it.origen === 'manual' && <span title="Cargada a mano">✍️</span>}
                        {it.origen === 'archivo' && it.editado && <span title="Corregida a mano">✏️</span>}
                      </td>
                      <td style={{ ...S.td, width:'34px' }}>
                        <button style={S.btnSm('#fff5f5')} onClick={()=>borrarLinea(it.id)}>🗑️</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display:'flex', gap:'18px', marginTop:'10px', fontSize:'0.82em', flexWrap:'wrap' }}>
              <span><strong>{numFmt(totalUnid)}</strong> unidades</span>
              <span><strong>{usd2(totalItems)}</strong> en mercadería</span>
              {totalCbm > 0 && <span><strong>{numFmt(totalCbm)}</strong> CBM</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
