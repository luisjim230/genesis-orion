'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { S, usd, usd2, numFmt } from './estilos';

// Todo lo que viene en camino, junto y buscable. Es la vista que responde
// "¿qué inodoros vienen?" o "¿cuántos metros de WPC hay en el mar?" sin tener
// que abrir contenedor por contenedor.

export default function Mercaderia() {
  const [filas, setFilas]     = useState([]);
  const [cargando, setCarg]   = useState(true);
  const [buscar, setBuscar]   = useState('');
  const [envioSel, setEnvio]  = useState('');
  const [catSel, setCat]      = useState('');

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('v_neptuno_transito').select('*').order('eta', { ascending:true });
      setFilas(data || []); setCarg(false);
    })();
  }, []);

  const envios = useMemo(() => [...new Set(filas.map(f => f.envio).filter(Boolean))].sort(), [filas]);
  const cats   = useMemo(() => [...new Set(filas.map(f => f.categoria).filter(Boolean))].sort(), [filas]);

  const filtradas = useMemo(() => {
    const q = buscar.trim().toLowerCase();
    return filas.filter(f => {
      if (envioSel && f.envio !== envioSel) return false;
      if (catSel && f.categoria !== catSel) return false;
      if (!q) return true;
      return [f.descripcion, f.nombre_comercial, f.item_no, f.categoria, f.color, f.envio, f.proveedor]
        .filter(Boolean).join(' ').toLowerCase().includes(q);
    });
  }, [filas, buscar, envioSel, catSel]);

  const totalValor = filtradas.reduce((s,f)=>s+(Number(f.monto)||0), 0);
  const totalUnid  = filtradas.reduce((s,f)=>s+(Number(f.cantidad)||0), 0);
  const totalCbm   = filtradas.reduce((s,f)=>s+(Number(f.cbm)||0), 0);

  // Resumen por categoría, ordenado por plata.
  const porCategoria = useMemo(() => {
    const m = new Map();
    for (const f of filtradas) {
      const k = f.categoria || 'Sin categoría';
      const a = m.get(k) || { cat:k, valor:0, unidades:0, lineas:0 };
      a.valor += Number(f.monto) || 0;
      a.unidades += Number(f.cantidad) || 0;
      a.lineas += 1;
      m.set(k, a);
    }
    return [...m.values()].sort((a,b)=>b.valor-a.valor);
  }, [filtradas]);

  if (cargando) return <div style={{ textAlign:'center', padding:'40px', color:'var(--text-muted)' }}>Cargando...</div>;

  if (!filas.length) {
    return (
      <div style={{ ...S.card, textAlign:'center', color:'var(--text-muted)', padding:'40px' }}>
        Todavía no hay mercadería cargada. Subí las proformas en la pestaña <strong>📎 Documentos</strong> y esto se llena solo.
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:'12px', marginBottom:'20px' }}>
        {[
          ['Líneas', numFmt(filtradas.length), '#63b3ed'],
          ['Unidades en camino', numFmt(totalUnid), '#b794f4'],
          ['Valor de mercadería', usd(totalValor), '#c8a84b'],
          ['CBM', numFmt(totalCbm), '#68d391'],
        ].map(([l,v,c]) => (
          <div key={l} style={S.kpi(c)}>
            <div style={S.mLabel}>{l}</div>
            <div style={S.metric}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display:'flex', gap:'10px', flexWrap:'wrap', marginBottom:'16px' }}>
        <input style={{ ...S.input, maxWidth:'320px' }} placeholder="🔍 Buscar producto, modelo, código..."
               value={buscar} onChange={e=>setBuscar(e.target.value)}/>
        <select style={{ ...S.input, maxWidth:'240px' }} value={envioSel} onChange={e=>setEnvio(e.target.value)}>
          <option value="">Todos los contenedores</option>
          {envios.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select style={{ ...S.input, maxWidth:'220px' }} value={catSel} onChange={e=>setCat(e.target.value)}>
          <option value="">Todas las categorías</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {porCategoria.length > 1 && (
        <div style={{ ...S.card, marginBottom:'16px' }}>
          <div style={S.seccion}>Por categoría</div>
          <div style={{ display:'flex', gap:'8px', flexWrap:'wrap' }}>
            {porCategoria.map(c => (
              <button key={c.cat} onClick={()=>setCat(catSel === c.cat ? '' : c.cat)}
                      style={{ ...S.btnSm(catSel === c.cat ? '#fff7e6' : '#fff'), textAlign:'left', padding:'8px 12px' }}>
                <div style={{ fontWeight:600 }}>{c.cat}</div>
                <div style={{ fontSize:'0.9em', color:'var(--text-muted)' }}>{usd(c.valor)} · {numFmt(c.unidades)} u.</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ ...S.card, overflowX:'auto' }}>
        <table style={{ ...S.table, minWidth:'900px' }}>
          <thead>
            <tr>
              {['Producto','Modelo','Categoría','Cant.','Unid.','P. unit.','Total','Contenedor','ETA','DAI'].map(h => (
                <th key={h} style={S.th}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map((f,i) => (
              <tr key={i}>
                <td style={{ ...S.td, maxWidth:'280px' }}>
                  <div>{f.descripcion || '—'}</div>
                  {(f.item_no || f.color) && (
                    <div style={{ fontSize:'0.85em', color:'var(--text-muted)' }}>
                      {[f.item_no, f.color, f.medida].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </td>
                <td style={S.td}>{f.nombre_comercial || '—'}</td>
                <td style={S.td}>{f.categoria || '—'}</td>
                <td style={{ ...S.td, fontWeight:600 }}>{numFmt(f.cantidad)}</td>
                <td style={S.td}>{f.unidad || '—'}</td>
                <td style={S.td}>{f.precio_unitario ? usd2(f.precio_unitario) : '—'}</td>
                <td style={{ ...S.td, fontWeight:600 }}>{usd(f.monto)}</td>
                <td style={S.td}>
                  <div>{f.envio}</div>
                  <div style={{ fontSize:'0.85em', color:'var(--text-muted)' }}>{f.estado}</div>
                </td>
                <td style={S.td}>{f.eta || '—'}</td>
                <td style={S.td}>
                  {f.dai_pct === null || f.dai_pct === undefined ? '—' : (
                    <span style={S.badge(Number(f.dai_pct) > 0 ? '#DD6B20' : '#38A169')}>{Number(f.dai_pct)}%</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtradas.length === 0 && (
          <div style={{ textAlign:'center', padding:'20px', color:'var(--text-muted)', fontSize:'0.85em' }}>
            Nada coincide con la búsqueda.
          </div>
        )}
      </div>
    </div>
  );
}
