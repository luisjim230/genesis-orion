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

export default function BancosPage() {
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null); // 'BAC_CRC' o 'BAC_USD'
  const [tempSaldo, setTempSaldo] = useState('');
  const [tempNotas, setTempNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => { cargarCuentas(); }, []);

  async function cargarCuentas() {
    setLoading(true);
    const { data, error } = await supabase.from('fin_bancos').select('*').order('id');
    if (!error && data) setCuentas(data);
    setLoading(false);
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

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 3000);
  }

  const totalCRC = cuentas.filter(c => c.moneda === 'CRC').reduce((s, c) => s + Number(c.saldo || 0), 0);
  const totalUSD = cuentas.filter(c => c.moneda === 'USD').reduce((s, c) => s + Number(c.saldo || 0), 0);

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

      {/* Totales */}
      <div style={{
        marginTop: '20px', background: '#5E2733', borderRadius: '14px',
        padding: '20px 24px', display: 'grid',
        gridTemplateColumns: '200px 1fr 1fr', gap: '12px', alignItems: 'center',
      }}>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', fontWeight: '700', letterSpacing: '0.05em' }}>
          POSICIÓN TOTAL
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#fff', fontSize: '24px', fontWeight: '800', fontVariantNumeric: 'tabular-nums' }}>
            {formatCRC(totalCRC)}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Total colones</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ color: '#ED6E2E', fontSize: '24px', fontWeight: '800', fontVariantNumeric: 'tabular-nums' }}>
            {formatUSD(totalUSD)}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>Total dólares</div>
        </div>
      </div>

    </div>
  );
}
