'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useAuth } from '../../lib/useAuth'

// ── Colores de estado (marca Depósito Jiménez) ──
const ESTADO_STYLE = {
  'Asignado':                { bg: '#e6f4ea', color: '#276749' }, // verde suave
  'Estimado':                { bg: '#fff7e0', color: '#946c00' }, // amarillo
  'Pendiente packing list':  { bg: '#fdebdf', color: '#b8501e' }, // naranja
  'No aplica':               { bg: '#eeeeee', color: '#777777' }, // gris
  'Sin peso':                { bg: '#fdecec', color: '#c53030' }, // rojo (resaltado)
}
const estadoStyle = (e) => ESTADO_STYLE[e] || ESTADO_STYLE['No aplica']

// Colores para la barra de mezcla por clase.
const CLASE_COLOR = {
  'LARGO/PESADO':        '#5E2733',
  'GRANEL/PESADO':       '#225F74',
  'LOZA/CERAMICA/FRAGIL':'#ED6E2E',
  'VOLUMINOSO/LIVIANO':  '#c8a84b',
  'FRUTERIA/LIVIANO':    '#7BA05B',
  'Sin clase':           '#999999',
}
const claseColor = (c) => CLASE_COLOR[c] || '#999999'

const fmtKg = (n) => Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// ── Exportar CSV (UTF-8 con BOM, separador ; — abre en Excel) ──
function exportarCSV(nombre, headers, rows) {
  const esc = (v) => {
    const s = v == null ? '' : String(v)
    return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
  }
  const cuerpo = [headers, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
  const blob = new Blob(['﻿' + cuerpo], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function Badge({ estado }) {
  const st = estadoStyle(estado)
  return <span className="badge" style={{ background: st.bg, color: st.color, fontWeight: 600 }}>{estado}</span>
}

export default function CalculoTransporte() {
  const { perfil } = useAuth()
  const esAdmin = perfil?.rol === 'admin'
  const usuario = perfil?.nombre || perfil?.username || perfil?.email || 'Manual'

  const [tab, setTab] = useState('calculo')

  return (
    <div className="module-page">
      <div className="module-header">
        <div>
          <h1 className="module-title">🚚 Cálculo de Transporte</h1>
          <p className="module-sub">Operaciones · Peso de carga a partir de la proforma</p>
        </div>
      </div>

      <div className="module-tabs">
        <button className={`module-tab ${tab === 'calculo' ? 'active' : ''}`} onClick={() => setTab('calculo')}>
          Cálculo de Transporte
        </button>
        {esAdmin && (
          <>
            <button className={`module-tab ${tab === 'sinpeso' ? 'active' : ''}`} onClick={() => setTab('sinpeso')}>
              Productos sin peso
            </button>
            <button className={`module-tab ${tab === 'revisar' ? 'active' : ''}`} onClick={() => setTab('revisar')}>
              Por revisar
            </button>
          </>
        )}
      </div>

      {tab === 'calculo' && <TabCalculo />}
      {tab === 'sinpeso' && esAdmin && <TabPesos vista="sin_peso" usuario={usuario} />}
      {tab === 'revisar' && esAdmin && <TabPesos vista="por_revisar" usuario={usuario} />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VISTA 1 — Cálculo de Transporte
// ─────────────────────────────────────────────────────────────────────────────
function TabCalculo() {
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef(null)

  const procesar = useCallback(async (file) => {
    if (!file) return
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      setError('El archivo debe ser un PDF.'); return
    }
    setError(null); setData(null); setCargando(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/calculo-transporte/parse-proforma', { method: 'POST', body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo procesar la proforma.')
      setData(json)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargando(false)
    }
  }, [])

  const onDrop = (e) => {
    e.preventDefault(); setDrag(false)
    if (e.dataTransfer.files?.[0]) procesar(e.dataTransfer.files[0])
  }

  const exportar = () => {
    if (!data) return
    const headers = ['Cantidad', 'Código', 'Producto', 'Peso unit (kg)', 'Peso línea (kg)', 'Estado']
    const rows = data.filas.map(f => [
      f.cantidad,
      f.codigo,
      f.producto,
      f.peso_unit != null ? fmtKg(f.peso_unit) : '',
      f.peso_linea != null ? fmtKg(f.peso_linea) : '',
      f.estado,
    ])
    exportarCSV(`proforma-${data.cabecera?.proforma || 'calculo'}.csv`, headers, rows)
  }

  return (
    <>
      {/* Zona de subida */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={onDrop}
        style={{
          border: `2px dashed ${drag ? 'var(--orange)' : 'var(--border)'}`,
          background: drag ? 'rgba(237,110,46,0.06)' : '#fff',
          borderRadius: 14, padding: '38px 24px', textAlign: 'center', cursor: 'pointer',
          transition: 'all 0.15s', marginBottom: 20,
        }}
      >
        <input ref={inputRef} type="file" accept="application/pdf" style={{ display: 'none' }}
          onChange={(e) => procesar(e.target.files?.[0])} />
        <div style={{ fontSize: '2rem', marginBottom: 8 }}>📄</div>
        <div style={{ fontWeight: 600, color: 'var(--burgundy)', fontSize: '0.95rem' }}>
          {cargando ? 'Procesando proforma…' : 'Arrastrá la proforma en PDF o hacé clic para subirla'}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 4 }}>
          Se calcula el peso total y el desglose. No se guarda nada.
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {data && (
        <>
          {/* Cabecera de la proforma */}
          <div className="card" style={{ padding: '16px 20px', marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 24 }}>
            <Dato label="N° Proforma" valor={data.cabecera?.proforma} />
            <Dato label="Cliente" valor={data.cabecera?.cliente} />
            <Dato label="Fecha" valor={data.cabecera?.fecha} />
            <Dato label="Vendedor" valor={data.cabecera?.hechoPor} />
          </div>

          {/* Peso total destacado */}
          <div className="kpi-card card-accent-orange" style={{ marginBottom: 16 }}>
            <div className="kpi-label">Peso total de la carga</div>
            <div className="kpi-value" style={{ color: 'var(--burgundy)' }}>{fmtKg(data.peso_total)} kg</div>
            {data.sin_peso > 0 && (
              <div className="kpi-change down" style={{ marginTop: 6 }}>
                {data.sin_peso} {data.sin_peso === 1 ? 'producto' : 'productos'} sin peso · estimado parcial
              </div>
            )}
          </div>

          {/* Banner de productos sin peso */}
          {data.sin_peso > 0 && (
            <div className="warn-banner">
              ⚠️ {data.sin_peso} {data.sin_peso === 1 ? 'producto no tiene' : 'productos no tienen'} peso registrado.
              El total mostrado es un <strong>estimado parcial</strong> (las filas resaltadas no se sumaron).
            </div>
          )}

          {/* Barra de mezcla por clase */}
          {data.mezcla?.length > 0 && (
            <div className="card" style={{ padding: '16px 20px', marginBottom: 16 }}>
              <div style={{ fontWeight: 600, color: 'var(--burgundy)', fontSize: '0.88rem', marginBottom: 10 }}>
                Mezcla de carga por clase
              </div>
              <div style={{ display: 'flex', height: 18, borderRadius: 9, overflow: 'hidden', marginBottom: 12 }}>
                {data.mezcla.map(m => (
                  <div key={m.clase} title={`${m.clase}: ${m.pct.toFixed(1)}%`}
                    style={{ width: `${m.pct}%`, background: claseColor(m.clase) }} />
                ))}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
                {data.mezcla.map(m => (
                  <div key={m.clase} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: claseColor(m.clase) }} />
                    {m.clase} · {m.pct.toFixed(1)}% ({fmtKg(m.kg)} kg)
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tabla de líneas */}
          <div className="card" style={{ overflow: 'hidden' }}>
            <div className="card-header">
              <span className="card-title">Detalle ({data.filas.length} líneas)</span>
              <button className="btn-outline" onClick={exportar}>⬇ Exportar a Excel</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table className="module-table">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'right' }}>Cantidad</th>
                    <th>Producto</th>
                    <th style={{ textAlign: 'right' }}>Peso unit (kg)</th>
                    <th style={{ textAlign: 'right' }}>Peso línea (kg)</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data.filas.map((f, i) => (
                    <tr key={i} style={f.sin_peso ? { background: 'rgba(197,48,48,0.06)' } : undefined}>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{f.cantidad}</td>
                      <td>
                        <div style={{ fontWeight: 500 }}>{f.producto}</div>
                        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{f.codigo}</div>
                      </td>
                      <td style={{ textAlign: 'right' }}>{f.peso_unit != null ? fmtKg(f.peso_unit) : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{f.peso_linea != null ? fmtKg(f.peso_linea) : '—'}</td>
                      <td><Badge estado={f.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  )
}

function Dato({ label, valor }) {
  return (
    <div>
      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', fontWeight: 600, marginTop: 2 }}>{valor || '—'}</div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// VISTA 2 — Productos sin peso / Por revisar (admin)
// ─────────────────────────────────────────────────────────────────────────────
function TabPesos({ vista, usuario }) {
  const [rows, setRows] = useState([])
  const [alertas, setAlertas] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [busqueda, setBusqueda] = useState('')
  const [inputs, setInputs] = useState({}) // codigo -> valor
  const [guardando, setGuardando] = useState(null)
  const [msg, setMsg] = useState(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch('/api/calculo-transporte/pesos')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setRows(vista === 'sin_peso' ? json.sin_peso : json.por_revisar)
      setAlertas(json.alertas_pendientes || 0)
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally {
      setCargando(false)
    }
  }, [vista])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async (codigo) => {
    const valor = inputs[codigo]
    if (!valor || Number(valor) <= 0) { setMsg({ tipo: 'error', texto: 'Ingresá un peso mayor a 0.' }); return }
    setGuardando(codigo)
    try {
      const res = await fetch('/api/calculo-transporte/pesos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_interno: codigo, peso_kg: Number(valor), actualizado_por: usuario }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // La fila desaparece de la lista tras asignar el peso.
      setRows(prev => prev.filter(r => r.codigo_interno !== codigo))
      setInputs(prev => { const n = { ...prev }; delete n[codigo]; return n })
      setMsg({ tipo: 'ok', texto: `Peso guardado para ${codigo}.` })
      setTimeout(() => setMsg(null), 2500)
    } catch (e) {
      setMsg({ tipo: 'error', texto: e.message })
    } finally {
      setGuardando(null)
    }
  }

  const nombreDe = (r) => r.item || r.producto || ''
  const filtradas = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return rows
    return rows.filter(r =>
      r.codigo_interno?.toLowerCase().includes(q) ||
      nombreDe(r).toLowerCase().includes(q)
    )
  }, [rows, busqueda])

  const exportar = () => {
    if (vista === 'sin_peso') {
      exportarCSV('productos-sin-peso.csv',
        ['Código', 'Producto', 'Categoría', 'Estado'],
        filtradas.map(r => [r.codigo_interno, r.item, r.categoria, r.estado]))
    } else {
      exportarCSV('pesos-por-revisar.csv',
        ['Código', 'Producto', 'Categoría', 'Clase', 'Peso (kg)', 'Estado', 'Motivo'],
        filtradas.map(r => [r.codigo_interno, r.producto, r.categoria, r.clase, r.peso_kg, r.estado, r.motivo]))
    }
  }

  return (
    <>
      {/* Badge de alerta */}
      {alertas > 0 && (
        <div className="warn-banner">
          🔔 Hay <strong>{alertas}</strong> {alertas === 1 ? 'alerta pendiente' : 'alertas pendientes'} de productos sin peso detectados por el barrido.
        </div>
      )}

      {msg && <div className={msg.tipo === 'ok' ? 'success-banner' : 'error-banner'}>{msg.texto}</div>}

      <div className="card" style={{ overflow: 'hidden' }}>
        <div className="card-header" style={{ gap: 12, flexWrap: 'wrap' }}>
          <span className="card-title">
            {vista === 'sin_peso' ? 'Productos sin peso' : 'Pesos por revisar'} ({filtradas.length})
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input className="module-input" placeholder="Buscar por código o nombre…"
              value={busqueda} onChange={e => setBusqueda(e.target.value)} style={{ width: 240 }} />
            <button className="btn-outline" onClick={exportar}>⬇ Exportar a Excel</button>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table className="module-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Producto</th>
                <th>Categoría</th>
                {vista === 'por_revisar' && <th>Motivo</th>}
                <th>Estado</th>
                <th style={{ width: 220 }}>Peso (kg)</th>
              </tr>
            </thead>
            <tbody>
              {cargando && <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>Cargando…</td></tr>}
              {!cargando && filtradas.length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                  {busqueda ? 'Sin resultados para la búsqueda.' : '¡Todo al día! No hay productos pendientes.'}
                </td></tr>
              )}
              {filtradas.map(r => (
                <tr key={r.codigo_interno}>
                  <td style={{ fontWeight: 600 }}>{r.codigo_interno}</td>
                  <td>{nombreDe(r)}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{r.categoria || '—'}</td>
                  {vista === 'por_revisar' && <td style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{r.motivo || '—'}</td>}
                  <td><Badge estado={r.estado} /></td>
                  <td>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <input className="module-input" type="number" min="0" step="0.01"
                        placeholder={r.peso_kg != null ? fmtKg(r.peso_kg) : 'kg'}
                        value={inputs[r.codigo_interno] ?? ''}
                        onChange={e => setInputs(prev => ({ ...prev, [r.codigo_interno]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') guardar(r.codigo_interno) }}
                        style={{ width: 100, padding: '5px 8px' }} />
                      <button className="btn-primary" style={{ padding: '5px 12px', fontSize: '0.78rem' }}
                        disabled={guardando === r.codigo_interno}
                        onClick={() => guardar(r.codigo_interno)}>
                        {guardando === r.codigo_interno ? '…' : 'Guardar'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
