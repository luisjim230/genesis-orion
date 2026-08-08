'use client'
import { useState, useMemo } from 'react'
import Combobox from './Combobox'
import {
  C, api, norm, buildItemsCuentas, buildItemsCentros,
} from './lib'

export default function CatalogosTab({ cat, email, recargarCat }) {
  const [sub, setSub] = useState('proveedores')
  const esAdmin = cat?.yo?.rol === 'admin'
  const SUBS = [['proveedores', 'Proveedores'], ['cuentas', 'Cuentas'], ['centros', 'Centros de costo'], ['plantillas', 'Plantillas']]

  return (
    <div>
      {!esAdmin && (
        <div style={{ background: C.crema, border: `1px solid ${C.borde}`, borderRadius: 8, padding: '8px 12px', fontSize: 12.5, color: C.gris, marginBottom: 12 }}>
          👀 Modo lectura. Solo un admin puede editar los catálogos.
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        {SUBS.map(([k, l]) => (
          <button key={k} onClick={() => setSub(k)} style={{
            padding: '7px 14px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            border: `1px solid ${sub === k ? C.vino : C.bordeFuerte}`,
            background: sub === k ? C.vino : 'white', color: sub === k ? 'white' : C.vino,
          }}>{l}</button>
        ))}
      </div>

      {sub === 'proveedores' && <Proveedores cat={cat} email={email} esAdmin={esAdmin} recargarCat={recargarCat} />}
      {sub === 'cuentas' && <Cuentas cat={cat} email={email} esAdmin={esAdmin} recargarCat={recargarCat} />}
      {sub === 'centros' && <Centros cat={cat} email={email} esAdmin={esAdmin} recargarCat={recargarCat} />}
      {sub === 'plantillas' && <Plantillas cat={cat} email={email} esAdmin={esAdmin} recargarCat={recargarCat} />}
    </div>
  )
}

async function guardar(payload) {
  return api('/catalogos/mantenimiento', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
}

// ── PROVEEDORES ──────────────────────────────────────────────────────────────
function Proveedores({ cat, email, esAdmin, recargarCat }) {
  const [q, setQ] = useState('')
  const [filtro, setFiltro] = useState('todos')
  const [edit, setEdit] = useState(null)
  const [msg, setMsg] = useState(null)

  const cuentaItems = useMemo(() => buildItemsCuentas(cat?.cuentas), [cat])
  const centroItems = useMemo(() => buildItemsCentros(cat?.centros), [cat])

  const lista = useMemo(() => {
    let l = cat?.proveedores || []
    if (filtro === 'por_clasificar') l = l.filter((p) => ['por_clasificar', 'preguntar'].includes(p.clasificacion) || !p.cuenta_sugerida)
    else if (filtro === 'preguntar') l = l.filter((p) => p.clasificacion === 'preguntar')
    const nq = norm(q)
    if (nq) l = l.filter((p) => norm(p.nombre + ' ' + (p.cedula || '')).includes(nq))
    return l.slice(0, 300)
  }, [cat, q, filtro])

  async function onSave() {
    try {
      await guardar({ actor: email, recurso: 'proveedor', id: edit.id,
        clasificacion: edit.clasificacion, cuenta_sugerida: edit.cuenta_sugerida || null,
        centro_costo_id: edit.centro_costo_id || null, deducible_default: edit.deducible_default,
        cuenta_contrapartida: edit.cuenta_contrapartida || null, notas: edit.notas || null })
      setMsg({ ok: true, t: 'Guardado.' }); setEdit(null); recargarCat?.()
    } catch (e) { setMsg({ ok: false, t: e.message }) }
  }

  return (
    <div>
      <Barra>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proveedor…" style={inp} />
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} style={inp}>
          <option value="todos">Todos</option><option value="por_clasificar">Por clasificar</option><option value="preguntar">Preguntar</option>
        </select>
      </Barra>
      <Msg msg={msg} />
      <Tabla>
        <thead><tr style={trh}><th style={th}>Proveedor</th><th style={th}>Cédula</th><th style={th}>Clasificación</th><th style={th}>Cuenta sugerida</th><th style={th}>Confianza</th><th style={th}></th></tr></thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id} style={tr}>
              <td style={td}>{p.nombre}</td>
              <td style={td}>{p.cedula || '—'}</td>
              <td style={td}><Chip v={p.clasificacion} /></td>
              <td style={td}>{p.cuenta_sugerida || '—'}</td>
              <td style={td}>{p.confianza != null ? Math.round(p.confianza) + '%' : '—'}</td>
              <td style={td}>{esAdmin && <button style={btnSm} onClick={() => setEdit({ ...p })}>Editar</button>}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>

      {edit && (
        <Modal onClose={() => setEdit(null)} titulo={`Editar: ${edit.nombre}`}>
          <Campo label="Clasificación">
            <select value={edit.clasificacion} onChange={(e) => setEdit({ ...edit, clasificacion: e.target.value })} style={inp}>
              {['gasto', 'mercaderia', 'preguntar', 'ignorar', 'por_clasificar'].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </Campo>
          <Campo label="Cuenta sugerida">
            <Combobox items={cuentaItems} grouped value={edit.cuenta_sugerida} onChange={(v) => setEdit({ ...edit, cuenta_sugerida: v })} placeholder="—" />
          </Campo>
          <Campo label="Centro de costo">
            <Combobox items={centroItems} value={edit.centro_costo_id} onChange={(v) => setEdit({ ...edit, centro_costo_id: v })} placeholder="—" />
          </Campo>
          <Campo label="Cuenta de contrapartida (vacío = Caja General 10-10-10-01)">
            <Combobox items={cuentaItems} grouped value={edit.cuenta_contrapartida} onChange={(v) => setEdit({ ...edit, cuenta_contrapartida: v })} placeholder="10-10-10-01 · Caja General (por defecto)" />
          </Campo>
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13, margin: '4px 0' }}>
            <input type="checkbox" checked={edit.deducible_default !== false} onChange={(e) => setEdit({ ...edit, deducible_default: e.target.checked })} /> Deducible por defecto
          </label>
          <Campo label="Notas"><textarea value={edit.notas || ''} onChange={(e) => setEdit({ ...edit, notas: e.target.value })} style={{ ...inp, minHeight: 54 }} /></Campo>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={btn(C.naranja)} onClick={onSave}>Guardar</button>
            <button style={btn(C.gris)} onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── CUENTAS ──────────────────────────────────────────────────────────────────
function Cuentas({ cat, email, esAdmin, recargarCat }) {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [msg, setMsg] = useState(null)
  const lista = useMemo(() => {
    const nq = norm(q)
    let l = cat?.cuentas || []
    if (nq) l = l.filter((c) => norm(c.codigo + ' ' + c.nombre).includes(nq))
    return l.slice(0, 400)
  }, [cat, q])

  async function onSave() {
    try { await guardar({ actor: email, recurso: 'cuenta', codigo: edit.codigo, notas: edit.notas || null }); setMsg({ ok: true, t: 'Guardado.' }); setEdit(null); recargarCat?.() }
    catch (e) { setMsg({ ok: false, t: e.message }) }
  }

  return (
    <div>
      <Barra><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar cuenta por código o nombre…" style={inp} /></Barra>
      <Msg msg={msg} />
      <Tabla>
        <thead><tr style={trh}><th style={th}>Código</th><th style={th}>Nombre</th><th style={th}>Tipo</th><th style={th}>Imputable</th><th style={th}>Notas</th><th style={th}></th></tr></thead>
        <tbody>
          {lista.map((c) => (
            <tr key={c.codigo} style={tr}>
              <td style={{ ...td, fontFamily: 'monospace' }}>{c.codigo}</td>
              <td style={{ ...td, paddingLeft: 8 + (c.nivel || 0) * 8, fontWeight: c.imputable ? 400 : 700 }}>{c.nombre}</td>
              <td style={td}>{c.tipo}</td>
              <td style={td}>{c.imputable ? '✅' : '—'}</td>
              <td style={{ ...td, color: C.gris, maxWidth: 200 }}>{c.notas || '—'}</td>
              <td style={td}>{esAdmin && <button style={btnSm} onClick={() => setEdit({ ...c })}>Notas</button>}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      {edit && (
        <Modal onClose={() => setEdit(null)} titulo={`${edit.codigo} · ${edit.nombre}`}>
          <Campo label="Notas"><textarea value={edit.notas || ''} onChange={(e) => setEdit({ ...edit, notas: e.target.value })} style={{ ...inp, minHeight: 70 }} /></Campo>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={btn(C.naranja)} onClick={onSave}>Guardar</button>
            <button style={btn(C.gris)} onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── CENTROS ──────────────────────────────────────────────────────────────────
function Centros({ cat, email, esAdmin, recargarCat }) {
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState(null)
  const [msg, setMsg] = useState(null)
  const lista = useMemo(() => {
    const nq = norm(q); let l = cat?.centros || []
    if (nq) l = l.filter((c) => norm(c.nombre_neo + ' ' + (c.cedula || '')).includes(nq))
    return l.slice(0, 400)
  }, [cat, q])

  async function onSave() {
    try { await guardar({ actor: email, recurso: 'centro', id: edit.id, cedula: edit.cedula || null, activo: edit.activo }); setMsg({ ok: true, t: 'Guardado.' }); setEdit(null); recargarCat?.() }
    catch (e) { setMsg({ ok: false, t: e.message }) }
  }
  return (
    <div>
      <Barra><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar centro…" style={inp} /></Barra>
      <Msg msg={msg} />
      <Tabla>
        <thead><tr style={trh}><th style={th}>Centro de costo</th><th style={th}>Cédula</th><th style={th}>Activo</th><th style={th}></th></tr></thead>
        <tbody>
          {lista.map((c) => (
            <tr key={c.id} style={tr}>
              <td style={td}>{c.nombre_neo}</td><td style={td}>{c.cedula || '—'}</td><td style={td}>{c.activo ? '✅' : '—'}</td>
              <td style={td}>{esAdmin && <button style={btnSm} onClick={() => setEdit({ ...c })}>Editar</button>}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      {edit && (
        <Modal onClose={() => setEdit(null)} titulo={edit.nombre_neo}>
          <Campo label="Cédula"><input value={edit.cedula || ''} onChange={(e) => setEdit({ ...edit, cedula: e.target.value })} style={inp} /></Campo>
          <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13, margin: '6px 0' }}>
            <input type="checkbox" checked={!!edit.activo} onChange={(e) => setEdit({ ...edit, activo: e.target.checked })} /> Activo
          </label>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button style={btn(C.naranja)} onClick={onSave}>Guardar</button>
            <button style={btn(C.gris)} onClick={() => setEdit(null)}>Cancelar</button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── PLANTILLAS ───────────────────────────────────────────────────────────────
function Plantillas({ cat, email, esAdmin, recargarCat }) {
  const [msg, setMsg] = useState(null)
  const lista = cat?.plantillas || []
  async function toggle(p) {
    try { await guardar({ actor: email, recurso: 'plantilla', accion: 'toggle', id: p.id, activa: !p.activa }); recargarCat?.() }
    catch (e) { setMsg({ ok: false, t: e.message }) }
  }
  return (
    <div>
      <Msg msg={msg} />
      <Tabla>
        <thead><tr style={trh}><th style={th}>Plantilla</th><th style={th}>Tipo</th><th style={th}>Requiere PDF</th><th style={th}>Líneas</th><th style={th}>Activa</th><th style={th}></th></tr></thead>
        <tbody>
          {lista.map((p) => (
            <tr key={p.id} style={tr}>
              <td style={td}>{p.nombre}<div style={{ fontSize: 11, color: C.gris }}>{p.descripcion || ''}</div></td>
              <td style={td}>{p.tipo}</td>
              <td style={td}>{p.requiere_pdf ? '📎 Sí' : '—'}</td>
              <td style={td}>{(p.lineas || []).length}</td>
              <td style={td}>{p.activa ? '✅' : '⏸️'}</td>
              <td style={td}>{esAdmin && <button style={btnSm} onClick={() => toggle(p)}>{p.activa ? 'Desactivar' : 'Activar'}</button>}</td>
            </tr>
          ))}
        </tbody>
      </Tabla>
      <div style={{ fontSize: 12, color: C.gris, marginTop: 8 }}>
        Las plantillas de leasing con “Requiere PDF” no se pueden aprobar sin el PDF (el principal viene solo en el PDF, no en el XML).
      </div>
    </div>
  )
}

// ── UI helpers ───────────────────────────────────────────────────────────────
function Barra({ children }) { return <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>{children}</div> }
function Tabla({ children }) {
  return <div style={{ background: 'white', border: `1px solid ${C.borde}`, borderRadius: 10, overflow: 'hidden' }}>
    <div style={{ overflowX: 'auto', maxHeight: 620, overflowY: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>{children}</table></div>
  </div>
}
function Msg({ msg }) { if (!msg) return null; return <div style={{ padding: '8px 12px', borderRadius: 8, fontSize: 13, marginBottom: 10, background: msg.ok ? '#dcfce7' : '#fee2e2', color: msg.ok ? C.verde : C.rojo }}>{msg.t}</div> }
function Campo({ label, children }) { return <div style={{ marginBottom: 8 }}><label style={{ fontSize: 10.5, fontWeight: 700, color: C.petroleo, textTransform: 'uppercase', letterSpacing: 0.4, display: 'block', marginBottom: 4 }}>{label}</label>{children}</div> }
function Chip({ v }) {
  const col = { gasto: C.petroleo, mercaderia: C.naranja, preguntar: C.ambar, ignorar: C.gris, por_clasificar: C.rojo }[v] || C.gris
  return <span style={{ fontSize: 11, fontWeight: 600, color: col, background: col + '18', borderRadius: 5, padding: '1px 7px' }}>{v}</span>
}
function Modal({ children, onClose, titulo }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', zIndex: 1000, padding: '48px 16px', overflowY: 'auto' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, padding: '20px 22px', width: '100%', maxWidth: 460 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: C.vino, marginBottom: 12 }}>{titulo}</div>
        {children}
      </div>
    </div>
  )
}
const inp = { padding: '7px 10px', borderRadius: 7, border: `1px solid ${C.bordeFuerte}`, fontSize: 13, outline: 'none', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' }
const trh = { background: C.petroleo, color: 'white', position: 'sticky', top: 0 }
const th = { textAlign: 'left', padding: '9px 10px', fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.5, whiteSpace: 'nowrap' }
const tr = { borderBottom: `1px solid ${C.borde}` }
const td = { padding: '8px 10px', color: '#111827', verticalAlign: 'top' }
function btn(bg) { return { background: bg, color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' } }
const btnSm = { background: 'white', color: C.vino, border: `1px solid ${C.bordeFuerte}`, borderRadius: 6, padding: '3px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }
