'use client'
import { useState, useEffect, useMemo, useCallback } from 'react'
import { useAuth } from '../../lib/useAuth'
import { C, MOD, api, norm, useCatalogos, fontTitulo } from './lib'
import BandejaTab from './BandejaTab'
import MontarTab from './MontarTab'
import EnviadosTab from './EnviadosTab'
import CatalogosTab from './CatalogosTab'

const TABS = [
  ['bandeja', '📥 Bandeja'],
  ['montar', '✍️ Montar'],
  ['enviados', '📤 Enviados'],
  ['catalogos', '📚 Catálogos'],
]

const ATAJOS = [
  [`${MOD}S`, 'Guardar borrador'],
  [`${MOD}↵`, 'Aprobar y mandar a NEO'],
  [`${MOD}K`, 'Buscador universal (proveedor, cuenta, centro)'],
  ['Tab / ⇧Tab', 'Navegar entre campos'],
  ['Enter en una línea', 'Crear la línea siguiente'],
  [`${MOD}⌫`, 'Borrar la línea actual'],
  [`${MOD}↓ / ${MOD}↑`, 'Siguiente / anterior factura de la bandeja'],
  ['Esc', 'Cerrar diálogo o cancelar'],
  ['?', 'Mostrar esta ayuda'],
]

export default function ContabilidadPage() {
  const { perfil, user, loading: authLoad, puedeVer } = useAuth()
  const email = user?.email || perfil?.email || null
  const [tab, setTab] = useState('bandeja')
  const [ayuda, setAyuda] = useState(false)
  const [buscador, setBuscador] = useState(false)
  const { cat, loading: catLoad, recargar } = useCatalogos(email)

  // Atajos globales del módulo: ⌘K y ?
  useEffect(() => {
    const h = (e) => {
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscador((v) => !v) }
      else if (e.key === '?' && !enCampo(e)) { e.preventDefault(); setAyuda((v) => !v) }
      else if (e.key === 'Escape') { setBuscador(false); setAyuda(false) }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  if (authLoad) return <Estado>Cargando…</Estado>
  if (!puedeVer('contabilidad')) return (
    <Estado><h2 style={{ color: C.vino }}>🔒 Sin acceso</h2><p style={{ color: C.gris }}>No tenés permiso para ver Contabilidad. Pedíselo a un admin.</p></Estado>
  )

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', fontFamily: 'Rubik, sans-serif' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.naranja }}>Finanzas · Génesis Orión</span>
          <h1 style={{ fontFamily: fontTitulo, fontSize: '1.9rem', color: C.vino, margin: '2px 0 0', letterSpacing: '0.01em' }}>📒 Contabilidad</h1>
          <p style={{ fontSize: 13, color: C.gris, margin: '3px 0 0' }}>Armá el asiento acá, corregilo y mandalo a NEO. {cat?.yo ? `Tu rol: ${cat.yo.rol}.` : 'Sin rol asignado (solo lectura).'}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setBuscador(true)} style={btnGhost}>🔍 Buscar <kbd style={kbd}>{MOD}K</kbd></button>
          <button onClick={() => setAyuda(true)} style={btnGhost}>Atajos <kbd style={kbd}>?</kbd></button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: `2px solid ${C.borde}`, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} style={{
            padding: '10px 18px', fontSize: 13.5, fontWeight: 700, border: 'none', background: 'transparent',
            color: tab === k ? C.vino : C.gris, borderBottom: `3px solid ${tab === k ? C.naranja : 'transparent'}`,
            cursor: 'pointer', marginBottom: -2, fontFamily: 'inherit',
          }}>{l}</button>
        ))}
      </div>

      {catLoad && !cat ? <Estado>Cargando catálogos…</Estado> : (
        <>
          {tab === 'bandeja' && <BandejaTab cat={cat} email={email} recargarCat={recargar} onMontarManual={() => setTab('montar')} />}
          {tab === 'montar' && <MontarTab cat={cat} email={email} onCreado={() => setTab('bandeja')} />}
          {tab === 'enviados' && <EnviadosTab email={email} />}
          {tab === 'catalogos' && <CatalogosTab cat={cat} email={email} recargarCat={recargar} />}
        </>
      )}

      {ayuda && <Ayuda onClose={() => setAyuda(false)} />}
      {buscador && <Buscador cat={cat} onClose={() => setBuscador(false)} />}
    </div>
  )
}

function enCampo(e) {
  const t = e.target
  return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)
}

// ── Buscador universal ⌘K ────────────────────────────────────────────────────
function Buscador({ cat, onClose }) {
  const [q, setQ] = useState('')
  const resultados = useMemo(() => {
    const nq = norm(q)
    if (!nq) return []
    const out = []
    for (const p of cat?.proveedores || []) if (norm(p.nombre + ' ' + (p.cedula || '')).includes(nq)) out.push({ tipo: 'Proveedor', main: p.nombre, sub: `${p.cedula || ''} · ${p.clasificacion}`, color: C.petroleo })
    for (const c of cat?.cuentas || []) if (c.imputable && norm(c.codigo + ' ' + c.nombre).includes(nq)) out.push({ tipo: 'Cuenta', main: c.codigo, sub: c.nombre, color: C.vino })
    for (const c of cat?.centros || []) if (norm(c.nombre_neo + ' ' + (c.cedula || '')).includes(nq)) out.push({ tipo: 'Centro', main: c.nombre_neo, sub: c.cedula || '', color: C.naranja })
    return out.slice(0, 40)
  }, [q, cat])

  return (
    <Overlay onClose={onClose} align="flex-start">
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 560, marginTop: 60, overflow: 'hidden', boxShadow: '0 24px 60px rgba(0,0,0,0.3)' }}>
        <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proveedor, cuenta o centro de costo…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '15px 18px', border: 'none', borderBottom: `1px solid ${C.borde}`, fontSize: 15, outline: 'none' }} />
        <div style={{ maxHeight: 380, overflowY: 'auto' }}>
          {resultados.length === 0 ? <div style={{ padding: 18, color: C.gris, fontSize: 13 }}>{q ? 'Sin resultados.' : 'Escribí para buscar…'}</div>
            : resultados.map((r, i) => (
              <div key={i} style={{ padding: '9px 16px', borderBottom: `1px solid ${C.borde}`, display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 9.5, fontWeight: 700, color: r.color, background: r.color + '18', borderRadius: 5, padding: '2px 7px', minWidth: 66, textAlign: 'center' }}>{r.tipo}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{r.main}</span>
                <span style={{ color: C.gris, fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.sub}</span>
              </div>
            ))}
        </div>
        <div style={{ padding: '8px 16px', fontSize: 11, color: C.gris, background: C.crema }}>Esc para cerrar</div>
      </div>
    </Overlay>
  )
}

function Ayuda({ onClose }) {
  return (
    <Overlay onClose={onClose} align="center">
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'white', borderRadius: 14, width: '100%', maxWidth: 480, padding: '20px 24px' }}>
        <div style={{ fontFamily: fontTitulo, fontSize: 18, color: C.vino, marginBottom: 12 }}>Atajos de teclado</div>
        {ATAJOS.map(([k, d]) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${C.borde}`, fontSize: 13 }}>
            <span style={{ color: '#111827' }}>{d}</span>
            <kbd style={{ ...kbd, whiteSpace: 'nowrap' }}>{k}</kbd>
          </div>
        ))}
        <div style={{ fontSize: 12, color: C.gris, marginTop: 12 }}>Todo lo que hacés con el teclado también tiene su botón en pantalla.</div>
        <button onClick={onClose} style={{ ...btnGhost, marginTop: 14 }}>Cerrar (Esc)</button>
      </div>
    </Overlay>
  )
}

function Overlay({ children, onClose, align }) {
  return <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: align, justifyContent: 'center', zIndex: 1200, padding: 16 }}>{children}</div>
}
function Estado({ children }) { return <div style={{ padding: 48, fontFamily: 'Rubik, sans-serif' }}>{children}</div> }

const btnGhost = { background: 'white', border: `1px solid ${C.bordeFuerte}`, borderRadius: 8, padding: '7px 12px', fontSize: 12.5, fontWeight: 600, color: C.vino, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center' }
const kbd = { fontSize: 10, background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 4, padding: '1px 5px', marginLeft: 6, fontFamily: 'inherit' }
