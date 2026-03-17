'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

const CUENTAS_CONFIG = {
  BAC:  { nombre: 'BAC San José',        color: '#C8102E', emoji: '🏦' },
  BN:   { nombre: 'Banco Nacional',      color: '#006341', emoji: '🏦' },
  BCR:  { nombre: 'Banco de Costa Rica', color: '#003DA5', emoji: '🏦' },
  DAVI: { nombre: 'Davivienda',          color: '#C8102E', emoji: '🏦' },
  CASH: { nombre: 'Efectivo',            color: '#5E2733', emoji: '💵' },
};

function formatCRC(value) {
  if (value === null || value === undefined || value === '') return '₡0';
  return '₡' + Number(value).toLocaleString('es-CR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function parseCRC(str) {
  return parseFloat(str.replace(/[^\d.-]/g, '')) || 0;
}

export default function BancosPage() {
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editando, setEditando] = useState(null);
  const [tempValues, setTempValues] = useState({});
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    cargarCuentas();
  }, []);

  async function cargarCuentas() {
    setLoading(true);
    const { data, error } = await supabase
      .from('fin_bancos')
      .select('*')
      .order('id');
    if (!error && data) {
      setCuentas(data);
    }
    setLoading(false);
  }

  function iniciarEdicion(cuenta) {
    setEditando(cuenta.cuenta_codigo);
    setTempValues({
      saldo: cuenta.saldo,
      moneda: cuenta.moneda,
      notas: cuenta.notas || '',
    });
  }

  function cancelarEdicion() {
    setEditando(null);
    setTempValues({});
  }

  async function guardarCuenta(cuenta) {
    setGuardando(true);
    const { error } = await supabase
      .from('fin_bancos')
      .update({
        saldo: parseCRC(String(tempValues.saldo)),
        moneda: tempValues.moneda,
        notas: tempValues.notas,
        updated_at: new Date().toISOString(),
      })
      .eq('cuenta_codigo', cuenta.cuenta_codigo);

    if (!error) {
      mostrarMensaje('✅ Guardado exitosamente', 'ok');
      setEditando(null);
      await cargarCuentas();
    } else {
      mostrarMensaje('❌ Error al guardar', 'error');
    }
    setGuardando(false);
  }

  function mostrarMensaje(texto, tipo) {
    setMensaje({ texto, tipo });
    setTimeout(() => setMensaje(null), 3000);
  }

  const totalCRC = cuentas
    .filter(c => c.moneda === 'CRC')
    .reduce((sum, c) => sum + Number(c.saldo || 0), 0);

  const totalUSD = cuentas
    .filter(c => c.moneda === 'USD')
    .reduce((sum, c) => sum + Number(c.saldo || 0), 0);

  if (loading) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#888', fontFamily: 'DM Sans, sans-serif' }}>
        Cargando cuentas...
      </div>
    );
  }

  return (
    <div style={{
      padding: '32px 28px',
      fontFamily: 'DM Sans, sans-serif',
      maxWidth: '820px',
      margin: '0 auto',
    }}>
      <div style={{ marginBottom: '28px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: '#1a1a1a', margin: 0 }}>
          💰 Posición de Bancos
        </h1>
        <p style={{ color: '#888', fontSize: '14px', margin: '4px 0 0' }}>
          Saldos actualizados manualmente por cuenta
        </p>
      </div>

      {mensaje && (
        <div style={{
          position: 'fixed', top: '24px', right: '24px', zIndex: 9999,
          background: mensaje.tipo === 'ok' ? '#e6f4ea' : '#fdecea',
          color: mensaje.tipo === 'ok' ? '#2e7d32' : '#c62828',
          border: `1px solid ${mensaje.tipo === 'ok' ? '#a5d6a7' : '#ef9a9a'}`,
          borderRadius: '10px', padding: '12px 20px',
          fontWeight: '600', fontSize: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        }}>
          {mensaje.texto}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {cuentas.map(cuenta => {
          const config = CUENTAS_CONFIG[cuenta.cuenta_codigo] || {};
          const estaEditando = editando === cuenta.cuenta_codigo;

          return (
            <div key={cuenta.cuenta_codigo} style={{
              background: '#fff',
              border: estaEditando ? `2px solid ${config.color || '#5E2733'}` : '2px solid #eee',
              borderRadius: '14px',
              padding: '20px 24px',
              transition: 'border 0.2s',
              boxShadow: estaEditando ? '0 4px 18px rgba(0,0,0,0.07)' : '0 1px 4px rgba(0,0,0,0.04)',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '44px', height: '44px', borderRadius: '10px',
                    background: `${config.color}18`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '22px',
                  }}>
                    {config.emoji || '🏦'}
                  </div>
                  <div>
                    <div style={{ fontWeight: '700', fontSize: '16px', color: '#1a1a1a' }}>
                      {config.nombre || cuenta.cuenta_nombre}
                    </div>
                    {cuenta.notas && !estaEditando && (
                      <div style={{ fontSize: '12px', color: '#aaa', marginTop: '2px' }}>
                        {cuenta.notas}
                      </div>
                    )}
                    {cuenta.updated_at && !estaEditando && (
                      <div style={{ fontSize: '11px', color: '#ccc', marginTop: '2px' }}>
                        Actualizado: {new Date(cuenta.updated_at).toLocaleDateString('es-CR', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {estaEditando ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', minWidth: '260px', flex: 1, maxWidth: '340px' }}>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <select
                        value={tempValues.moneda}
                        onChange={e => setTempValues(v => ({ ...v, moneda: e.target.value }))}
                        style={{
                          padding: '9px 10px', border: '1.5px solid #ddd', borderRadius: '8px',
                          fontSize: '14px', fontFamily: 'DM Sans, sans-serif',
                          background: '#fafafa', width: '80px',
                        }}
                      >
                        <option value="CRC">₡ CRC</option>
                        <option value="USD">$ USD</option>
                      </select>
                      <input
                        type="number"
                        value={tempValues.saldo}
                        onChange={e => setTempValues(v => ({ ...v, saldo: e.target.value }))}
                        placeholder="0"
                        style={{
                          flex: 1, padding: '9px 12px',
                          border: '1.5px solid #ddd', borderRadius: '8px',
                          fontSize: '15px', fontFamily: 'DM Sans, sans-serif',
                          fontWeight: '600',
                        }}
                      />
                    </div>
                    <input
                      type="text"
                      value={tempValues.notas}
                      onChange={e => setTempValues(v => ({ ...v, notas: e.target.value }))}
                      placeholder="Notas opcionales (ej: cuenta corriente #1234)"
                      style={{
                        padding: '9px 12px', border: '1.5px solid #ddd', borderRadius: '8px',
                        fontSize: '13px', fontFamily: 'DM Sans, sans-serif', color: '#555',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => guardarCuenta(cuenta)}
                        disabled={guardando}
                        style={{
                          flex: 1, padding: '9px', background: '#5E2733', color: '#fff',
                          border: 'none', borderRadius: '8px', fontWeight: '700',
                          fontSize: '14px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                          opacity: guardando ? 0.7 : 1,
                        }}
                      >
                        {guardando ? 'Guardando...' : '✓ Guardar'}
                      </button>
                      <button
                        onClick={cancelarEdicion}
                        style={{
                          padding: '9px 16px', background: '#f5f5f5', color: '#666',
                          border: 'none', borderRadius: '8px', fontWeight: '600',
                          fontSize: '14px', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif',
                        }}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: '22px', fontWeight: '700',
                        color: Number(cuenta.saldo) === 0 ? '#ccc' : '#1a1a1a',
                        fontVariantNumeric: 'tabular-nums',
                      }}>
                        {cuenta.moneda === 'USD'
                          ? `$${Number(cuenta.saldo).toLocaleString('es-CR', { minimumFractionDigits: 2 })}`
                          : formatCRC(cuenta.saldo)
                        }
                      </div>
                      <div style={{ fontSize: '11px', color: '#bbb', fontWeight: '500' }}>
                        {cuenta.moneda}
                      </div>
                    </div>
                    <button
                      onClick={() => iniciarEdicion(cuenta)}
                      style={{
                        padding: '8px 14px', background: '#f8f1f2',
                        color: '#5E2733', border: '1.5px solid #e8d0d3',
                        borderRadius: '8px', fontWeight: '600',
                        fontSize: '13px', cursor: 'pointer',
                        fontFamily: 'DM Sans, sans-serif',
                      }}
                    >
                      ✏️ Editar
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{
        marginTop: '24px',
        background: '#5E2733',
        borderRadius: '14px',
        padding: '20px 24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontWeight: '600' }}>
          POSICIÓN TOTAL
        </div>
        <div style={{ display: 'flex', gap: '32px', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ color: '#fff', fontSize: '26px', fontWeight: '800', fontVariantNumeric: 'tabular-nums' }}>
              {formatCRC(totalCRC)}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Colones</div>
          </div>
          {totalUSD > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ color: '#ED6E2E', fontSize: '26px', fontWeight: '800', fontVariantNumeric: 'tabular-nums' }}>
                ${totalUSD.toLocaleString('es-CR', { minimumFractionDigits: 2 })}
              </div>
              <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: '11px' }}>Dólares</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
