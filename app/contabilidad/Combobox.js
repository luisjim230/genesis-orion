'use client'
import { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import { C, norm } from './lib'

// Combobox accesible: teclado primero y mouse completo.
//  - filtra sin acentos y sin distinguir mayúsculas
//  - busca por código (main) y por nombre (sub)
//  - flechas para navegar, Enter para confirmar, Esc para cerrar
//  - agrupa por `group`; opciones con priority>0 van arriba ("más usadas")
//  - clic normal para abrir y elegir
//
// items: [{ value, main, sub, group?, keywords?, priority?, disabled? }]
export default function Combobox({
  items, value, onChange, placeholder = 'Buscar…', disabled = false,
  grouped = false, autoFocus = false, ariaLabel, tabIndex, onEnterEmpty, warn = false,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [hi, setHi] = useState(0)
  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const selected = useMemo(() => items.find((i) => i.value === value) || null, [items, value])

  const filtrados = useMemo(() => {
    const q = norm(query)
    let list = items
    if (q) {
      const terms = q.split(/\s+/).filter(Boolean)
      list = items.filter((i) => {
        const hay = norm((i.keywords || '') + ' ' + i.main + ' ' + (i.sub || ''))
        return terms.every((t) => hay.includes(t))
      })
    }
    // ordenar: prioridad desc, luego main asc
    return [...list].sort((a, b) => (b.priority || 0) - (a.priority || 0) || String(a.main).localeCompare(String(b.main)))
  }, [items, query])

  // Aplanado con encabezados de grupo (solo para render agrupado)
  const rows = useMemo(() => {
    if (!grouped) return filtrados.map((i) => ({ type: 'opt', i }))
    const out = []
    // Primero las prioritarias (más usadas) sin encabezado de grupo
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

  const abrir = useCallback(() => { if (!disabled) { setOpen(true); setQuery(''); setHi(0); setTimeout(() => inputRef.current?.focus(), 0) } }, [disabled])
  const cerrar = useCallback(() => { setOpen(false); setQuery('') }, [])

  const elegir = useCallback((item) => {
    if (!item || item.disabled) return
    onChange(item.value)
    cerrar()
  }, [onChange, cerrar])

  // cerrar al hacer clic afuera
  useEffect(() => {
    if (!open) return
    const h = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) cerrar() }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [open, cerrar])

  // mantener el resaltado visible
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector('[data-hi="1"]')
    if (el) el.scrollIntoView({ block: 'nearest' })
  }, [hi, open])

  const currentRowIdx = optIndexes[hi] ?? -1

  const onKey = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === ' ') { e.preventDefault(); abrir() }
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, optIndexes.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
    else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation()
      const row = rows[currentRowIdx]
      if (row?.i) elegir(row.i)
      else if (!filtrados.length && onEnterEmpty) onEnterEmpty(query)
    }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cerrar() }
    else if (e.key === 'Tab') { cerrar() }
  }

  useEffect(() => { if (autoFocus) abrir() }, [autoFocus, abrir])

  return (
    <div ref={rootRef} style={{ position: 'relative', width: '100%' }}>
      <button
        type="button"
        onClick={() => (open ? cerrar() : abrir())}
        onKeyDown={onKey}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        tabIndex={tabIndex}
        style={{
          width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 8,
          border: `1px solid ${open ? C.naranja : (warn && !selected ? C.ambar : C.bordeFuerte)}`,
          background: disabled ? '#f3f4f6' : (warn && !selected ? C.ambarBg : 'white'),
          color: selected ? '#111827' : (warn ? C.ambar : C.grisClaro),
          fontSize: 13, fontWeight: warn && !selected ? 600 : 400,
          cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'inherit',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6,
          outline: 'none', boxShadow: open ? `0 0 0 3px ${C.naranja}33` : 'none',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {selected ? (selected.main + (selected.sub ? ' · ' + selected.sub : '')) : placeholder}
        </span>
        <span style={{ color: C.grisClaro, fontSize: 10 }}>▾</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute', zIndex: 50, top: '100%', left: 0, right: 0, marginTop: 4,
          background: 'white', border: `1px solid ${C.bordeFuerte}`, borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.18)', overflow: 'hidden',
        }}>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setHi(0) }}
            onKeyDown={onKey}
            placeholder="Escribí código o nombre…"
            style={{
              width: '100%', boxSizing: 'border-box', padding: '9px 11px', border: 'none',
              borderBottom: `1px solid ${C.borde}`, fontSize: 13, outline: 'none', fontFamily: 'inherit',
            }}
          />
          <div ref={listRef} style={{ maxHeight: 280, overflowY: 'auto' }}>
            {rows.length === 0 && (
              <div style={{ padding: '12px', fontSize: 12, color: C.gris }}>Sin resultados.</div>
            )}
            {rows.map((row, idx) => row.type === 'head' ? (
              <div key={'h' + idx} style={{
                padding: '6px 11px', fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: 0.5, color: C.petroleo, background: C.crema, position: 'sticky', top: 0,
              }}>{row.label}</div>
            ) : (
              <div
                key={row.i.value}
                data-hi={idx === currentRowIdx ? '1' : '0'}
                onMouseEnter={() => setHi(optIndexes.indexOf(idx))}
                onMouseDown={(e) => { e.preventDefault(); elegir(row.i) }}
                style={{
                  padding: '7px 11px', fontSize: 13, cursor: row.i.disabled ? 'not-allowed' : 'pointer',
                  background: idx === currentRowIdx ? C.naranja + '22' : 'transparent',
                  color: row.i.disabled ? C.grisClaro : '#111827',
                  display: 'flex', justifyContent: 'space-between', gap: 10,
                }}
              >
                <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{row.i.main}</span>
                <span style={{ color: C.gris, overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, textAlign: 'right' }}>{row.i.sub}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
