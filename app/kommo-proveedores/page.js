// app/kommo-proveedores/page.js
// Panel para gestionar números de WhatsApp de proveedores
'use client'
import { useState, useEffect } from 'react'

const GOLD = '#ED6E2E'
const MUTED = '#8a7070'
const BORDER = '#EAE0E0'
const TEXT = '#1a1a1a'

const S = {
  page: { background: '#FDF4F4', minHeight: '100vh', padding: '28px 32px', fontFamily: 'DM Sans, sans-serif', color: TEXT },
  card: { background: '#fff', borderRadius: 12, border: `1px solid ${BORDER}`, padding: '20px 24px', marginBottom: 16 },
  input: { background: '#FDF4F4', border: `1px solid ${BORDER}`, borderRadius: 8, padding: '8px 12px', fontSize: '0.88rem', color: TEXT, outline: 'none', width: '100%', boxSizing: 'border-box', fontFamily: 'DM Sans, sans-serif' },
  label: { fontSize: '0.73rem', fontWeight: 700, color: MUTED, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  btn: (c = GOLD) => ({ background: c, color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, fontFamily: 'DM Sans, sans-serif' }),
  btnSm: (c = '#fff') => ({ background: c, color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: '5px 11px', cursor: 'pointer', fontSize: '0.78rem', fontFamily: 'DM Sans, sans-serif' }),
  th: { textAlign: 'left', padding: '9px 12px', background: '#FDF4F4', color: MUTED, fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: `1px solid ${BORDER}` },
  td: { padding: '10px 12px', borderBottom: `1px solid ${BORDER}`, fontSize: '0.85rem', color: TEXT, verticalAlign: 'middle' },
}

export default function KommoProveedoresPage() {
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ nombre_proveedor: '', whatsapp: '', notas: '' })
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState(null)
  const [buscar, setBuscar] = useState('')

  async function cargar() {
    setLoading(true)
    const res = await fetch('/api/kommo/proveedores')
    const data = await res.json()
    setProveedores(Array.isArray(data) ? data : [])
    setLoading(false)
  }

  useEffect(() => { cargar() }, [])

  function showMsg(t, ok = true) { setMsg({ t, ok }); setTimeout(() => setMsg(null), 4000) }

  async function guardar() {
    if (!form.nombre_proveedor.trim()) return showMsg('El nombre del proveedor es requerido', false)
    if (!form.whatsapp.trim()) return showMsg('El número de WhatsApp es requerido', false)
    const tel = form.whatsapp.trim().replace(/\D/g, '')
    if (tel.length < 8) return showMsg('Número inválido — usá formato internacional: 50688887777', false)

    setSaving(true)
    const res = await fetch('/api/kommo/proveedores', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, whatsapp: tel }),
    })
    const data = await res.json()
    setSaving(false)
    if (data.error) return showMsg(data.error, false)
    showMsg('✅ Proveedor guardado')
    setForm({ nombre_proveedor: '', whatsapp: '', notas: '' })
    cargar()
  }

  async function eliminar(id, nombre) {
    if (!confirm(`¿Eliminar el WhatsApp de "${nombre}"?`)) return
    await fetch(`/api/kommo/proveedores?id=${id}`, { method: 'DELETE' })
    showMsg('Eliminado')
    cargar()
  }

  const filtrados = buscar.trim()
    ? proveedores.filter(p => p.nombre_proveedor.toLowerCase().includes(buscar.toLowerCase()))
    : proveedores

  return (
    <div style={S.page}>
      <div style={{ marginBottom: 24 }}>
        <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: GOLD, display: 'block', marginBottom: 4 }}>
          Kommo · WhatsApp
        </span>
        <h1 style={{ fontSize: '1.7rem', fontWeight: 700, color: TEXT, margin: 0 }}>
          📱 WhatsApp de Proveedores
        </h1>
        <p style={{ fontSize: '0.82rem', color: MUTED, marginTop: 4 }}>
          Registrá los números para envío automático de órdenes de compra
        </p>
      </div>

      {/* Info */}
      <div style={{ background: '#EBF8FF', border: '1px solid #BEE3F8', borderRadius: 10, padding: '12px 16px', marginBottom: 20, fontSize: '0.84rem', color: '#2C5282' }}>
        💡 El nombre del proveedor debe coincidir <strong>exactamente</strong> con como aparece en el inventario de NEO.
        Al enviar una OC desde Saturno, el número se carga automáticamente si está registrado acá.
      </div>

      {msg && (
        <div style={{ background: msg.ok ? '#f0fff4' : '#fff5f5', border: `1px solid ${msg.ok ? '#9AE6B4' : '#FEB2B2'}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16, color: msg.ok ? '#276749' : '#C53030', fontSize: '0.84rem' }}>
          {msg.t}
        </div>
      )}

      {/* Formulario */}
      <div style={S.card}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 16, marginTop: 0 }}>➕ Agregar / actualizar proveedor</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div>
            <label style={S.label}>Nombre del proveedor *</label>
            <input style={S.input} placeholder="Ej: LUBRIMAX SA" value={form.nombre_proveedor} onChange={e => setForm({ ...form, nombre_proveedor: e.target.value })} />
          </div>
          <div>
            <label style={S.label}>WhatsApp (formato internacional) *</label>
            <input style={S.input} placeholder="50688887777" value={form.whatsapp} onChange={e => setForm({ ...form, whatsapp: e.target.value })} />
          </div>
          <div>
            <label style={S.label}>Notas</label>
            <input style={S.input} placeholder="Contacto, horario, etc." value={form.notas} onChange={e => setForm({ ...form, notas: e.target.value })} />
          </div>
        </div>
        <button style={S.btn()} onClick={guardar} disabled={saving}>
          {saving ? 'Guardando...' : '💾 Guardar proveedor'}
        </button>
      </div>

      {/* Lista */}
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h2 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>
            📋 Proveedores registrados ({proveedores.length})
          </h2>
          <input
            style={{ ...S.input, width: 260 }}
            placeholder="🔍 Buscar..."
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
          />
        </div>

        {loading ? (
          <div style={{ color: MUTED, textAlign: 'center', padding: 32 }}>Cargando...</div>
        ) : filtrados.length === 0 ? (
          <div style={{ color: MUTED, textAlign: 'center', padding: 32 }}>
            {buscar ? 'Sin coincidencias' : 'No hay proveedores registrados aún'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={S.th}>Proveedor</th>
                  <th style={S.th}>WhatsApp</th>
                  <th style={S.th}>Kommo ID</th>
                  <th style={S.th}>Notas</th>
                  <th style={S.th}>Actualizado</th>
                  <th style={S.th}></th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map(p => (
                  <tr key={p.id}>
                    <td style={{ ...S.td, fontWeight: 600 }}>{p.nombre_proveedor}</td>
                    <td style={{ ...S.td, color: '#25D366', fontWeight: 600, fontFamily: 'monospace' }}>
                      {p.whatsapp ? `+${p.whatsapp}` : '—'}
                    </td>
                    <td style={{ ...S.td, color: MUTED, fontSize: '0.75rem', fontFamily: 'monospace' }}>
                      {p.kommo_contact_id || '—'}
                    </td>
                    <td style={{ ...S.td, color: MUTED }}>{p.notas || '—'}</td>
                    <td style={{ ...S.td, color: MUTED, fontSize: '0.78rem' }}>
                      {p.actualizado_en ? new Date(p.actualizado_en).toLocaleDateString('es-CR') : '—'}
                    </td>
                    <td style={S.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          style={S.btnSm()}
                          onClick={() => setForm({ nombre_proveedor: p.nombre_proveedor, whatsapp: p.whatsapp || '', notas: p.notas || '' })}
                        >
                          ✏️ Editar
                        </button>
                        <button
                          style={{ ...S.btnSm(), color: '#C53030', borderColor: '#FEB2B2' }}
                          onClick={() => eliminar(p.id, p.nombre_proveedor)}
                        >
                          🗑
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
