'use client'
import { useState, useMemo } from 'react'
import AsientoEditor from './AsientoEditor'
import Combobox from './Combobox'
import { C } from './lib'

export default function MontarTab({ cat, email, onCreado }) {
  const [seed, setSeed] = useState(() => nuevoSeed())
  const [plantillaId, setPlantillaId] = useState(null)
  const [nonce, setNonce] = useState(0)

  const plantillaItems = useMemo(() => (cat?.plantillas || [])
    .filter((p) => p.activa)
    .map((p) => ({ value: p.id, main: p.nombre, sub: p.tipo, keywords: p.nombre + ' ' + p.tipo })), [cat])

  function aplicarPlantilla(id) {
    setPlantillaId(id)
    const p = (cat?.plantillas || []).find((x) => x.id === id)
    if (!p) return
    const lineas = (p.lineas || []).sort((a, b) => a.orden - b.orden).map((l) => ({
      cuenta: l.cuenta || '', centro_costo_id: l.centro_costo_id || null,
      debe: '', haber: '', // montos en blanco, se digitan
      observacion: l.observacion || '',
      naturaleza: l.naturaleza,
    }))
    setSeed({
      id: null, fecha: hoy(), descripcion: p.nombre, moneda: 'CRC', tipo_cambio: '', deducible: true,
      tipo_origen: 'plantilla', plantilla_id: p.id, lineas,
    })
    setNonce((n) => n + 1)
  }

  function limpiar() {
    setPlantillaId(null); setSeed(nuevoSeed()); setNonce((n) => n + 1)
  }

  return (
    <div style={{ background: 'white', border: `1px solid ${C.borde}`, borderRadius: 12, padding: 18, maxWidth: 1100 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 280, flex: 1 }}>
          <label style={lbl}>Precargar desde plantilla (opcional)</label>
          <Combobox items={plantillaItems} value={plantillaId} onChange={aplicarPlantilla} placeholder="Sin plantilla — captura libre" ariaLabel="Plantilla" />
        </div>
        <button onClick={limpiar} style={{ background: 'white', border: `1px solid ${C.bordeFuerte}`, borderRadius: 8, padding: '8px 14px', fontSize: 13, cursor: 'pointer', color: C.vino }}>
          Limpiar
        </button>
      </div>

      <AsientoEditor
        key={nonce}
        mode="crear"
        asiento={seed}
        cat={cat}
        email={email}
        onCreated={(a) => { onCreado?.(a); limpiar() }}
        autoFocusPrimera={!plantillaId}
        avisarDuplicados
      />
    </div>
  )
}

function hoy() { return new Date().toISOString().slice(0, 10) }
function nuevoSeed() {
  return {
    id: null, fecha: hoy(), descripcion: '', moneda: 'CRC', tipo_cambio: '', deducible: true,
    tipo_origen: 'manual', plantilla_id: null,
    lineas: [
      { cuenta: '', centro_costo_id: null, debe: '', haber: '', observacion: '' },
      { cuenta: '', centro_costo_id: null, debe: '', haber: '', observacion: '' },
    ],
  }
}
const lbl = { display: 'block', fontSize: 10.5, fontWeight: 700, color: C.petroleo, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 4 }
