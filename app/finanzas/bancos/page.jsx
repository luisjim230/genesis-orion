'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

// Bancos agrupados - cada uno tiene cuenta CRC y USD
const BANCOS = [
  { key: 'BAC',  nombre: 'BAC San José',        color: '#C8102E', emoji: '🏦' },
  { key: 'BN',   nombre: 'Banco Nacional',      color: '#006341', emoji: '🏦' },
  { key: 'BCR',  nombre: 'Banco de Costa Rica', color: '#003DA5', emoji: '🏦' },
  { key: 'DAVI', nombre: 'Davivienda',          color: '#DA291C', emoji: '🏦' },
  { key: 'CASH', nombre: 'Efectivo',            color: '#5E2733', emoji: '💵' },
];

function formatCRC(value) {
  if (!value && value !== 0) return '₡0';
  return '₡' + Number(value).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function formatUSD(value) {
  if (!value && value !== 0) return '$0.00';
  return '$' + Number(value).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatFecha(value) {
  if (!value) return '';
  const d = new Date(value + 'T12:00:00');
  return d.toLocaleDateString('es-CR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function diasRestantes(fechaVenc) {
  if (!fechaVenc) return null;
  const hoy = new Date(); hoy.setHours(0,0,0,0);
  const venc = new Date(fechaVenc + 'T12:00:00');
  return Math.ceil((venc - hoy) / (1000 * 60 * 60 * 24));
}

export default function BancosPage() {
  const [cuentas, setCuentas] = useState([]);
  const [inversiones, setInversiones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null); // 'BAC_CRC' o 'BAC_USD'
  const [tempSaldo, setTempSaldo] = useState('');
  const [tempNotas, setTempNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  // Estado para nueva inversión
  const [nuevaInv, setNuevaInv] = useState(null); // { banco_key, moneda } o null
  const [invDescripcion, setInvDescripcion] = useState('');
  const [invMonto, setInvMonto] = useState('');
  const [invFecha, setInvFecha] = useState('');
  const [invNotas, setInvNotas] = useState('');

  // Estado para edición de inversión
  const [editInvId, setEditInvId] = useState(null);

  useEffect(() => { cargarTodo(); }, []);

  async function cargarTodo() {
    setLoading(true);
    await Promise.all([cargarCuentas(), cargarInversiones()]);
    setLoading(false);
  }

  async function cargarCuentas() {
    const { data, error } = await supabase.from('fin_bancos').select('*').order('id');
    if (!error && data) setCuentas(data);
  }

  async function cargarInversiones() {
    const { data, error } = await supabase
      .from('fin_bancos_inversiones')
      .select('*')
      .order('fecha_vencimiento', { ascending: true, nullsFirst: false });
    if (!error && data) setInversiones(data);
  }

  function getCuenta(bancoKey, moneda) {
    return cuentas.find(c => c.cuenta_codigo === bancoKey + '_' + moneda) || {};
  }

  function iniciarEdicion(codigo, saldo, notas) {
    setEditando(codigo);
    setTempSaldo(saldo || '');
    setTempNotas(notas || '');
  }

  function cancelarEdicion() {
    setEditando(null);
    setTempSaldo('');
    setTempNotas('');
  }

  async function guardar(codigo) {
    setGuardando(true);
    const saldoNum = parseFloat(String(tempSaldo).replace(/[^\d.-]/g, '')) || 0;
    const { error } = await supabase
      .from('fin_bancos')
      .update({ saldo: saldoNum, notas: tempNotas, updated_at: new Date().toISOString() })
      .eq('cuenta_codigo', codigo);

    if (!error) {
      mostrarMensaje('✅ Guardado', 'ok');
      setEditando(null);
      await cargarCuentas();
    } else {
      mostrarMensaje('❌ Error al guardar', 'err');
    }
    setGuardando(false);
  }

  function abrirNuevaInversion(banco_key, moneda) {
    setNuevaInv({ banco_key, moneda });
    setEditInvId(null);
    setInvDescripcion('');
    setInvMonto('');
    setInvFecha('');
    setInvNotas('');
  }

  function abrirEditarInversion(inv) {
    setEditInvId(inv.id);
    setNuevaInv(null);
    setInvDescripcion(inv.descripcion || '');
    setInvMonto(inv.monto || '');
    setInvFecha(inv.fecha_vencimiento || '');
    setInvNotas(inv.notas || '');
  }

  function cancelarInv() {
    setNuevaInv(null);
    setEditInvId(null);
    setInvDescripcion('');
    setInvMonto('');
    setInvFecha('');
    setInvNotas('');
  }

  async function guardarInversion() {
    setGuardando(true);
    const montoNum = parseFloat(String(invMonto).replace(/[^\d.-]/g, '')) || 0;
    const payload = {
      descripcion: invDescripcion || null,
      monto: montoNum,
      fecha_vencimiento: invFecha || null,
      notas: invNotas || null,
      updated_at: new Date().toISOString(),
    };

    let error;
    if (editInvId) {
      ({ error } = await supabase.from('fin_bancos_inversiones').update(payload).eq('id', editInvId));
    } else if (nuevaInv) {
      ({ error } = await supabase.from('fin_bancos_inversiones').insert({
        ...payload,
        banco_key: nuevaInv.banco_key,
        moneda: nuevaInv.moneda,
      }));
    }

    if (!error) {
      mostrarMensaje('✅ Guardado', 'ok');
      cancelarInv();
      await cargarInversiones();
    } else {
      mostrarMensaje('❌ Error al guardar', 'err');
    }
    setGuardando(false);
  }

  async function eliminarInversion(id) {
    if (!confirm('¿Eliminar esta inversión?')) return;
    const { error } = await supabase.from('fin_bancos_inversiones').delete().eq('id', id);
    if (!error) {
      mostrarMensaje('✅ Eliminada', 'ok');
      await cargarInversiones();
    } else {
      mostrarMensaje('❌ Error al eliminar', 'err');
    }
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 3000);
  }

  function getInversiones(bancoKey, moneda) {
    return inversiones.filter(i => i.banco_key === bancoKey && i.moneda === moneda);
  }

  const totalLiquidoCRC = cuentas.filter(c => c.moneda === 'CRC').reduce((s, c) => s + Number(c.saldo || 0), 0);
  const totalLiquidoUSD = cuentas.filter(c => c.moneda === 'USD').reduce((s, c) => s + Number(c.saldo || 0), 0);
  const totalInvCRC = inversiones.filter(i => i.moneda === 'CRC').reduce((s, i) => s + Number(i.monto || 0), 0);
  const totalInvUSD = inversiones.filter(i => i.moneda === 'USD').reduce((s, i) => s + Number(i.monto || 0), 0);
  const totalCRC = totalLiquidoCRC + totalInvCRC;
  const totalUSD = totalLiquidoUSD + totalInvUSD;

  if (loading) return (
    <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontFamily: 'DM Sans, sans-serif' }}>
      Cargando cuentas...
    </div>
  );

  return (
    <div style={{ padding: '32px 28px', fontFamily: 'DM Sans, sans-serif', maxWidth: '900px', margin: '0 auto' }}>

      {/* Header */}
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>
          💰 Posición de Bancos
        </h1>
        <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0' }}>
          Saldos en colones y dólares por cuenta
        </p>
      </div>

      {/* Toast */}
      {mensaje && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
          background: mensaje.tipo === 'ok' ? '#e6f4ea' : '#fdecea',
          color: mensaje.tipo === 'ok' ? '#2e7d32' : '#c62828',
          border: `1px solid ${mensaje.tipo === 'ok' ? '#a5d6a7' : '#ef9a9a'}`,
          borderRadius: '10px', padding: '12px 20px', fontWeight: '600',
          fontSize: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {mensaje.texto}
        </div>
      )}

      {/* Header columnas */}
      <div style={{
        display: 'grid', gridTemplateColumns: '200px 1fr 1fr',
        padding: '0 20px 8px', gap: '12px',
      }}>
        <div />
        <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: '700', color: '#888', letterSpacing: '0.05em' }}>
          COLONES (₡)
        </div>
        <div style={{ textAlign: 'center', fontSize: '12px', fontWeight: '700', color: '#888', letterSpacing: '0.05em' }}>
          DÓLARES ($)
        </div>
      </div>

      {/* Subtítulo: Líquido */}
      <div style={{ fontSize:'11px', fontWeight:700, color:'#888', letterSpacing:'0.08em', margin:'4px 4px 8px' }}>
        SALDOS LÍQUIDOS
      </div>

      {/* Filas por banco */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {BANCOS.map(banco => {
          const crc = getCuenta(banco.key, 'CRC');
          const usd = getCuenta(banco.key, 'USD');
          const editCRC = editando === banco.key + '_CRC';
          const editUSD = editando === banco.key + '_USD';

          return (
            <div key={banco.key} style={{
              display: 'grid', gridTemplateColumns: '200px 1fr 1fr',
              gap: '12px', alignItems: 'stretch',
            }}>
              {/* Nombre del banco */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                background: '#fff', borderRadius: '12px', padding: '16px 18px',
                border: '2px solid #eee',
              }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  background: banco.color + '18',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '18px', flexShrink: 0,
                }}>
                  {banco.emoji}
                </div>
                <div style={{ fontWeight: '700', fontSize: '14px', color: '#1a1a1a', lineHeight: '1.2' }}>
                  {banco.nombre}
                </div>
              </div>

              {/* CRC */}
              <div style={{
                background: '#fff', borderRadius: '12px', padding: '16px 18px',
                border: editCRC ? `2px solid ${banco.color}` : '2px solid #eee',
                transition: 'border 0.2s',
              }}>
                {editCRC ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="number"
                      value={tempSaldo}
                      onChange={e => setTempSaldo(e.target.value)}
                      placeholder="0"
                      autoFocus
                      style={{
                        width: '100%', padding: '8px 10px', border: '1.5px solid #ddd',
                        borderRadius: '8px', fontSize: '15px', fontWeight: '600',
                        fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
                      }}
                    />
                    <input
                      type="text"
                      value={tempNotas}
                      onChange={e => setTempNotas(e.target.value)}
                      placeholder="Notas (opcional)"
                      style={{
                        width: '100%', padding: '7px 10px', border: '1.5px solid #ddd',
                        borderRadius: '8px', fontSize: '12px', color: '#555',
                        fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => guardar(banco.key + '_CRC')} disabled={guardando}
                        style={{ flex: 1, padding: '7px', background: '#5E2733', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                        {guardando ? '...' : '✓ Guardar'}
                      </button>
                      <button onClick={cancelarEdicion}
                        style={{ padding: '7px 12px', background: '#f5f5f5', color: '#666', border: 'none', borderRadius: '7px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{
                        fontSize: '20px', fontWeight: '700',
                        color: Number(crc.saldo) === 0 ? '#ccc' : '#1a1a1a',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {formatCRC(crc.saldo)}
                      </div>
                      {crc.notas && <div style={{ fontSize: '11px', color: '#bbb', marginTop: '2px' }}>{crc.notas}</div>}
                      {crc.updated_at && <div style={{ fontSize: '10px', color: '#ddd', marginTop: '2px' }}>
                        {new Date(crc.updated_at).toLocaleDateString('es-CR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </div>}
                    </div>
                    <button onClick={() => iniciarEdicion(banco.key + '_CRC', crc.saldo, crc.notas)}
                      style={{ padding: '6px 10px', background: '#f8f1f2', color: '#5E2733', border: '1.5px solid #e8d0d3', borderRadius: '7px', fontWeight: '600', fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>
                      ✏️
                    </button>
                  </div>
                )}
              </div>

              {/* USD */}
              <div style={{
                background: '#fff', borderRadius: '12px', padding: '16px 18px',
                border: editUSD ? `2px solid ${banco.color}` : '2px solid #eee',
                transition: 'border 0.2s',
              }}>
                {editUSD ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <input
                      type="number"
                      value={tempSaldo}
                      onChange={e => setTempSaldo(e.target.value)}
                      placeholder="0.00"
                      autoFocus
                      style={{
                        width: '100%', padding: '8px 10px', border: '1.5px solid #ddd',
                        borderRadius: '8px', fontSize: '15px', fontWeight: '600',
                        fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
                      }}
                    />
                    <input
                      type="text"
                      value={tempNotas}
                      onChange={e => setTempNotas(e.target.value)}
                      placeholder="Notas (opcional)"
                      style={{
                        width: '100%', padding: '7px 10px', border: '1.5px solid #ddd',
                        borderRadius: '8px', fontSize: '12px', color: '#555',
                        fontFamily: 'DM Sans, sans-serif', boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button onClick={() => guardar(banco.key + '_USD')} disabled={guardando}
                        style={{ flex: 1, padding: '7px', background: '#5E2733', color: '#fff', border: 'none', borderRadius: '7px', fontWeight: '700', fontSize: '13px', cursor: 'pointer' }}>
                        {guardando ? '...' : '✓ Guardar'}
                      </button>
                      <button onClick={cancelarEdicion}
                        style={{ padding: '7px 12px', background: '#f5f5f5', color: '#666', border: 'none', borderRadius: '7px', fontWeight: '600', fontSize: '13px', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{
                        fontSize: '20px', fontWeight: '700',
                        color: Number(usd.saldo) === 0 ? '#ccc' : '#1a1a1a',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {formatUSD(usd.saldo)}
                      </div>
                      {usd.notas && <div style={{ fontSize: '11px', color: '#bbb', marginTop: '2px' }}>{usd.notas}</div>}
                      {usd.updated_at && <div style={{ fontSize: '10px', color: '#ddd', marginTop: '2px' }}>
                        {new Date(usd.updated_at).toLocaleDateString('es-CR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                      </div>}
                    </div>
                    <button onClick={() => iniciarEdicion(banco.key + '_USD', usd.saldo, usd.notas)}
                      style={{ padding: '6px 10px', background: '#f8f1f2', color: '#5E2733', border: '1.5px solid #e8d0d3', borderRadius: '7px', fontWeight: '600', fontSize: '12px', cursor: 'pointer', flexShrink: 0 }}>
                      ✏️
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── Sección Inversiones ─── */}
      <div style={{ fontSize:'11px', fontWeight:700, color:'#888', letterSpacing:'0.08em', margin:'28px 4px 8px' }}>
        INVERSIONES (CDP, plazos fijos, etc.)
      </div>

      <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
        {BANCOS.map(banco => {
          const invsCRC = getInversiones(banco.key, 'CRC');
          const invsUSD = getInversiones(banco.key, 'USD');
          if (invsCRC.length === 0 && invsUSD.length === 0 &&
              nuevaInv?.banco_key !== banco.key) return null;

          return (
            <div key={'inv-' + banco.key} style={{
              background:'#fafafa', borderRadius:'12px', padding:'14px 16px',
              border:'1.5px dashed #e0e0e0',
            }}>
              <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px' }}>
                <div style={{
                  width:'28px', height:'28px', borderRadius:'7px',
                  background: banco.color + '18',
                  display:'flex', alignItems:'center', justifyContent:'center',
                  fontSize:'14px',
                }}>{banco.emoji}</div>
                <div style={{ fontWeight:700, fontSize:'13px', color:'#1a1a1a' }}>
                  {banco.nombre} — Inversiones
                </div>
              </div>

              {[...invsCRC, ...invsUSD].map(inv => {
                const dias = diasRestantes(inv.fecha_vencimiento);
                const porVencer = dias !== null && dias <= 30 && dias >= 0;
                const vencida = dias !== null && dias < 0;
                const colorBadge = vencida ? '#c62828' : porVencer ? '#b7791f' : '#276749';
                const fmt = inv.moneda === 'USD' ? formatUSD : formatCRC;
                const isEditing = editInvId === inv.id;

                if (isEditing) {
                  return (
                    <div key={inv.id} style={{
                      background:'#fff', borderRadius:'10px', padding:'12px',
                      border:`2px solid ${banco.color}`, marginBottom:'8px',
                      display:'flex', flexDirection:'column', gap:'8px',
                    }}>
                      <input type="text" value={invDescripcion}
                        onChange={e => setInvDescripcion(e.target.value)}
                        placeholder="Descripción (ej. CDP 6 meses)"
                        style={{ padding:'8px 10px', border:'1.5px solid #ddd', borderRadius:'8px', fontSize:'13px', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
                      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                        <input type="number" value={invMonto}
                          onChange={e => setInvMonto(e.target.value)}
                          placeholder={`Monto ${inv.moneda}`}
                          style={{ padding:'8px 10px', border:'1.5px solid #ddd', borderRadius:'8px', fontSize:'14px', fontWeight:600, fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
                        <input type="date" value={invFecha}
                          onChange={e => setInvFecha(e.target.value)}
                          style={{ padding:'8px 10px', border:'1.5px solid #ddd', borderRadius:'8px', fontSize:'13px', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
                      </div>
                      <input type="text" value={invNotas}
                        onChange={e => setInvNotas(e.target.value)}
                        placeholder="Notas (opcional)"
                        style={{ padding:'7px 10px', border:'1.5px solid #ddd', borderRadius:'8px', fontSize:'12px', color:'#555', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
                      <div style={{ display:'flex', gap:'6px' }}>
                        <button onClick={guardarInversion} disabled={guardando}
                          style={{ flex:1, padding:'8px', background:'#5E2733', color:'#fff', border:'none', borderRadius:'7px', fontWeight:700, fontSize:'13px', cursor:'pointer' }}>
                          {guardando ? '...' : '✓ Guardar'}
                        </button>
                        <button onClick={() => eliminarInversion(inv.id)}
                          style={{ padding:'8px 12px', background:'#fdecea', color:'#c62828', border:'none', borderRadius:'7px', fontWeight:600, fontSize:'13px', cursor:'pointer' }}>
                          🗑
                        </button>
                        <button onClick={cancelarInv}
                          style={{ padding:'8px 12px', background:'#f5f5f5', color:'#666', border:'none', borderRadius:'7px', fontWeight:600, fontSize:'13px', cursor:'pointer' }}>
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={inv.id} style={{
                    background:'#fff', borderRadius:'10px', padding:'12px 14px',
                    border:'1.5px solid #eee', marginBottom:'8px',
                    display:'grid', gridTemplateColumns:'1fr auto auto', gap:'12px', alignItems:'center',
                  }}>
                    <div>
                      <div style={{ fontSize:'13px', fontWeight:700, color:'#1a1a1a' }}>
                        {inv.descripcion || 'Inversión'}
                      </div>
                      {inv.notas && <div style={{ fontSize:'11px', color:'#888', marginTop:'2px' }}>{inv.notas}</div>}
                      {inv.fecha_vencimiento && (
                        <div style={{ fontSize:'11px', color:colorBadge, marginTop:'4px', fontWeight:600 }}>
                          Vence {formatFecha(inv.fecha_vencimiento)}
                          {dias !== null && (
                            <span style={{ marginLeft:'6px', color:colorBadge }}>
                              ({vencida ? `vencida hace ${-dias}d` : dias === 0 ? 'hoy' : `en ${dias}d`})
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                    <div style={{ fontSize:'17px', fontWeight:700, color:'#1a1a1a', fontVariantNumeric:'tabular-nums' }}>
                      {fmt(inv.monto)}
                    </div>
                    <button onClick={() => abrirEditarInversion(inv)}
                      style={{ padding:'6px 10px', background:'#f8f1f2', color:'#5E2733', border:'1.5px solid #e8d0d3', borderRadius:'7px', fontWeight:600, fontSize:'12px', cursor:'pointer' }}>
                      ✏️
                    </button>
                  </div>
                );
              })}

              {/* Form nueva inversión */}
              {nuevaInv?.banco_key === banco.key && (
                <div style={{
                  background:'#fff', borderRadius:'10px', padding:'12px',
                  border:`2px solid ${banco.color}`, marginBottom:'8px',
                  display:'flex', flexDirection:'column', gap:'8px',
                }}>
                  <div style={{ display:'flex', gap:'6px', marginBottom:'2px' }}>
                    <button onClick={() => setNuevaInv({ ...nuevaInv, moneda:'CRC' })}
                      style={{ flex:1, padding:'6px', background: nuevaInv.moneda==='CRC' ? banco.color : '#f5f5f5', color: nuevaInv.moneda==='CRC' ? '#fff' : '#666', border:'none', borderRadius:'6px', fontWeight:700, fontSize:'12px', cursor:'pointer' }}>
                      ₡ Colones
                    </button>
                    <button onClick={() => setNuevaInv({ ...nuevaInv, moneda:'USD' })}
                      style={{ flex:1, padding:'6px', background: nuevaInv.moneda==='USD' ? banco.color : '#f5f5f5', color: nuevaInv.moneda==='USD' ? '#fff' : '#666', border:'none', borderRadius:'6px', fontWeight:700, fontSize:'12px', cursor:'pointer' }}>
                      $ Dólares
                    </button>
                  </div>
                  <input type="text" value={invDescripcion}
                    onChange={e => setInvDescripcion(e.target.value)}
                    placeholder="Descripción (ej. CDP 6 meses)"
                    autoFocus
                    style={{ padding:'8px 10px', border:'1.5px solid #ddd', borderRadius:'8px', fontSize:'13px', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'8px' }}>
                    <input type="number" value={invMonto}
                      onChange={e => setInvMonto(e.target.value)}
                      placeholder={`Monto ${nuevaInv.moneda}`}
                      style={{ padding:'8px 10px', border:'1.5px solid #ddd', borderRadius:'8px', fontSize:'14px', fontWeight:600, fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
                    <input type="date" value={invFecha}
                      onChange={e => setInvFecha(e.target.value)}
                      style={{ padding:'8px 10px', border:'1.5px solid #ddd', borderRadius:'8px', fontSize:'13px', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
                  </div>
                  <input type="text" value={invNotas}
                    onChange={e => setInvNotas(e.target.value)}
                    placeholder="Notas (opcional)"
                    style={{ padding:'7px 10px', border:'1.5px solid #ddd', borderRadius:'8px', fontSize:'12px', color:'#555', fontFamily:'DM Sans, sans-serif', boxSizing:'border-box' }} />
                  <div style={{ display:'flex', gap:'6px' }}>
                    <button onClick={guardarInversion} disabled={guardando}
                      style={{ flex:1, padding:'8px', background:'#5E2733', color:'#fff', border:'none', borderRadius:'7px', fontWeight:700, fontSize:'13px', cursor:'pointer' }}>
                      {guardando ? '...' : '✓ Guardar'}
                    </button>
                    <button onClick={cancelarInv}
                      style={{ padding:'8px 12px', background:'#f5f5f5', color:'#666', border:'none', borderRadius:'7px', fontWeight:600, fontSize:'13px', cursor:'pointer' }}>
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {nuevaInv?.banco_key !== banco.key && editInvId === null && (
                <button onClick={() => abrirNuevaInversion(banco.key, 'CRC')}
                  style={{ width:'100%', padding:'8px', background:'#fff', color: banco.color, border:`1.5px dashed ${banco.color}55`, borderRadius:'8px', fontWeight:600, fontSize:'12px', cursor:'pointer' }}>
                  + Agregar inversión
                </button>
              )}
            </div>
          );
        })}

        {/* Botones para agregar inversión a bancos sin inversiones todavía */}
        {(() => {
          const sinInv = BANCOS.filter(b =>
            getInversiones(b.key,'CRC').length===0 &&
            getInversiones(b.key,'USD').length===0 &&
            nuevaInv?.banco_key !== b.key
          );
          if (sinInv.length === 0) return null;
          return (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(170px, 1fr))', gap:'8px', marginTop: BANCOS.some(b => getInversiones(b.key,'CRC').length>0||getInversiones(b.key,'USD').length>0) ? '4px' : '0' }}>
              {sinInv.map(b => (
                <button key={'add-' + b.key} onClick={() => abrirNuevaInversion(b.key, 'CRC')}
                  style={{ padding:'10px', background:'#fff', color:b.color, border:`1.5px dashed ${b.color}55`, borderRadius:'10px', fontWeight:600, fontSize:'12px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:'6px' }}>
                  <span>{b.emoji}</span>
                  <span>+ {b.nombre}</span>
                </button>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Totales */}
      <div style={{
        marginTop: '24px', background: '#5E2733', borderRadius: '14px',
        padding: '20px 24px',
      }}>
        <div style={{
          display:'grid', gridTemplateColumns:'200px 1fr 1fr', gap:'12px',
          alignItems:'center', paddingBottom:'14px',
          borderBottom:'1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ color:'rgba(255,255,255,0.5)', fontSize:'11px', fontWeight:700, letterSpacing:'0.08em' }}>
            LÍQUIDO
          </div>
          <div style={{ textAlign:'center', color:'rgba(255,255,255,0.85)', fontSize:'15px', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>
            {formatCRC(totalLiquidoCRC)}
          </div>
          <div style={{ textAlign:'center', color:'rgba(255,255,255,0.85)', fontSize:'15px', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>
            {formatUSD(totalLiquidoUSD)}
          </div>
        </div>

        <div style={{
          display:'grid', gridTemplateColumns:'200px 1fr 1fr', gap:'12px',
          alignItems:'center', padding:'14px 0',
          borderBottom:'1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ color:'rgba(255,255,255,0.5)', fontSize:'11px', fontWeight:700, letterSpacing:'0.08em' }}>
            INVERSIONES
          </div>
          <div style={{ textAlign:'center', color:'rgba(255,255,255,0.85)', fontSize:'15px', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>
            {formatCRC(totalInvCRC)}
          </div>
          <div style={{ textAlign:'center', color:'rgba(255,255,255,0.85)', fontSize:'15px', fontWeight:600, fontVariantNumeric:'tabular-nums' }}>
            {formatUSD(totalInvUSD)}
          </div>
        </div>

        <div style={{
          display:'grid', gridTemplateColumns:'200px 1fr 1fr', gap:'12px',
          alignItems:'center', paddingTop:'14px',
        }}>
          <div style={{ color:'rgba(255,255,255,0.7)', fontSize:'13px', fontWeight:700, letterSpacing:'0.05em' }}>
            POSICIÓN TOTAL
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ color:'#fff', fontSize:'24px', fontWeight:800, fontVariantNumeric:'tabular-nums' }}>
              {formatCRC(totalCRC)}
            </div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'11px' }}>Total colones</div>
          </div>
          <div style={{ textAlign:'center' }}>
            <div style={{ color:'#ED6E2E', fontSize:'24px', fontWeight:800, fontVariantNumeric:'tabular-nums' }}>
              {formatUSD(totalUSD)}
            </div>
            <div style={{ color:'rgba(255,255,255,0.4)', fontSize:'11px' }}>Total dólares</div>
          </div>
        </div>
      </div>

    </div>
  );
}
