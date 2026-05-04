'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/useAuth';

// ── Design Tokens (Liquid Glass Light) ──────────────────────────────────────
const C = {
  gold: '#c8a84b',
  goldLight: '#f5efd8',
  green: '#2e7d4f',
  blue: '#3b6ea5',
  orange: '#c8882b',
  red: '#c04040',
  text: '#1e2a3a',
  muted: '#6b7a8d',
  white: '#ffffff',
  border: 'rgba(255,255,255,0.6)',
  cardBg: 'rgba(255,255,255,0.55)',
  pageBg: 'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)',
};

const glassBorder = `1px solid ${C.border}`;
const glassCard = {
  background: C.cardBg,
  backdropFilter: 'blur(24px) saturate(1.8)',
  WebkitBackdropFilter: 'blur(24px) saturate(1.8)',
  border: glassBorder,
  borderRadius: 20,
  padding: 'clamp(16px, 3vw, 24px)',
  boxShadow: '0 4px 24px rgba(30,42,58,0.07)',
};

const S = {
  page: {
    background: C.pageBg,
    minHeight: '100vh',
    fontFamily: 'Rubik, sans-serif',
    color: C.text,
    padding: 'clamp(16px, 4vw, 32px)',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: 16, marginBottom: 24,
  },
  title: { fontSize: 'clamp(1.3rem, 3vw, 1.7rem)', fontWeight: 800, color: C.text, margin: 0 },
  subtitle: { fontSize: '0.82rem', color: C.muted, fontWeight: 500, marginTop: 2 },
  card: { ...glassCard },
  cardSm: { ...glassCard, padding: 'clamp(12px, 2vw, 18px)' },
  tabBar: {
    display: 'flex', gap: 4, background: 'rgba(255,255,255,0.35)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 14, padding: 4, marginBottom: 24,
    border: glassBorder, flexWrap: 'wrap',
  },
  tab: {
    padding: '10px 22px', borderRadius: 11, border: 'none',
    background: 'transparent', cursor: 'pointer',
    fontSize: '0.88rem', fontWeight: 600, color: C.muted,
    fontFamily: 'Rubik, sans-serif', transition: 'all .2s',
  },
  tabOn: {
    padding: '10px 22px', borderRadius: 11, border: 'none',
    background: C.white, cursor: 'pointer',
    fontSize: '0.88rem', fontWeight: 700, color: C.gold,
    fontFamily: 'Rubik, sans-serif',
    boxShadow: '0 2px 10px rgba(200,168,75,0.15)', transition: 'all .2s',
  },
  th: {
    padding: '10px 14px', fontSize: '0.72rem', fontWeight: 700,
    color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em',
    borderBottom: '2px solid rgba(200,168,75,0.2)',
    textAlign: 'left', whiteSpace: 'nowrap',
    background: 'rgba(255,255,255,0.3)',
  },
  td: {
    padding: '10px 14px', fontSize: '0.84rem',
    borderBottom: '1px solid rgba(200,168,75,0.08)', color: C.text,
  },
  label: {
    fontSize: '0.73rem', fontWeight: 700, color: C.muted,
    marginBottom: 6, display: 'block',
    textTransform: 'uppercase', letterSpacing: '0.06em',
  },
  select: {
    padding: '9px 14px', borderRadius: 12, border: glassBorder,
    background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)',
    fontSize: '0.88rem', color: C.text, fontFamily: 'Rubik, sans-serif', outline: 'none',
  },
  input: {
    padding: '9px 14px', borderRadius: 12, border: glassBorder,
    background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(8px)',
    fontSize: '0.88rem', color: C.text, fontFamily: 'Rubik, sans-serif',
    outline: 'none', width: '100%', boxSizing: 'border-box',
  },
  btnPrimary: {
    background: `linear-gradient(135deg, ${C.gold}, #d4b85c)`,
    color: '#fff', border: 'none', borderRadius: 12,
    padding: '10px 24px', fontWeight: 700, cursor: 'pointer',
    fontSize: '0.88rem', fontFamily: 'Rubik, sans-serif',
    boxShadow: '0 2px 12px rgba(200,168,75,0.3)', transition: 'all .2s',
  },
  btnGhost: {
    background: 'rgba(255,255,255,0.5)', color: C.text, border: glassBorder,
    borderRadius: 12, padding: '9px 18px', fontWeight: 600, cursor: 'pointer',
    fontSize: '0.85rem', fontFamily: 'Rubik, sans-serif',
    backdropFilter: 'blur(8px)',
  },
  kicker: {
    color: C.gold, fontSize: '0.7rem', fontWeight: 700,
    letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6,
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
const CRC = v => new Intl.NumberFormat('es-CR', {
  style: 'currency', currency: 'CRC', maximumFractionDigits: 0,
}).format(parseFloat(v) || 0);
const CRCnoSym = v => new Intl.NumberFormat('es-CR', {
  maximumFractionDigits: 0,
}).format(parseFloat(v) || 0);
const N = v => parseFloat(v) || 0;

const SEMAFORO = {
  sin_contactar: { label: 'Sin contactar', bg: '#1e2a3a', text: '#ffffff',     emoji: '⚫', orden: 1 },
  atrasado:      { label: 'Atrasado',      bg: '#fee2e2', text: '#b91c1c',     emoji: '🔴', orden: 2 },
  toca_hoy:      { label: 'Toca hoy',      bg: '#fef3c7', text: '#92400e',     emoji: '🟡', orden: 3 },
  al_dia:        { label: 'Al día',        bg: '#d1fae5', text: '#065f46',     emoji: '🟢', orden: 4 },
  completo:      { label: 'Completo',      bg: '#dbeafe', text: '#1d4ed8',     emoji: '✓',  orden: 5 },
  ganada:        { label: 'Facturada',     bg: '#ede9fe', text: '#6b21a8',     emoji: '💰', orden: 6 },
  sin_tier:      { label: 'Sin tier',      bg: '#f1f5f9', text: '#64748b',     emoji: '—',  orden: 7 },
};

const CANALES = ['whatsapp', 'llamada', 'email', 'presencial', 'otro'];
const RESULTADOS = ['interesado', 'pensandolo', 'sin_respuesta', 'objecion_precio', 'objecion_producto', 'ganada', 'perdida'];

function fmtFecha(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return String(d).slice(0, 10); }
}
function fmtFechaHora(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return String(d).slice(0, 16); }
}

// ── Sub-componentes ─────────────────────────────────────────────────────────
function SemaforoBadge({ semaforo }) {
  const cfg = SEMAFORO[semaforo] || SEMAFORO.sin_tier;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      background: cfg.bg, color: cfg.text,
      padding: '3px 8px', borderRadius: 999,
      fontSize: '0.74rem', fontWeight: 700, whiteSpace: 'nowrap',
    }}>
      <span>{cfg.emoji}</span>
      <span>{cfg.label}</span>
    </span>
  );
}

function TierBadge({ nombre, color }) {
  if (!nombre) return <span style={{ color: C.muted, fontSize: '0.78rem' }}>—</span>;
  const c = color || '#888';
  return (
    <span style={{
      display: 'inline-block',
      background: c + '22', color: c,
      border: `1px solid ${c}55`,
      padding: '2px 9px', borderRadius: 999,
      fontSize: '0.72rem', fontWeight: 700,
    }}>{nombre}</span>
  );
}

function MargenCell({ pct, faltan }) {
  if (pct === null || pct === undefined) {
    return <span style={{ color: C.muted, fontSize: '0.78rem' }}>—</span>;
  }
  const v = N(pct);
  const color = v >= 30 ? C.green : v >= 15 ? C.orange : C.red;
  return (
    <span style={{ color, fontWeight: 700 }}>
      {v.toFixed(1)}%
      {faltan ? <span title="Costos faltantes en algunos ítems"> ⚠️</span> : null}
    </span>
  );
}

function KpiCard({ kicker, value, sub, accent, danger }) {
  return (
    <div style={{
      ...S.cardSm,
      borderTop: danger ? `3px solid ${C.red}` : 'none',
    }}>
      <div style={S.kicker}>{kicker}</div>
      <div style={{
        fontSize: 'clamp(1.1rem, 2.6vw, 1.5rem)',
        fontWeight: 800,
        color: danger ? C.red : (accent || C.text),
        lineHeight: 1.15,
      }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.74rem', color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ padding: 48, textAlign: 'center', color: C.muted, fontSize: '0.9rem' }}>
      Cargando...
    </div>
  );
}

function Empty({ msg, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: 60, color: C.muted }}>
      <div style={{ fontSize: '2rem', marginBottom: 10, opacity: 0.4 }}>—</div>
      <div style={{ fontWeight: 700, color: C.text, marginBottom: 6 }}>{msg}</div>
      {sub && <div style={{ fontSize: '0.84rem' }}>{sub}</div>}
    </div>
  );
}

// ── Drawer (detalle de proforma) ───────────────────────────────────────────
function Drawer({ proforma, onClose, perfil, onChange }) {
  const [lineas, setLineas] = useState(null);
  const [seguimientos, setSeguimientos] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ canal: 'whatsapp', resultado: 'interesado', nota: '', razon: '' });
  const [guardando, setGuardando] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  const [okMsg, setOkMsg] = useState(null);

  const cargar = useCallback(async () => {
    if (!proforma) return;
    const [li, sg] = await Promise.all([
      supabase.from('hermes_proformas_items').select('*').eq('proforma', proforma.proforma).order('id'),
      supabase.from('hermes_seguimientos').select('*').eq('proforma', proforma.proforma).order('numero_seguimiento'),
    ]);
    setLineas(li.data || []);
    setSeguimientos(sg.data || []);
  }, [proforma]);

  useEffect(() => { cargar(); }, [cargar]);

  if (!proforma) return null;

  const handleGuardar = async () => {
    setErrMsg(null);
    if (!form.nota.trim()) { setErrMsg('La nota es obligatoria.'); return; }
    if (form.resultado === 'perdida' && !form.razon.trim()) { setErrMsg('Indicá la razón de pérdida.'); return; }
    setGuardando(true);
    const numeroSeg = proforma.proximo_seg_num;
    const vendedor = perfil?.nombre || perfil?.email || proforma.vendedor || 'sistema';
    const { error } = await supabase.from('hermes_seguimientos').insert({
      proforma: proforma.proforma,
      numero_seguimiento: numeroSeg,
      fecha_realizado: new Date().toISOString(),
      vendedor_realizo: vendedor,
      canal: form.canal,
      estado_resultado: form.resultado,
      razon_perdida: form.resultado === 'perdida' ? form.razon.trim() : null,
      nota: form.nota.trim(),
    });
    if (error) {
      setErrMsg(error.message || 'Error al guardar.');
      setGuardando(false);
      return;
    }
    try { await supabase.rpc('refresh_hermes_panel'); } catch {}
    setOkMsg(`Seguimiento #${numeroSeg} registrado`);
    setShowForm(false);
    setForm({ canal: 'whatsapp', resultado: 'interesado', nota: '', razon: '' });
    setGuardando(false);
    await cargar();
    if (onChange) onChange();
    setTimeout(() => setOkMsg(null), 3000);
  };

  const lineasTotal = proforma.lineas_total || (lineas ? lineas.length : 0);
  const segReal = seguimientos ? seguimientos.length : (proforma.seguimientos_realizados || 0);
  const segReq = proforma.seguimientos_req || 0;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      zIndex: 200, display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick={onClose} style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,0.30)',
      }} />
      <div style={{
        position: 'relative', height: '100%', width: '100%', maxWidth: 720,
        background: '#fff', boxShadow: '-12px 0 40px rgba(0,0,0,0.20)',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'Rubik, sans-serif',
      }}>
        {/* Header sticky */}
        <div style={{
          padding: '20px 24px', borderBottom: `1px solid rgba(0,0,0,0.08)`,
          display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
          gap: 12, position: 'sticky', top: 0, background: '#fff', zIndex: 1,
        }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.7rem', fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Proforma
            </div>
            <div style={{ fontSize: '1.7rem', fontWeight: 800, color: C.text, lineHeight: 1.1, fontFamily: 'monospace' }}>
              #{proforma.proforma}
            </div>
            <div style={{ fontSize: '0.85rem', color: C.muted, marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {proforma.cliente || '—'} · {proforma.vendedor || '—'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <SemaforoBadge semaforo={proforma.semaforo} />
              <TierBadge nombre={proforma.tier_nombre} color={proforma.tier_color} />
              <span style={{ fontSize: '0.78rem', color: C.muted }}>
                Fecha: <strong style={{ color: C.text }}>{fmtFecha(proforma.fecha)}</strong>
              </span>
              <span style={{ fontSize: '0.78rem', color: C.muted }}>
                Total: <strong style={{ color: C.text }}>{CRC(proforma.monto_total)}</strong>
              </span>
            </div>
          </div>
          <button onClick={onClose} style={{
            background: 'rgba(0,0,0,0.04)', border: 'none', borderRadius: 8,
            width: 36, height: 36, cursor: 'pointer',
            fontSize: '1.2rem', color: C.muted, flexShrink: 0,
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
          {okMsg && (
            <div style={{
              background: '#d1fae5', color: '#065f46', borderRadius: 10,
              padding: '10px 14px', marginBottom: 14, fontSize: '0.85rem', fontWeight: 600,
            }}>✓ {okMsg}</div>
          )}

          {/* Sección: Seguimientos */}
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: C.text, margin: '4px 0 12px' }}>
            Seguimientos ({segReal}/{segReq})
          </h3>

          {seguimientos === null ? <Spinner /> : seguimientos.length === 0 ? (
            <div style={{ fontStyle: 'italic', color: '#64748b', fontSize: '0.88rem', padding: '8px 0 18px' }}>
              Aún no se ha registrado ningún seguimiento
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              {seguimientos.map(s => (
                <div key={s.id} style={{
                  background: '#f8fafc', border: '1px solid #e2e8f0',
                  borderRadius: 10, padding: '10px 14px',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: C.text }}>
                      #{s.numero_seguimiento} · {s.canal || '—'} · <span style={{ color: s.estado_resultado === 'perdida' ? C.red : C.blue }}>{s.estado_resultado || '—'}</span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: C.muted, whiteSpace: 'nowrap' }}>
                      {fmtFechaHora(s.fecha_realizado)}
                    </div>
                  </div>
                  {s.nota && <div style={{ fontSize: '0.84rem', color: C.text, lineHeight: 1.4 }}>{s.nota}</div>}
                  {s.razon_perdida && (
                    <div style={{ marginTop: 4, fontSize: '0.78rem', color: C.red }}>
                      Razón pérdida: <strong>{s.razon_perdida}</strong>
                    </div>
                  )}
                  <div style={{ fontSize: '0.72rem', color: C.muted, marginTop: 4 }}>
                    Por: {s.vendedor_realizo || '—'}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!proforma.facturada && proforma.proximo_seg_num != null && !showForm && (
            <button onClick={() => setShowForm(true)} style={{
              width: '100%', padding: '12px 14px',
              background: 'transparent', border: `1.5px dashed ${C.gold}`,
              borderRadius: 12, color: C.gold,
              fontWeight: 700, fontSize: '0.88rem', cursor: 'pointer',
              fontFamily: 'Rubik, sans-serif',
            }}>
              + Registrar seguimiento #{proforma.proximo_seg_num}
            </button>
          )}

          {showForm && (
            <div style={{
              background: '#eef2ff', border: '1px solid #c7d2fe',
              borderRadius: 12, padding: 16, marginTop: 4,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={S.label}>Canal</label>
                  <select value={form.canal} onChange={e => setForm({ ...form, canal: e.target.value })}
                    style={{ ...S.select, width: '100%' }}>
                    {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Resultado</label>
                  <select value={form.resultado} onChange={e => setForm({ ...form, resultado: e.target.value })}
                    style={{ ...S.select, width: '100%' }}>
                    {RESULTADOS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>

              {form.resultado === 'perdida' && (
                <div style={{ marginBottom: 10 }}>
                  <label style={S.label}>Razón de pérdida</label>
                  <input type="text" value={form.razon} onChange={e => setForm({ ...form, razon: e.target.value })}
                    style={S.input} placeholder="Ej: precio, competencia, no responde..." />
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>Nota</label>
                <textarea value={form.nota} onChange={e => setForm({ ...form, nota: e.target.value })}
                  rows={3} style={{ ...S.input, fontFamily: 'inherit', resize: 'vertical' }}
                  placeholder="¿Qué pasó en este contacto?" />
              </div>

              {errMsg && (
                <div style={{
                  background: '#fee2e2', color: '#b91c1c', borderRadius: 8,
                  padding: '8px 12px', marginBottom: 10, fontSize: '0.82rem',
                }}>{errMsg}</div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button onClick={() => { setShowForm(false); setErrMsg(null); }} disabled={guardando}
                  style={S.btnGhost}>Cancelar</button>
                <button onClick={handleGuardar} disabled={guardando} style={S.btnPrimary}>
                  {guardando ? 'Guardando...' : 'Guardar seguimiento'}
                </button>
              </div>
            </div>
          )}

          {/* Sección: Líneas */}
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: C.text, margin: '24px 0 12px' }}>
            Líneas ({lineasTotal})
          </h3>
          {lineas === null ? <Spinner /> : lineas.length === 0 ? (
            <Empty msg="Sin líneas" sub="Esta proforma todavía no tiene líneas cargadas." />
          ) : (
            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                <thead>
                  <tr>
                    <th style={S.th}>Código</th>
                    <th style={S.th}>Ítem</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Cant</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>P. Unit</th>
                    <th style={{ ...S.th, textAlign: 'right' }}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map(l => (
                    <tr key={l.id} style={{ background: l.es_servicio ? '#fffbeb' : 'transparent' }}>
                      <td style={{ ...S.td, fontFamily: 'monospace', color: '#475569' }}>
                        {l.es_servicio ? <span title="Servicio - excluido del cálculo de margen">🚚 </span> : null}
                        {l.codigo_interno || '—'}
                      </td>
                      <td style={{ ...S.td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.item || ''}>
                        {l.item || '—'}
                      </td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{N(l.cantidad_proformada).toLocaleString('es-CR', { maximumFractionDigits: 2 })}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{CRCnoSym(l.precio_unitario_sin_imp)}</td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{CRCnoSym(l.total_linea)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── SLA Días Chips: editor visual de días ───────────────────────────────────
function SlaDiasChips({ value, onChange }) {
  const [nuevo, setNuevo] = useState('');
  const dias = Array.isArray(value) ? value : [];

  function agregar() {
    const n = parseInt(nuevo, 10);
    if (!n || n < 1 || n > 365) return;
    if (dias.includes(n)) { setNuevo(''); return; }
    const next = [...dias, n].sort((a, b) => a - b);
    onChange(next);
    setNuevo('');
  }

  function quitar(d) {
    onChange(dias.filter(x => x !== d));
  }

  function presetTier(arr) {
    onChange([...arr].sort((a, b) => a - b));
  }

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        {dias.length === 0 && (
          <span style={{ fontSize: '0.78rem', color: C.muted, fontStyle: 'italic' }}>Sin días — agregá uno abajo</span>
        )}
        {dias.map(d => (
          <span key={d} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(200,168,75,0.15)',
            color: C.text, fontWeight: 700,
            border: `1px solid ${C.gold}55`,
            padding: '4px 4px 4px 10px', borderRadius: 999,
            fontSize: '0.82rem',
          }}>
            día {d}
            <button onClick={() => quitar(d)} title="Quitar"
              style={{
                background: 'rgba(0,0,0,0.06)', border: 'none', borderRadius: '50%',
                width: 18, height: 18, cursor: 'pointer', fontSize: '0.85rem',
                color: C.muted, lineHeight: 1, display: 'inline-flex',
                alignItems: 'center', justifyContent: 'center',
              }}>×</button>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
          type="number"
          min={1}
          max={365}
          value={nuevo}
          onChange={e => setNuevo(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }}
          placeholder="día"
          style={{ width: 70, padding: '5px 8px', borderRadius: 6, border: '1px solid #cbd5e1', fontSize: '0.82rem' }}
        />
        <button onClick={agregar} type="button"
          style={{
            background: C.gold, color: '#fff', border: 'none', borderRadius: 6,
            padding: '5px 12px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 700,
          }}>+ Agregar</button>
        <span style={{ fontSize: '0.7rem', color: C.muted, marginLeft: 6 }}>Presets:</span>
        {[
          { label: 'Plata', dias: [2, 7] },
          { label: 'Oro', dias: [1, 4, 10] },
          { label: 'Platino', dias: [1, 3, 7, 14] },
        ].map(p => (
          <button key={p.label} onClick={() => presetTier(p.dias)} type="button"
            style={{
              background: 'rgba(255,255,255,0.7)', color: C.text,
              border: '1px solid #cbd5e1', borderRadius: 6,
              padding: '3px 8px', fontSize: '0.72rem', cursor: 'pointer',
            }}>{p.label}</button>
        ))}
      </div>
    </div>
  );
}

// ── Tab: Configuración (editable) ───────────────────────────────────────────
function TabConfig() {
  const [tiers, setTiers] = useState(null);
  const [editId, setEditId] = useState(null);
  const [draft, setDraft] = useState(null);
  const [okMsg, setOkMsg] = useState(null);
  const [errMsg, setErrMsg] = useState(null);
  const [showNuevo, setShowNuevo] = useState(false);

  const cargar = useCallback(async () => {
    const { data } = await supabase.from('hermes_config_tiers').select('*').order('orden');
    setTiers(data || []);
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  function flash(setter, msg, ms = 3000) {
    setter(msg);
    setTimeout(() => setter(null), ms);
  }

  function startEdit(t) {
    setEditId(t.id);
    setDraft({
      nombre: t.nombre || '',
      color_hex: t.color_hex || '#888888',
      monto_min: t.monto_min ?? 0,
      monto_max: t.monto_max ?? '',
      seguimientos_req: t.seguimientos_req ?? 0,
      sla_dias: Array.isArray(t.sla_dias) ? [...t.sla_dias] : [],
      orden: t.orden ?? 0,
    });
    setErrMsg(null);
  }

  function cancelarEdit() {
    setEditId(null);
    setDraft(null);
    setErrMsg(null);
  }

  async function guardarEdit(id) {
    setErrMsg(null);
    if (!draft.nombre.trim()) { setErrMsg('Nombre obligatorio.'); return; }
    const slaDiasOrdenados = [...(draft.sla_dias || [])].sort((a, b) => a - b);
    const update = {
      nombre: draft.nombre.trim(),
      color_hex: draft.color_hex,
      monto_min: Number(draft.monto_min) || 0,
      monto_max: draft.monto_max === '' || draft.monto_max === null ? null : Number(draft.monto_max),
      seguimientos_req: parseInt(draft.seguimientos_req, 10) || 0,
      sla_dias: slaDiasOrdenados,
      orden: parseInt(draft.orden, 10) || 0,
    };
    const { error } = await supabase.from('hermes_config_tiers').update(update).eq('id', id);
    if (error) { setErrMsg(error.message); return; }
    cancelarEdit();
    await cargar();
    try { await supabase.rpc('refresh_hermes_panel'); } catch {}
    flash(setOkMsg, '✓ Tier actualizado');
  }

  async function eliminar(t) {
    if (!confirm(`¿Eliminar tier "${t.nombre}"? Las proformas en ese tier quedarán sin clasificar.`)) return;
    const { error } = await supabase.from('hermes_config_tiers').delete().eq('id', t.id);
    if (error) { flash(setErrMsg, error.message); return; }
    await cargar();
    try { await supabase.rpc('refresh_hermes_panel'); } catch {}
    flash(setOkMsg, '✓ Tier eliminado');
  }

  async function crearNuevo() {
    setErrMsg(null);
    if (!draft.nombre.trim()) { setErrMsg('Nombre obligatorio.'); return; }
    const slaDiasOrdenados = [...(draft.sla_dias || [])].sort((a, b) => a - b);
    const insert = {
      nombre: draft.nombre.trim(),
      color_hex: draft.color_hex,
      monto_min: Number(draft.monto_min) || 0,
      monto_max: draft.monto_max === '' || draft.monto_max === null ? null : Number(draft.monto_max),
      seguimientos_req: parseInt(draft.seguimientos_req, 10) || 0,
      sla_dias: slaDiasOrdenados,
      orden: parseInt(draft.orden, 10) || (tiers.length + 1),
    };
    const { error } = await supabase.from('hermes_config_tiers').insert(insert);
    if (error) { setErrMsg(error.message); return; }
    setShowNuevo(false);
    setDraft(null);
    await cargar();
    try { await supabase.rpc('refresh_hermes_panel'); } catch {}
    flash(setOkMsg, '✓ Tier creado');
  }

  function abrirNuevo() {
    setShowNuevo(true);
    setEditId(null);
    setDraft({
      nombre: '',
      color_hex: '#888888',
      monto_min: 0,
      monto_max: '',
      seguimientos_req: 1,
      sla_dias: [3, 7, 14],
      orden: (tiers?.length || 0) + 1,
    });
    setErrMsg(null);
  }

  if (tiers === null) return <Spinner />;

  const inputCell = { padding: '6px 8px', borderRadius: 6, border: '1px solid #e2e8f0', fontSize: '0.84rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };

  return (
    <div>
      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, flexWrap: 'wrap', gap: 8 }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: C.text }}>Configuración de tiers</h3>
          <button onClick={abrirNuevo} disabled={showNuevo || editId} style={S.btnPrimary}>+ Nuevo tier</button>
        </div>

        {okMsg && <div style={{ background: '#d1fae5', color: '#065f46', padding: '8px 12px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 10 }}>{okMsg}</div>}
        {errMsg && <div style={{ background: '#fee2e2', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: '0.85rem', marginBottom: 10 }}>{errMsg}</div>}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={S.th}>Tier</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Monto Mín</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Monto Máx</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Seguim.</th>
                <th style={S.th}>SLA días</th>
                <th style={{ ...S.th, textAlign: 'center' }}>Orden</th>
                <th style={{ ...S.th, textAlign: 'right' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map(t => editId === t.id ? (
                <tr key={t.id} style={{ background: '#fff7e0' }}>
                  <td style={S.td}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="color" value={draft.color_hex} onChange={e => setDraft({ ...draft, color_hex: e.target.value })}
                        style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
                      <input value={draft.nombre} onChange={e => setDraft({ ...draft, nombre: e.target.value })}
                        style={inputCell} placeholder="Nombre" />
                    </div>
                  </td>
                  <td style={S.td}><input type="number" value={draft.monto_min} onChange={e => setDraft({ ...draft, monto_min: e.target.value })} style={{ ...inputCell, textAlign: 'right' }} /></td>
                  <td style={S.td}><input type="number" value={draft.monto_max} onChange={e => setDraft({ ...draft, monto_max: e.target.value })} style={{ ...inputCell, textAlign: 'right' }} placeholder="∞" /></td>
                  <td style={S.td}><input type="number" value={draft.seguimientos_req} onChange={e => setDraft({ ...draft, seguimientos_req: e.target.value })} style={{ ...inputCell, textAlign: 'center' }} /></td>
                  <td style={{ ...S.td, minWidth: 320 }}>
                    <SlaDiasChips value={draft.sla_dias} onChange={dias => setDraft({ ...draft, sla_dias: dias })} />
                  </td>
                  <td style={S.td}><input type="number" value={draft.orden} onChange={e => setDraft({ ...draft, orden: e.target.value })} style={{ ...inputCell, textAlign: 'center' }} /></td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => guardarEdit(t.id)} style={{ ...S.btnPrimary, padding: '5px 12px', fontSize: '0.78rem', marginRight: 4 }}>Guardar</button>
                    <button onClick={cancelarEdit} style={{ ...S.btnGhost, padding: '5px 12px', fontSize: '0.78rem' }}>Cancelar</button>
                  </td>
                </tr>
              ) : (
                <tr key={t.id}>
                  <td style={S.td}><TierBadge nombre={t.nombre} color={t.color_hex} /></td>
                  <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace' }}>{CRC(t.monto_min)}</td>
                  <td style={{ ...S.td, textAlign: 'right', fontFamily: 'monospace' }}>
                    {t.monto_max == null ? '∞' : CRC(t.monto_max)}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center', fontWeight: 700 }}>{t.seguimientos_req}</td>
                  <td style={{ ...S.td, fontFamily: 'monospace', color: C.muted }}>
                    {Array.isArray(t.sla_dias) && t.sla_dias.length > 0 ? t.sla_dias.join(', ') : '—'}
                  </td>
                  <td style={{ ...S.td, textAlign: 'center' }}>{t.orden}</td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={() => startEdit(t)} disabled={!!editId || showNuevo}
                      style={{ ...S.btnGhost, padding: '5px 12px', fontSize: '0.78rem', marginRight: 4 }}>Editar</button>
                    <button onClick={() => eliminar(t)} disabled={!!editId || showNuevo}
                      style={{ background: '#fee2e2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 8, padding: '5px 12px', fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600 }}>Eliminar</button>
                  </td>
                </tr>
              ))}
              {showNuevo && (
                <tr style={{ background: '#e0f2fe' }}>
                  <td style={S.td}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input type="color" value={draft.color_hex} onChange={e => setDraft({ ...draft, color_hex: e.target.value })}
                        style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} />
                      <input value={draft.nombre} onChange={e => setDraft({ ...draft, nombre: e.target.value })}
                        style={inputCell} placeholder="Nombre tier nuevo" />
                    </div>
                  </td>
                  <td style={S.td}><input type="number" value={draft.monto_min} onChange={e => setDraft({ ...draft, monto_min: e.target.value })} style={{ ...inputCell, textAlign: 'right' }} /></td>
                  <td style={S.td}><input type="number" value={draft.monto_max} onChange={e => setDraft({ ...draft, monto_max: e.target.value })} style={{ ...inputCell, textAlign: 'right' }} placeholder="∞" /></td>
                  <td style={S.td}><input type="number" value={draft.seguimientos_req} onChange={e => setDraft({ ...draft, seguimientos_req: e.target.value })} style={{ ...inputCell, textAlign: 'center' }} /></td>
                  <td style={{ ...S.td, minWidth: 320 }}>
                    <SlaDiasChips value={draft.sla_dias} onChange={dias => setDraft({ ...draft, sla_dias: dias })} />
                  </td>
                  <td style={S.td}><input type="number" value={draft.orden} onChange={e => setDraft({ ...draft, orden: e.target.value })} style={{ ...inputCell, textAlign: 'center' }} /></td>
                  <td style={{ ...S.td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <button onClick={crearNuevo} style={{ ...S.btnPrimary, padding: '5px 12px', fontSize: '0.78rem', marginRight: 4 }}>Crear</button>
                    <button onClick={() => { setShowNuevo(false); setDraft(null); setErrMsg(null); }}
                      style={{ ...S.btnGhost, padding: '5px 12px', fontSize: '0.78rem' }}>Cancelar</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12, fontSize: '0.74rem', color: C.muted }}>
          <strong>SLA días</strong>: cuántos días después de la proforma se debe hacer cada seguimiento. Ej. día 3, día 7, día 14 = el primer seguimiento a los 3 días, el segundo a los 7, el tercero a los 14. <strong>Monto Máx</strong> vacío = sin tope.
        </div>
      </div>
    </div>
  );
}

// ── Tab: Tabla de proformas (Abiertas / Ganadas) ────────────────────────────
function TablaProformas({ datos, onRow, mostrarSeguimientos = true, esAdmin = false }) {
  if (!datos) return <Spinner />;
  if (datos.length === 0) return <Empty msg="Sin proformas" sub="No hay proformas que coincidan con los filtros." />;
  return (
    <div style={{ ...S.card, padding: 0, overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
        <thead>
          <tr>
            <th style={S.th}>Estado</th>
            <th style={S.th}>#</th>
            <th style={S.th}>Fecha</th>
            <th style={S.th}>Cliente</th>
            <th style={S.th}>Vendedor</th>
            <th style={S.th}>Tier</th>
            <th style={{ ...S.th, textAlign: 'right' }}>Monto</th>
            {esAdmin && <th style={{ ...S.th, textAlign: 'right' }}>Margen %</th>}
            {esAdmin && <th style={{ ...S.th, textAlign: 'right' }}>Utilidad</th>}
            <th style={{ ...S.th, textAlign: 'center' }}>Días</th>
            {mostrarSeguimientos && <th style={{ ...S.th, textAlign: 'center' }}>Seg.</th>}
          </tr>
        </thead>
        <tbody>
          {datos.map(p => (
            <tr key={p.proforma}
              onClick={() => onRow && onRow(p)}
              style={{ cursor: onRow ? 'pointer' : 'default', transition: 'background .15s' }}
              onMouseEnter={e => { if (onRow) e.currentTarget.style.background = 'rgba(200,168,75,0.06)'; }}
              onMouseLeave={e => { if (onRow) e.currentTarget.style.background = 'transparent'; }}
            >
              <td style={S.td}><SemaforoBadge semaforo={p.semaforo} /></td>
              <td style={{ ...S.td, fontFamily: 'monospace', fontWeight: 700 }}>{p.proforma}</td>
              <td style={{ ...S.td, whiteSpace: 'nowrap', color: C.muted }}>{fmtFecha(p.fecha)}</td>
              <td style={{ ...S.td, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.cliente || ''}>
                {p.cliente || '—'}
              </td>
              <td style={S.td}>{p.vendedor || '—'}</td>
              <td style={S.td}><TierBadge nombre={p.tier_nombre} color={p.tier_color} /></td>
              <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{CRC(p.monto_total)}</td>
              {esAdmin && (
                <td style={{ ...S.td, textAlign: 'right' }}>
                  <MargenCell pct={p.margen_pct} faltan={p.tiene_costos_faltantes} />
                </td>
              )}
              {esAdmin && <td style={{ ...S.td, textAlign: 'right' }}>{CRC(p.utilidad_mercaderia)}</td>}
              <td style={{ ...S.td, textAlign: 'center' }}>{p.dias_desde_proforma ?? '—'}</td>
              {mostrarSeguimientos && (
                <td style={{ ...S.td, textAlign: 'center', fontFamily: 'monospace' }}>
                  {p.seguimientos_realizados || 0}/{p.seguimientos_req || 0}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Podio de vendedores ─────────────────────────────────────────────────────
function PodioVendedores({ filasGanadas, fechaDesde, fechaHasta }) {
  const [segPorVendedor, setSegPorVendedor] = useState(null);

  useEffect(() => {
    (async () => {
      let q = supabase.from('hermes_seguimientos').select('vendedor_realizo,fecha_realizado');
      if (fechaDesde) q = q.gte('fecha_realizado', fechaDesde);
      if (fechaHasta) q = q.lte('fecha_realizado', fechaHasta + 'T23:59:59');
      const { data } = await q;
      const map = {};
      for (const r of (data || [])) {
        const v = r.vendedor_realizo || 'Sin asignar';
        map[v] = (map[v] || 0) + 1;
      }
      setSegPorVendedor(map);
    })();
  }, [fechaDesde, fechaHasta]);

  const ganadasPorVendedor = useMemo(() => {
    const map = {};
    for (const f of (filasGanadas || [])) {
      const v = f.vendedor || 'Sin asignar';
      map[v] = (map[v] || 0) + 1;
    }
    return map;
  }, [filasGanadas]);

  const topSeguimientos = useMemo(() => {
    if (!segPorVendedor) return null;
    return Object.entries(segPorVendedor).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [segPorVendedor]);

  const topGanadas = useMemo(() => {
    return Object.entries(ganadasPorVendedor).sort((a, b) => b[1] - a[1]).slice(0, 3);
  }, [ganadasPorVendedor]);

  const MEDALLAS = ['🥇', '🥈', '🥉'];
  const COLORES_PODIO = ['#d4af37', '#c0c0c0', '#cd7f32'];

  function ListaPodio({ items, sufijo, vacio }) {
    if (!items) return <div style={{ fontSize: '0.82rem', color: C.muted, padding: 8 }}>Cargando...</div>;
    if (items.length === 0) return <div style={{ fontSize: '0.82rem', color: C.muted, padding: 8, fontStyle: 'italic' }}>{vacio}</div>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(([nombre, cantidad], i) => (
          <div key={nombre} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 12px', borderRadius: 10,
            background: i === 0 ? 'rgba(212,175,55,0.10)' : 'rgba(255,255,255,0.5)',
            border: i === 0 ? `1px solid rgba(212,175,55,0.4)` : '1px solid rgba(0,0,0,0.05)',
          }}>
            <span style={{ fontSize: '1.4rem', flexShrink: 0 }}>{MEDALLAS[i]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: '0.88rem', color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {nombre}
              </div>
              <div style={{ fontSize: '0.74rem', color: COLORES_PODIO[i], fontWeight: 700 }}>
                {cantidad.toLocaleString('es-CR')} {sufijo}
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div style={{
      ...S.card, marginBottom: 18,
      background: 'linear-gradient(135deg, rgba(255,247,224,0.7), rgba(255,255,255,0.55))',
      borderTop: `3px solid ${C.gold}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: '1.4rem' }}>🏆</span>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: C.text }}>Podio de vendedores</h3>
        <span style={{ fontSize: '0.72rem', color: C.muted, marginLeft: 'auto' }}>¡A competir sano!</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
        <div>
          <div style={{ ...S.kicker, marginBottom: 8 }}>📞 Más seguimientos</div>
          <ListaPodio items={topSeguimientos} sufijo="seguimientos" vacio="Sin seguimientos en el rango" />
        </div>
        <div>
          <div style={{ ...S.kicker, marginBottom: 8 }}>💰 Más cotizaciones ganadas</div>
          <ListaPodio items={topGanadas} sufijo="ganadas" vacio="Sin ganadas todavía" />
        </div>
      </div>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────
// Usuarios autorizados a ver información sensible (utilidad, margen, costos)
// además de cualquier usuario con rol 'admin'.
const VER_UTILIDAD_USERNAMES = ['tony'];

export default function SeguimientoProformas() {
  const { perfil, loading: authLoading, puedeVer } = useAuth();
  const esAdmin = perfil?.rol === 'admin' || VER_UTILIDAD_USERNAMES.includes(perfil?.username);
  const [tab, setTab] = useState('abiertas');
  const [filas, setFilas] = useState(null);
  const [filtros, setFiltros] = useState({ vendedor: '', tier: '', margenMin: 0, fechaDesde: '', fechaHasta: '' });
  const [drawerProf, setDrawerProf] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Carga datos del panel
  const cargar = useCallback(async () => {
    setFilas(null);
    const { data, error } = await supabase
      .from('hermes_panel_view')
      .select('*')
      .order('fecha', { ascending: false });
    if (error) {
      console.error('[Hermes] Error al cargar panel:', error);
      setFilas([]);
      return;
    }
    setFilas(data || []);
  }, []);

  useEffect(() => { cargar(); }, [cargar, refreshTick]);

  const refrescar = useCallback(() => setRefreshTick(t => t + 1), []);

  const filasAbiertas = useMemo(() => {
    if (!filas) return null;
    return filas.filter(f => !f.facturada && f.tier_nombre && f.tier_nombre !== 'Bronce');
  }, [filas]);

  const filasGanadas = useMemo(() => {
    if (!filas) return null;
    return filas.filter(f => f.facturada);
  }, [filas]);

  const vendedoresUnicos = useMemo(() => {
    if (!filas) return [];
    return [...new Set(filas.map(f => f.vendedor).filter(Boolean))].sort();
  }, [filas]);

  // Filtros aplicados sobre Abiertas
  const filasAbiertasFiltradas = useMemo(() => {
    if (!filasAbiertas) return null;
    let arr = filasAbiertas.filter(f => {
      if (filtros.vendedor && f.vendedor !== filtros.vendedor) return false;
      if (filtros.tier && f.tier_nombre !== filtros.tier) return false;
      if (filtros.margenMin > 0) {
        const m = N(f.margen_pct);
        if (m < filtros.margenMin) return false;
      }
      if (filtros.fechaDesde && (!f.fecha || f.fecha < filtros.fechaDesde)) return false;
      if (filtros.fechaHasta && (!f.fecha || f.fecha > filtros.fechaHasta)) return false;
      return true;
    });
    arr.sort((a, b) => {
      const oa = SEMAFORO[a.semaforo]?.orden || 99;
      const ob = SEMAFORO[b.semaforo]?.orden || 99;
      if (oa !== ob) return oa - ob;
      return N(b.monto_total) - N(a.monto_total);
    });
    return arr;
  }, [filasAbiertas, filtros]);

  const filasGanadasFiltradas = useMemo(() => {
    if (!filasGanadas) return null;
    let arr = filasGanadas.filter(f => {
      if (filtros.vendedor && f.vendedor !== filtros.vendedor) return false;
      if (filtros.fechaDesde && (!f.fecha || f.fecha < filtros.fechaDesde)) return false;
      if (filtros.fechaHasta && (!f.fecha || f.fecha > filtros.fechaHasta)) return false;
      return true;
    });
    arr = [...arr].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return arr;
  }, [filasGanadas, filtros]);

  // KPIs (sobre filasAbiertasFiltradas)
  const kpis = useMemo(() => {
    const arr = filasAbiertasFiltradas || [];
    const count = arr.length;
    const monto = arr.reduce((s, f) => s + N(f.monto_total), 0);
    const utilidad = arr.reduce((s, f) => s + N(f.utilidad_mercaderia), 0);
    const margenes = arr.map(f => N(f.margen_pct)).filter(v => !isNaN(v) && v !== 0);
    const margenAvg = margenes.length > 0 ? margenes.reduce((a, b) => a + b, 0) / margenes.length : 0;
    const atrasadas = arr.filter(f => f.semaforo === 'atrasado' || f.semaforo === 'sin_contactar').length;
    return { count, monto, utilidad, margenAvg, atrasadas };
  }, [filasAbiertasFiltradas]);

  // Auth gate
  if (authLoading) return <div style={S.page}><Spinner /></div>;
  if (!perfil || !puedeVer('seguimiento-proformas')) return (
    <div style={S.page}>
      <Empty msg="Acceso denegado" sub="No tenés permisos para ver este módulo." />
    </div>
  );

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div>
          <div style={S.kicker}>Comercial · Seguimiento</div>
          <h1 style={S.title}>Seguimiento de Proformas</h1>
          <div style={S.subtitle}>Pipeline de proformas abiertas con tiers, semáforo y bitácora.</div>
        </div>
        <button onClick={refrescar} style={S.btnGhost}>↻ Actualizar</button>
      </div>

      {/* Tabs */}
      <div style={S.tabBar}>
        {[
          { key: 'abiertas',      label: 'Abiertas' },
          { key: 'ganadas',       label: 'Ganadas' },
          { key: 'configuracion', label: 'Configuración' },
        ].map(t => (
          <button key={t.key}
            style={tab === t.key ? S.tabOn : S.tab}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab: Abiertas */}
      {tab === 'abiertas' && (
        <div>
          <PodioVendedores
            filasGanadas={filasGanadasFiltradas}
            fechaDesde={filtros.fechaDesde}
            fechaHasta={filtros.fechaHasta}
          />

          {/* KPIs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: 12, marginBottom: 18,
          }}>
            <KpiCard kicker="Proformas" value={kpis.count.toLocaleString('es-CR')} />
            <KpiCard kicker="Monto en juego" value={CRC(kpis.monto)} accent={C.gold} />
            {esAdmin && <KpiCard kicker="Utilidad potencial" value={CRC(kpis.utilidad)} accent={C.green} />}
            {esAdmin && <KpiCard kicker="Margen promedio" value={`${kpis.margenAvg.toFixed(1)}%`} accent={C.blue} />}
            <KpiCard kicker="Atrasadas" value={kpis.atrasadas.toLocaleString('es-CR')}
              danger={kpis.atrasadas > 0} sub={kpis.atrasadas > 0 ? 'Requieren acción inmediata' : 'Todo al día'} />
          </div>

          {/* Filtros */}
          <div style={{
            background: '#fff', border: '1px solid rgba(200,168,75,0.18)',
            borderRadius: 14, padding: 14, marginBottom: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
          }}>
            <div>
              <label style={S.label}>Vendedor</label>
              <select value={filtros.vendedor} onChange={e => setFiltros({ ...filtros, vendedor: e.target.value })}
                style={{ ...S.select, width: '100%' }}>
                <option value="">Todos</option>
                {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Tier</label>
              <select value={filtros.tier} onChange={e => setFiltros({ ...filtros, tier: e.target.value })}
                style={{ ...S.select, width: '100%' }}>
                <option value="">Todos</option>
                <option value="Plata">Plata</option>
                <option value="Oro">Oro</option>
                <option value="Platino">Platino</option>
              </select>
            </div>
            <div>
              <label style={S.label}>Fecha desde</label>
              <input type="date" value={filtros.fechaDesde}
                onChange={e => setFiltros({ ...filtros, fechaDesde: e.target.value })}
                style={S.input} />
            </div>
            <div>
              <label style={S.label}>Fecha hasta</label>
              <input type="date" value={filtros.fechaHasta}
                onChange={e => setFiltros({ ...filtros, fechaHasta: e.target.value })}
                style={S.input} />
            </div>
            {esAdmin && (
              <div>
                <label style={S.label}>Margen mínimo: {filtros.margenMin}%</label>
                <input type="range" min={0} max={50} step={5}
                  value={filtros.margenMin}
                  onChange={e => setFiltros({ ...filtros, margenMin: Number(e.target.value) })}
                  style={{ width: '100%' }} />
              </div>
            )}
            {(filtros.vendedor || filtros.tier || filtros.fechaDesde || filtros.fechaHasta || filtros.margenMin > 0) && (
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button onClick={() => setFiltros({ vendedor: '', tier: '', margenMin: 0, fechaDesde: '', fechaHasta: '' })}
                  style={S.btnGhost}>Limpiar filtros</button>
              </div>
            )}
          </div>

          <TablaProformas
            datos={filasAbiertasFiltradas}
            onRow={p => setDrawerProf(p)}
            mostrarSeguimientos={true}
            esAdmin={esAdmin}
          />
        </div>
      )}

      {/* Tab: Ganadas */}
      {tab === 'ganadas' && (
        <div>
          <div style={{
            background: '#fff', border: '1px solid rgba(200,168,75,0.18)',
            borderRadius: 14, padding: 14, marginBottom: 18,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
          }}>
            <div>
              <label style={S.label}>Vendedor</label>
              <select value={filtros.vendedor} onChange={e => setFiltros({ ...filtros, vendedor: e.target.value })}
                style={{ ...S.select, width: '100%' }}>
                <option value="">Todos</option>
                {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Fecha desde</label>
              <input type="date" value={filtros.fechaDesde}
                onChange={e => setFiltros({ ...filtros, fechaDesde: e.target.value })}
                style={S.input} />
            </div>
            <div>
              <label style={S.label}>Fecha hasta</label>
              <input type="date" value={filtros.fechaHasta}
                onChange={e => setFiltros({ ...filtros, fechaHasta: e.target.value })}
                style={S.input} />
            </div>
            {(filtros.vendedor || filtros.fechaDesde || filtros.fechaHasta) && (
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <button onClick={() => setFiltros({ ...filtros, vendedor: '', fechaDesde: '', fechaHasta: '' })}
                  style={S.btnGhost}>Limpiar filtros</button>
              </div>
            )}
          </div>
          <TablaProformas
            datos={filasGanadasFiltradas}
            onRow={p => setDrawerProf(p)}
            mostrarSeguimientos={false}
            esAdmin={esAdmin}
          />
        </div>
      )}

      {/* Tab: Configuración */}
      {tab === 'configuracion' && <TabConfig />}

      {/* Drawer */}
      {drawerProf && (
        <Drawer
          proforma={drawerProf}
          perfil={perfil}
          onClose={() => setDrawerProf(null)}
          onChange={() => { refrescar(); }}
        />
      )}
    </div>
  );
}
