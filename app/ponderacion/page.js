'use client';
import { useState, useMemo } from 'react';

const fmtC = (v) => `₡ ${parseFloat(v || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtN = (v) => parseFloat(v || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const LOTES_INICIALES = [
  { id: 1, desc: 'Stock actual',   cantidad: 0, costo: 0 },
  { id: 2, desc: 'Ingreso nuevo',  cantidad: 0, costo: 0 },
];

const MARGENES = [5, 10, 15, 20, 25, 30, 35, 40, 50, 60, 75, 100];

export default function Ponderacion() {
  const [nombre,     setNombre]     = useState('');
  const [codigo,     setCodigo]     = useState('');
  const [lotes,      setLotes]      = useState(LOTES_INICIALES);
  const [utilidad,   setUtilidad]   = useState(30);
  const [impuesto,   setImpuesto]   = useState(13);
  const [otrosGastos,setOtrosGastos]= useState(0);
  const [nextId,     setNextId]     = useState(3);

  // ── Cálculo ponderado ──
  const loteValidos = lotes.filter(l => l.cantidad > 0 && l.costo > 0);
  const stockTotal  = loteValidos.reduce((s, l) => s + l.cantidad, 0);
  const valorTotal  = loteValidos.reduce((s, l) => s + l.cantidad * l.costo, 0);
  const costoPond   = stockTotal > 0 ? valorTotal / stockTotal : 0;

  // ── Simulador ──
  const costoConGastos   = costoPond * (1 + otrosGastos / 100);
  const precioSinImpuesto = costoConGastos * (1 + utilidad / 100);
  const precioConImpuesto = precioSinImpuesto * (1 + impuesto / 100);
  const gananciaBruta    = precioSinImpuesto - costoPond;
  const margenReal       = precioSinImpuesto > 0 ? (gananciaBruta / precioSinImpuesto * 100) : 0;

  // ── Helpers de lotes ──
  function agregarLote() {
    setLotes(prev => [...prev, { id: nextId, desc: `Lote ${nextId}`, cantidad: 0, costo: 0 }]);
    setNextId(n => n + 1);
  }
  function limpiarTodo() {
    setLotes(LOTES_INICIALES);
    setNextId(3);
  }
  function actualizarLote(id, field, value) {
    setLotes(prev => prev.map(l => l.id === id ? { ...l, [field]: field === 'desc' ? value : parseFloat(value) || 0 } : l));
  }
  function eliminarLote(id) {
    setLotes(prev => prev.filter(l => l.id !== id));
  }

  const hayDatos = loteValidos.length > 0;

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">⚖️ Esdras – Ponderación de Precios</h1>
          <p className="module-sub">Costo promedio ponderado móvil · Corporación Rojimo</p>
        </div>
      </div>

      {/* ── Descripción del artículo ── */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ fontWeight: 600, color: 'var(--burgundy)', marginBottom: 14, fontSize: '0.95rem' }}>📦 Artículo</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            className="module-input"
            style={{ flex: 3, minWidth: 220 }}
            placeholder="Nombre del artículo (ej: Tornillo hexagonal 3/8 x 1½)"
            value={nombre}
            onChange={e => setNombre(e.target.value)}
          />
          <input
            className="module-input"
            style={{ flex: 1, minWidth: 120 }}
            placeholder="Código (opcional)"
            value={codigo}
            onChange={e => setCodigo(e.target.value)}
          />
        </div>
      </div>

      {/* ── Lotes ── */}
      <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--burgundy)', fontSize: '0.95rem' }}>🗂 Lotes de ingreso</div>
            <div style={{ fontSize: '0.78rem', color: '#999', marginTop: 2 }}>Ingresá cada lote que tenés en stock o que va a ingresar</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ fontSize: '0.82rem', padding: '6px 14px' }} onClick={agregarLote}>➕ Agregar lote</button>
            <button className="btn-outline" style={{ fontSize: '0.82rem', padding: '6px 14px' }} onClick={limpiarTodo}>🗑 Limpiar</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="module-table">
            <thead>
              <tr>
                <th style={{ width: '40%' }}>Lote / Descripción</th>
                <th style={{ textAlign: 'right' }}>Cantidad (u)</th>
                <th style={{ textAlign: 'right' }}>Costo unitario (₡)</th>
                <th style={{ textAlign: 'right' }}>Valor total (₡)</th>
                <th style={{ textAlign: 'center' }}>Peso (%)</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {lotes.map(l => {
                const valorLote = l.cantidad * l.costo;
                const peso = valorTotal > 0 ? (valorLote / valorTotal * 100) : 0;
                return (
                  <tr key={l.id}>
                    <td>
                      <input
                        className="module-input"
                        style={{ width: '100%', padding: '4px 8px', fontSize: '0.82rem' }}
                        value={l.desc}
                        onChange={e => actualizarLote(l.id, 'desc', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        className="module-input"
                        style={{ width: 90, padding: '4px 8px', textAlign: 'right', fontSize: '0.82rem' }}
                        value={l.cantidad || ''}
                        onChange={e => actualizarLote(l.id, 'cantidad', e.target.value)}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        className="module-input"
                        style={{ width: 120, padding: '4px 8px', textAlign: 'right', fontSize: '0.82rem' }}
                        value={l.costo || ''}
                        onChange={e => actualizarLote(l.id, 'costo', e.target.value)}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500, color: l.cantidad > 0 && l.costo > 0 ? 'var(--burgundy)' : '#ccc' }}>
                      {l.cantidad > 0 && l.costo > 0 ? fmtC(valorLote) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {l.cantidad > 0 && l.costo > 0 ? (
                        <span style={{ background: 'rgba(237,110,46,0.12)', color: 'var(--orange)', borderRadius: 12, padding: '2px 10px', fontSize: '0.78rem', fontWeight: 600 }}>
                          {peso.toFixed(1)}%
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button onClick={() => eliminarLote(l.id)} style={{ background: 'none', border: 'none', color: '#ccc', cursor: 'pointer', fontSize: '1rem' }}
                        onMouseEnter={e => e.target.style.color = '#E53E3E'}
                        onMouseLeave={e => e.target.style.color = '#ccc'}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!hayDatos && (
        <div className="info-banner">📥 Ingresá al menos un lote con cantidad y costo para ver el resultado.</div>
      )}

      {hayDatos && (
        <>
          {/* ── KPIs ponderado ── */}
          <div className="kpi-grid kpi-grid-4" style={{ marginBottom: 20 }}>
            {[
              ['💰 Costo Ponderado',     fmtC(costoPond),   'var(--burgundy)'],
              ['📦 Stock Total',         `${stockTotal.toLocaleString()} u`, 'var(--teal)'],
              ['🏦 Valor en Inventario', fmtC(valorTotal),  'var(--orange)'],
              ['🗂 Lotes válidos',       `${loteValidos.length}`, '#666'],
            ].map(([l, v, c]) => (
              <div key={l} className="kpi-card" style={{ borderTopColor: c, padding: '14px 18px' }}>
                <div className="kpi-label">{l}</div>
                <div className="kpi-value" style={{ fontSize: '1.3rem', color: c }}>{v}</div>
              </div>
            ))}
          </div>

          {/* ── Simulador ── */}
          <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
            <div style={{ fontWeight: 600, color: 'var(--burgundy)', marginBottom: 4, fontSize: '0.95rem' }}>🎯 Simulador de precio de venta</div>
            <div style={{ fontSize: '0.78rem', color: '#999', marginBottom: 16 }}>Definí tu margen de utilidad sobre el costo ponderado</div>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
              {[
                ['Utilidad deseada (%)', utilidad, setUtilidad, 0, 500, 0.5],
                ['Impuesto de venta (%)', impuesto, setImpuesto, 0, 50, 0.5],
                ['Otros gastos / flete (%)', otrosGastos, setOtrosGastos, 0, 100, 0.5],
              ].map(([label, val, setter, min, max, step]) => (
                <div key={label} style={{ flex: 1, minWidth: 160 }}>
                  <label style={{ fontSize: '0.78rem', color: '#666', display: 'block', marginBottom: 4 }}>{label}</label>
                  <input
                    type="number"
                    min={min} max={max} step={step}
                    className="module-input"
                    style={{ width: '100%' }}
                    value={val}
                    onChange={e => setter(parseFloat(e.target.value) || 0)}
                  />
                </div>
              ))}
            </div>

            <div className="kpi-grid kpi-grid-4">
              {[
                ['📌 Precio s/impuesto',   fmtC(precioSinImpuesto), `+${fmtC(gananciaBruta)} ganancia`, 'var(--teal)'],
                ['🧾 Precio c/impuesto',   fmtC(precioConImpuesto), null, 'var(--burgundy)'],
                ['📈 Margen real',          `${margenReal.toFixed(1)}%`, 'Ganancia / PV s/impuesto', 'var(--orange)'],
                ['💵 Ganancia bruta/u',    fmtC(gananciaBruta), null, '#38A169'],
              ].map(([l, v, sub, c]) => (
                <div key={l} className="kpi-card" style={{ borderTopColor: c, padding: '14px 18px' }}>
                  <div className="kpi-label">{l}</div>
                  <div className="kpi-value" style={{ fontSize: '1.2rem', color: c }}>{v}</div>
                  {sub && <div style={{ fontSize: '0.70rem', color: '#999', marginTop: 3 }}>{sub}</div>}
                </div>
              ))}
            </div>
          </div>

          {/* ── Tabla de escenarios ── */}
          <div className="card" style={{ padding: '20px 24px', marginBottom: 20 }}>
            <div style={{ fontWeight: 600, color: 'var(--burgundy)', marginBottom: 4, fontSize: '0.95rem' }}>📋 Tabla de escenarios de utilidad</div>
            <div style={{ fontSize: '0.78rem', color: '#999', marginBottom: 14 }}>Precio de venta con IVA según distintos márgenes, calculados sobre el costo ponderado</div>

            <div style={{ overflowX: 'auto' }}>
              <table className="module-table">
                <thead>
                  <tr>
                    <th>Utilidad (%)</th>
                    <th style={{ textAlign: 'right' }}>Precio s/IVA (₡)</th>
                    <th style={{ textAlign: 'right' }}>Precio c/IVA (₡)</th>
                    <th style={{ textAlign: 'right' }}>Ganancia/u (₡)</th>
                  </tr>
                </thead>
                <tbody>
                  {MARGENES.map(m => {
                    const pvsi = costoPond * (1 + m / 100);
                    const pvci = pvsi * (1 + impuesto / 100);
                    const gan  = pvsi - costoPond;
                    const esActual = Math.abs(m - utilidad) < 0.1;
                    return (
                      <tr key={m} style={esActual ? { background: 'rgba(237,110,46,0.10)', fontWeight: 700 } : {}}>
                        <td style={{ color: esActual ? 'var(--orange)' : undefined }}>
                          {esActual ? '▶ ' : ''}{m}%
                        </td>
                        <td style={{ textAlign: 'right' }}>{fmtC(pvsi)}</td>
                        <td style={{ textAlign: 'right', fontWeight: esActual ? 700 : 400, color: esActual ? 'var(--burgundy)' : undefined }}>{fmtC(pvci)}</td>
                        <td style={{ textAlign: 'right', color: '#38A169' }}>{fmtC(gan)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Pie ── */}
          <div style={{ textAlign: 'center', fontSize: '0.78rem', color: '#999', marginTop: 8 }}>
            Ponderación para <strong style={{ color: 'var(--burgundy)' }}>{nombre || 'el artículo'}</strong>
            {codigo && <span style={{ fontFamily: 'monospace', color: 'var(--orange)', marginLeft: 6 }}>{codigo}</span>}
            {' · '}{loteValidos.length} lote(s) · Stock: {stockTotal.toLocaleString()} u · Costo ponderado: {fmtC(costoPond)}
          </div>
        </>
      )}
    </div>
  );
}
