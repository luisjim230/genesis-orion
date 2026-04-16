'use client';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../../lib/supabase';

// Sugerencias de conceptos frecuentes (el usuario puede escribir lo que quiera)
const SUGERENCIAS = ['N. Crédito', 'Transferencia', 'Chofer', 'Peajes', 'Gasolina', 'Encomienda', 'Desayuno', 'Almuerzo'];

const fmt = (n) => Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const today = () => new Date().toISOString().split('T')[0];

export default function PlanificacionDiaria({ usuario, esAdmin, esLegacy }) {
  const [fecha, setFecha] = useState(today());
  const [movimientos, setMovimientos] = useState([]);
  const [apertura, setApertura] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [historial, setHistorial] = useState([]);

  // Form para nuevo movimiento
  const [concepto, setConcepto] = useState('');
  const [msgGuardado, setMsgGuardado] = useState(null);
  const [descripcion, setDescripcion] = useState('');
  const [monto, setMonto] = useState('');
  const [responsable, setResponsable] = useState('');

  // Helper: filter records by owner
  // - esLegacy=true (rol 'laura') → también ve registros históricos (created_by='cajera'/null)
  // - esAdmin=true → ve todo
  // - Mientras usuario no carga → no muestra nada (evita flash de datos ajenos)
  const perteneceAlUsuario = (m) => {
    if (esAdmin) return true
    if (!usuario) return false // auth todavía cargando → no mostrar nada
    if (m.created_by === usuario) return true
    const esRegistroLegacy = !m.created_by || m.created_by === 'cajera'
    return esRegistroLegacy && esLegacy
  }

  const fetchDia = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('planificacion_diaria')
      .select('*')
      .eq('fecha', fecha)
      .order('created_at', { ascending: true });
    const filtrado = (data || []).filter(perteneceAlUsuario);
    setMovimientos(filtrado);
    if (filtrado.length > 0 && filtrado[0].apertura_siguiente) {
      setApertura(String(filtrado[0].apertura_siguiente));
    } else {
      setApertura('');
    }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha, usuario, esLegacy, esAdmin]);

  useEffect(() => { fetchDia(); }, [fetchDia]);

  // Cargar historial de los últimos 30 días
  useEffect(() => {
    (async () => {
      const hace30 = new Date();
      hace30.setDate(hace30.getDate() - 30);
      const { data } = await supabase
        .from('planificacion_diaria')
        .select('*')
        .gte('fecha', hace30.toISOString().split('T')[0])
        .order('fecha', { ascending: false })
        .order('created_at', { ascending: true });
      if (data) {
        // Filtrar por usuario y agrupar por fecha
        const grouped = {};
        data.filter(perteneceAlUsuario).forEach(m => {
          if (!grouped[m.fecha]) grouped[m.fecha] = [];
          grouped[m.fecha].push(m);
        });
        setHistorial(Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])));
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movimientos, usuario, esLegacy, esAdmin]);

  const agregar = async () => {
    if (!concepto.trim()) return;
    if (!monto || parseFloat(monto) === 0) return;
    setSaving(true);
    const { error } = await supabase.from('planificacion_diaria').insert({
      fecha,
      concepto,
      descripcion: descripcion || null,
      monto: parseFloat(monto),
      responsable: responsable || null,
      apertura_siguiente: parseFloat(apertura) || 0,
      created_by: usuario || 'cajera',
    });
    if (!error) {
      setDescripcion('');
      setMonto('');
      setResponsable('');
      await fetchDia();
    }
    setSaving(false);
  };

  const eliminar = async (id) => {
    await supabase.from('planificacion_diaria').delete().eq('id', id);
    await fetchDia();
  };

  const guardarApertura = async () => {
    const val = parseFloat(apertura) || 0;
    if (movimientos.length > 0) {
      for (const m of movimientos) {
        await supabase.from('planificacion_diaria').update({ apertura_siguiente: val }).eq('id', m.id);
      }
    } else {
      // Si no hay movimientos, crear uno de tipo "Apertura" para guardar el valor
      await supabase.from('planificacion_diaria').insert({
        fecha,
        concepto: 'Apertura',
        descripcion: 'Apertura día siguiente',
        monto: 0,
        apertura_siguiente: val,
        created_by: usuario || 'cajera',
      });
      await fetchDia();
    }
    setMsgGuardado('Apertura guardada correctamente');
    setTimeout(() => setMsgGuardado(null), 3000);
  };

  // Totales por concepto
  const totales = {};
  let totalGeneral = 0;
  movimientos.forEach(m => {
    const c = m.concepto || 'Otro';
    totales[c] = (totales[c] || 0) + Number(m.monto || 0);
    totalGeneral += Number(m.monto || 0);
  });

  const S = {
    card: { background:'rgba(255,255,255,0.55)', backdropFilter:'blur(24px) saturate(1.8)', WebkitBackdropFilter:'blur(24px) saturate(1.8)', border:'1px solid rgba(255,255,255,0.6)', borderRadius:20, padding:'20px', marginBottom:'16px', boxShadow:'0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' },
    input: { background:'rgba(255,255,255,0.5)', border:'1px solid rgba(0,0,0,0.1)', borderRadius:8, color:'rgba(0,0,0,0.8)', padding:'8px 12px', fontSize:'0.9rem', width:'100%', outline:'none', boxSizing:'border-box' },
    select: { background:'rgba(255,255,255,0.5)', border:'1px solid rgba(0,0,0,0.1)', borderRadius:8, color:'rgba(0,0,0,0.8)', padding:'8px 12px', fontSize:'0.9rem', width:'100%', outline:'none' },
    label: { fontSize:'0.78rem', color:'rgba(0,0,0,0.45)', marginBottom:'4px', display:'block', fontWeight:600 },
    btn: { background:'linear-gradient(135deg, #c8a84b, #a08930)', color:'#fff', border:'none', borderRadius:10, padding:'10px 20px', fontWeight:700, cursor:'pointer', fontSize:'0.9rem' },
    btnDel: { background:'rgba(239,68,68,0.08)', color:'#dc2626', border:'1px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'4px 10px', cursor:'pointer', fontSize:'0.78rem', fontWeight:600 },
    th: { background:'rgba(255,255,255,0.35)', color:'rgba(0,0,0,0.45)', padding:'10px 12px', textAlign:'left', borderBottom:'1px solid rgba(0,0,0,0.08)', fontWeight:600, fontSize:'0.78rem', textTransform:'uppercase', letterSpacing:'0.04em' },
    td: { padding:'10px 12px', borderBottom:'1px solid rgba(0,0,0,0.05)', fontSize:'0.88rem', color:'rgba(0,0,0,0.75)' },
    badge: (color) => ({ display:'inline-block', background:`${color}18`, color, padding:'2px 10px', borderRadius:20, fontSize:'0.78rem', fontWeight:600 }),
  };

  const conceptoColor = {
    'N. Crédito': '#2563eb',
    'Transferencia': '#7c3aed',
    'Chofer': '#0891b2',
    'Peajes': '#ca8a04',
    'Gasolina': '#dc2626',
    'Encomienda': '#059669',
    'Desayuno/Almuerzo': '#ea580c',
    'Otro': '#6b7280',
  };

  return (
    <div>
      {/* Encabezado: fecha + apertura */}
      <div style={S.card}>
        <div style={{ display:'flex', gap:16, alignItems:'flex-end', flexWrap:'wrap' }}>
          <div>
            <div style={S.label}>Fecha</div>
            <input type="date" style={{ ...S.input, width:180 }} value={fecha} onChange={e => setFecha(e.target.value)} />
          </div>
          <div>
            <div style={S.label}>Apertura día siguiente (CRC)</div>
            <div style={{ display:'flex', gap:8 }}>
              <input type="number" style={{ ...S.input, width:150 }} value={apertura} onChange={e => setApertura(e.target.value)} placeholder="8000" />
              <button style={{ ...S.btn, padding:'8px 14px', fontSize:'0.82rem' }} onClick={guardarApertura}>Guardar</button>
              {msgGuardado && <span style={{ fontSize:'0.82rem', color:'#15803d', fontWeight:600 }}>{msgGuardado}</span>}
            </div>
          </div>
          <div style={{ flex:1, textAlign:'right' }}>
            <div style={{ fontSize:'0.78rem', color:'rgba(0,0,0,0.4)' }}>Total del día</div>
            <div style={{ fontSize:'1.6rem', fontWeight:700, color:'#c8a84b' }}>₡{fmt(totalGeneral)}</div>
          </div>
        </div>
      </div>

      {/* Resumen por concepto */}
      {Object.keys(totales).length > 0 && (
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16 }}>
          {Object.entries(totales).map(([c, t]) => (
            <div key={c} style={{ ...S.card, padding:'12px 18px', flex:'0 0 auto', marginBottom:0 }}>
              <div style={{ fontSize:'0.72rem', color:'rgba(0,0,0,0.4)', marginBottom:4 }}>{c}</div>
              <div style={{ fontSize:'1.1rem', fontWeight:700, color: conceptoColor[c] || '#333' }}>₡{fmt(t)}</div>
              <div style={{ fontSize:'0.72rem', color:'rgba(0,0,0,0.3)' }}>{movimientos.filter(m => m.concepto === c).length} mov.</div>
            </div>
          ))}
        </div>
      )}

      {/* Formulario nuevo movimiento */}
      <div style={S.card}>
        <div style={{ fontSize:'0.88rem', fontWeight:700, color:'rgba(0,0,0,0.7)', marginBottom:14 }}>Agregar movimiento</div>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr auto', gap:12, alignItems:'flex-end' }}>
          <div>
            <div style={S.label}>Concepto</div>
            <input list="conceptos-list" style={S.input} value={concepto} onChange={e => setConcepto(e.target.value)} placeholder="Ej: N. Crédito, Transf..." />
            <datalist id="conceptos-list">
              {SUGERENCIAS.map(c => <option key={c} value={c} />)}
            </datalist>
          </div>
          <div>
            <div style={S.label}>Descripción</div>
            <input style={S.input} value={descripcion} onChange={e => setDescripcion(e.target.value)} placeholder="Ej: #9768, Olman..." />
          </div>
          <div>
            <div style={S.label}>Monto (CRC)</div>
            <input type="number" style={S.input} value={monto} onChange={e => setMonto(e.target.value)} placeholder="0"
              onKeyDown={e => { if (e.key === 'Enter') agregar(); }} />
          </div>
          <div>
            <div style={S.label}>Responsable</div>
            <input style={S.input} value={responsable} onChange={e => setResponsable(e.target.value)} placeholder="Nombre o firma" />
          </div>
          <button style={S.btn} onClick={agregar} disabled={saving}>{saving ? '...' : '+ Agregar'}</button>
        </div>
      </div>

      {/* Tabla de movimientos del día seleccionado */}
      <div style={S.card}>
        {loading ? (
          <div style={{ textAlign:'center', color:'rgba(0,0,0,0.3)', padding:40 }}>Cargando...</div>
        ) : movimientos.length === 0 ? (
          <div style={{ textAlign:'center', color:'rgba(0,0,0,0.3)', padding:40 }}>No hay movimientos para esta fecha</div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead>
                <tr>
                  <th style={S.th}>#</th>
                  <th style={S.th}>Concepto</th>
                  <th style={S.th}>Descripción</th>
                  <th style={{ ...S.th, textAlign:'right' }}>Monto</th>
                  <th style={S.th}>Responsable</th>
                  <th style={S.th}>Obs.</th>
                  <th style={{ ...S.th, width:60 }}></th>
                </tr>
              </thead>
              <tbody>
                {movimientos.map((m, i) => (
                  <tr key={m.id}>
                    <td style={{ ...S.td, color:'rgba(0,0,0,0.3)', fontSize:'0.78rem' }}>{i + 1}</td>
                    <td style={S.td}>
                      <span style={S.badge(conceptoColor[m.concepto] || '#6b7280')}>{m.concepto}</span>
                    </td>
                    <td style={S.td}>{m.descripcion || '—'}</td>
                    <td style={{ ...S.td, textAlign:'right', fontWeight:700, color:'rgba(0,0,0,0.85)' }}>₡{fmt(m.monto)}</td>
                    <td style={S.td}>{m.responsable || '—'}</td>
                    <td style={{ ...S.td, fontSize:'0.78rem', color:'rgba(0,0,0,0.4)' }}>{m.observaciones || ''}</td>
                    <td style={S.td}>
                      {esAdmin && <button style={S.btnDel} onClick={() => eliminar(m.id)}>✕</button>}
                    </td>
                  </tr>
                ))}
                <tr style={{ background:'rgba(200,168,75,0.06)' }}>
                  <td colSpan={3} style={{ ...S.td, fontWeight:700, textAlign:'right', color:'rgba(0,0,0,0.5)' }}>TOTAL</td>
                  <td style={{ ...S.td, textAlign:'right', fontWeight:700, fontSize:'1.05rem', color:'#c8a84b' }}>₡{fmt(totalGeneral)}</td>
                  <td colSpan={3} style={S.td}></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Historial de días — tarjetas como en Cierre de Caja */}
      {historial.length > 0 && (
        <div>
          <div style={{ fontSize:'0.78rem', fontWeight:700, color:'rgba(0,0,0,0.35)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12, marginTop:8 }}>
            Historial — últimos 30 días · {historial.length} registros
          </div>
          {historial.map(([fechaH, movs]) => {
            const totH = {};
            let totalH = 0;
            movs.forEach(m => {
              if (m.monto > 0) {
                totH[m.concepto] = (totH[m.concepto] || 0) + Number(m.monto);
                totalH += Number(m.monto);
              }
            });
            const aperturaH = movs[0]?.apertura_siguiente || 0;
            const fechaObj = new Date(fechaH + 'T12:00:00');
            const dia = fechaObj.toLocaleDateString('es-CR', { weekday:'long', day:'numeric', month:'long' });
            const esHoy = fechaH === today();
            return (
              <div key={fechaH} style={{ ...S.card, cursor:'pointer', border: esHoy ? '2px solid #c8a84b' : S.card.border }}
                onClick={() => setFecha(fechaH)}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <div style={{ fontWeight:700, fontSize:'0.92rem', color:'rgba(0,0,0,0.8)' }}>
                    {dia}{esHoy && <span style={{ marginLeft:8, fontSize:'0.72rem', color:'#c8a84b', fontWeight:600 }}>HOY</span>}
                  </div>
                  <div style={{ fontSize:'1.1rem', fontWeight:700, color:'#c8a84b' }}>₡{fmt(totalH)}</div>
                </div>
                <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                  {Object.entries(totH).map(([c, t]) => (
                    <div key={c} style={{ fontSize:'0.78rem' }}>
                      <span style={{ color:'rgba(0,0,0,0.4)' }}>{c}</span>
                      <span style={{ marginLeft:6, fontWeight:700, color: conceptoColor[c] || '#333' }}>₡{fmt(t)}</span>
                      <span style={{ marginLeft:4, color:'rgba(0,0,0,0.25)', fontSize:'0.72rem' }}>{movs.filter(m => m.concepto === c).length} mov.</span>
                    </div>
                  ))}
                </div>
                {aperturaH > 0 && (
                  <div style={{ marginTop:8, fontSize:'0.75rem', color:'rgba(0,0,0,0.35)' }}>
                    Apertura día siguiente: ₡{fmt(aperturaH)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
