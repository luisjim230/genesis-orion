'use client'
import { useState, useRef, useEffect, useMemo, useCallback, useId } from 'react'
import { createPortal } from 'react-dom'
import { C, norm } from './lib'

const REDUCED = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Combobox accesible con menú en portal (no lo recorta la tabla).
// items: [{ value, main, sub, display?, keywords?, group?, priority?, veces?, disabled? }]
//  - main   = primera línea (nombre), se envuelve en 2 líneas, resalta la coincidencia
//  - sub    = segunda línea (apoyo, gris)
//  - display= texto del disparador cuando está elegido (default main)
//  - orden por defecto: priority desc → veces desc → alfabético
//  - al escribir: calidad de coincidencia (empieza-por > contiene) → veces
export default function Combobox({
  items, value, onChange, placeholder = 'Buscar…', disabled = false,
  grouped = false, autoFocus = false, ariaLabel, warn = false, onEnterEmpty,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hi, setHi] = useState(0)
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const baseId = useId()

  const selected = useMemo(() => items.find((i) => i.value === value) || null, [items, value])

  // ── Filtrado + orden ────────────────────────────────────────────────────────
  const filtrados = useMemo(() => {
    const q = norm(query)
    if (!q) {
      return [...items].sort((a, b) =>
        (b.priority || 0) - (a.priority || 0) ||
        (b.veces || 0) - (a.veces || 0) ||
        String(a.main).localeCompare(String(b.main)))
    }
    const terms = q.split(/\s+/).filter(Boolean)
    const scored = []
    for (const i of items) {
      const hayMain = norm(i.main)
      const hay = norm((i.keywords || '') + ' ' + i.main + ' ' + (i.sub || ''))
      if (!terms.every((t) => hay.includes(t))) continue
      // calidad: 2 = empieza por; 1 = contiene en el nombre; 0 = contiene en apoyo
      let score = 0
      if (hayMain.startsWith(q)) score = 2
      else if (hayMain.includes(q)) score = 1
      scored.push({ i, score })
    }
    return scored
      .sort((a, b) => b.score - a.score || (b.i.veces || 0) - (a.i.veces || 0) || String(a.i.main).localeCompare(String(b.i.main)))
      .map((s) => s.i)
  }, [items, query])

  const rows = useMemo(() => {
    if (!grouped) return filtrados.map((i) => ({ type: 'opt', i }))
    const out = []
    const prio = filtrados.filter((i) => (i.priority || 0) > 0)
    const resto = filtrados.filter((i) => !(i.priority || 0))
    if (prio.length) {
      out.push({ type: 'head', label: '★ Más usadas' })
      for (const i of prio) out.push({ type: 'opt', i })
    }
    const porGrupo = {}
    for (const i of resto) (porGrupo[i.group || 'Otras'] ||= []).push(i)
    for (const g of Object.keys(porGrupo).sort()) {
      out.push({ type: 'head', label: g })
      for (const i of porGrupo[g]) out.push({ type: 'opt', i })
    }
    return out
  }, [filtrados, grouped])

  const optIndexes = useMemo(() => rows.map((r, idx) => (r.type === 'opt' ? idx : -1)).filter((x) => x >= 0), [rows])
  const currentRowIdx = optIndexes[hi] ?? -1
  const activeId = currentRowIdx >= 0 ? `${baseId}-opt-${currentRowIdx}` : undefined

  // ── Posición del menú (portal, position:fixed) ──────────────────────────────
  const recompute = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    let width = Math.min(Math.max(r.width, 420), 560)
    if (r.width > 560) width = r.width
    let left = Math.min(r.left, vw - width - 8)
    if (left < 8) left = 8
    const maxH = 340
    const spaceBelow = vh - r.bottom, spaceAbove = r.top
    const up = spaceBelow < 260 && spaceAbove > spaceBelow
    setPos({ left, width, top: up ? undefined : r.bottom + 4, bottom: up ? vh - r.top + 4 : undefined, maxH: Math.min(maxH, (up ? spaceAbove : spaceBelow) - 12) })
  }, [])

  const abrir = useCallback(() => {
    if (disabled) return
    setOpen(true); setQuery(''); setHi(0); recompute()
    setTimeout(() => inputRef.current?.focus(), 0)
  }, [disabled, recompute])
  const cerrar = useCallback(() => { setOpen(false); setQuery(''); triggerRef.current?.focus() }, [])

  const elegir = useCallback((item) => {
    if (!item || item.disabled) return
    onChange(item.value); setOpen(false); setQuery('')
  }, [onChange])

  useEffect(() => {
    if (!open) return
    const onScrollResize = () => recompute()
    window.addEventListener('scroll', onScrollResize, true)
    window.addEventListener('resize', onScrollResize)
    const onDoc = (e) => {
      if (triggerRef.current?.contains(e.target)) return
      if (listRef.current?.contains(e.target)) return
      setOpen(false); setQuery('')
    }
    document.addEventListener('mousedown', onDoc)
    return () => {
      window.removeEventListener('scroll', onScrollResize, true)
      window.removeEventListener('resize', onScrollResize)
      document.removeEventListener('mousedown', onDoc)
    }
  }, [open, recompute])

  // mantener la opción activa a la vista
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector('[data-hi="1"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [hi, open, rows])

  useEffect(() => { if (autoFocus) abrir() }, [autoFocus, abrir])

  const onKey = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); abrir() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, optIndexes.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Home') { e.preventDefault(); setHi(0) }
    else if (e.key === 'End') { e.preventDefault(); setHi(optIndexes.length - 1) }
    else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation()
      const row = rows[currentRowIdx]
      if (row?.i) elegir(row.i)
      else if (!filtrados.length && onEnterEmpty) onEnterEmpty(query)
    }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar() }
    else if (e.key === 'Tab') { setOpen(false); setQuery('') }
  }

  const triggerText = selected ? (selected.display || selected.main) : placeholder

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? cerrar() : abrir())}
        onKeyDown={onKey}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        style={{
          width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 8,
          border: `1px solid ${open ? C.naranja : (warn && !selected ? C.ambar : C.bordeFuerte)}`,
          background: disabled ? '#f3f4f6' : (warn && !selected ? C.ambarBg : 'white'),
          color: selected ? '#111827' : (warn ? C.ambar : C.grisClaro),
          fontSize: 13, fontWeight: warn && !selected ? 600 : 400,
          cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
          outline: 'none', boxShadow: open ? `0 0 0 3px ${C.naranja}55` : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{triggerText}</span>
        <span style={{ color: C.grisClaro, fontSize: 10 }}>▾</span>
      </button>

      {open && pos && createPortal(
        <div
          ref={listRef}
          style={{
            position: 'fixed', left: pos.left, top: pos.top, bottom: pos.bottom, width: pos.width,
            background: 'white', border: `1px solid ${C.bordeFuerte}`, borderRadius: 10,
            boxShadow: '0 16px 44px rgba(0,0,0,0.22)', overflow: 'hidden', zIndex: 3000,
            display: 'flex', flexDirection: 'column',
          }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHi(0) }}
            onKeyDown={onKey}
            role="combobox"
            aria-expanded="true"
            aria-controls={`${baseId}-list`}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label={ariaLabel || 'Buscar'}
            placeholder="Escribí código o nombre…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: 'none',
              borderBottom: `1px solid ${C.borde}`, fontSize: 13.5, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <div id={`${baseId}-list`} role="listbox" style={{ maxHeight: pos.maxH, overflowY: 'auto' }}>
            {rows.length === 0 && <div style={{ padding: 14, fontSize: 12.5, color: C.gris }}>Sin resultados.</div>}
            {rows.map((row, idx) => row.type === 'head' ? (
              <div key={'h' + idx} style={{
                padding: '6px 12px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: 0.5, color: C.petroleo, background: C.crema, position: 'sticky', top: 0,
              }}>{row.label}</div>
            ) : (
              <div
                key={row.i.value}
                id={`${baseId}-opt-${idx}`}
                role="option"
                aria-selected={idx === currentRowIdx}
                data-hi={idx === currentRowIdx ? '1' : '0'}
                onMouseEnter={() => setHi(optIndexes.indexOf(idx))}
                onMouseDown={(e) => { e.preventDefault(); elegir(row.i) }}
                style={{
                  padding: '8px 12px', fontSize: 13, cursor: row.i.disabled ? 'not-allowed' : 'pointer',
                  background: idx === currentRowIdx ? C.naranja + '22' : 'transparent',
                  color: row.i.disabled ? C.grisClaro : '#111827',
                  borderBottom: `1px solid ${C.borde}`,
                  transition: REDUCED ? 'none' : 'background .08s',
                }}
              >
                <div style={{ fontWeight: 500, lineHeight: 1.25, wordBreak: 'break-word' }}>
                  {resaltar(row.i.main, query)}
                </div>
                {row.i.sub && <div style={{ fontSize: 11.5, color: C.gris, marginTop: 1, lineHeight: 1.2 }}>{row.i.sub}</div>}
              </div>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// Resalta en `texto` el primer tramo que coincide con `q` (sin acentos).
function resaltar(texto, q) {
  const nq = norm(q)
  if (!nq) return texto
  const nt = norm(texto)
  const i = nt.indexOf(nq)
  if (i < 0) return texto
  return (
    <>
      {texto.slice(0, i)}
      <mark style={{ background: C.naranja + '44', color: 'inherit', padding: 0, borderRadius: 2 }}>{texto.slice(i, i + q.length)}</mark>
      {texto.slice(i + q.length)}
    </>
  )
}
