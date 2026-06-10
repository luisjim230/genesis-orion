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
  vendida:       { label: 'Vendida',       bg: '#dcfce7', text: '#166534',     emoji: '🤝', orden: 6 },
  ganada:        { label: 'Facturada',     bg: '#ede9fe', text: '#6b21a8',     emoji: '💰', orden: 7 },
  perdida:       { label: 'Perdida',       bg: '#fee2e2', text: '#991b1b',     emoji: '✖', orden: 8 },
  sin_tier:      { label: 'Sin tier',      bg: '#f1f5f9', text: '#64748b',     emoji: '—',  orden: 9 },
};

const CANALES = ['whatsapp', 'llamada', 'email', 'presencial', 'otro'];
const RESULTADOS = ['en_seguimiento', 'ganada', 'perdida'];
const RESULTADO_LABEL = {
  en_seguimiento:     { txt: 'En seguimiento', color: '#92400e' },
  ganada:             { txt: 'Vendida',        color: '#065f46' },
  perdida:            { txt: 'Perdida',        color: '#b91c1c' },
  // Legacy (registros anteriores al cambio del flujo)
  interesado:         { txt: 'Interesado',     color: '#1d4ed8' },
  pensandolo:         { txt: 'Pensándolo',     color: '#1d4ed8' },
  sin_respuesta:      { txt: 'Sin respuesta',  color: '#64748b' },
  objecion_precio:    { txt: 'Objeción precio',color: '#92400e' },
  objecion_producto:  { txt: 'Objeción producto', color: '#92400e' },
};

function fmtFecha(d) {
  if (!d) return '—';
  // Las fechas de proforma son tipo DATE (sin hora). Formatear los componentes
  // Y-M-D directamente evita el corrimiento de zona horaria (UTC → CR) que hacía
  // que cada fecha se mostrara un día antes de la real.
  const s = String(d).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  try {
    return new Date(d).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  } catch { return s; }
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
function Drawer({ proforma, onClose, perfil, onChange, esAdmin }) {
  const [lineas, setLineas] = useState(null);
  const [seguimientos, setSeguimientos] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ canal: 'whatsapp', resultado: 'en_seguimiento', nota: '', razon: '' });
  const [guardando, setGuardando] = useState(false);
  const [errMsg, setErrMsg] = useState(null);
  const [okMsg, setOkMsg] = useState(null);

  // Agenda / próximo contacto manual
  const [agenda, setAgenda] = useState({ fecha: '', nota: '', observacion: '' });
  const [agendaSaved, setAgendaSaved] = useState({ fecha: '', nota: '', observacion: '', por: '', obsPor: '' });
  const [showAgendaForm, setShowAgendaForm] = useState(false);
  const [guardandoAgenda, setGuardandoAgenda] = useState(false);

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

  // Sincronizar la agenda local cuando cambia la proforma mostrada.
  useEffect(() => {
    const f = proforma?.agenda_fecha ? String(proforma.agenda_fecha).slice(0, 10) : '';
    const saved = {
      fecha: f,
      nota: proforma?.agenda_nota || '',
      observacion: proforma?.agenda_observacion || '',
      por: proforma?.agenda_por || '',
      obsPor: proforma?.agenda_observacion_por || '',
    };
    setAgendaSaved(saved);
    setAgenda({ fecha: saved.fecha, nota: saved.nota, observacion: saved.observacion });
    setShowAgendaForm(false);
  }, [proforma?.proforma]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!proforma) return null;

  const guardarAgenda = async () => {
    setErrMsg(null);
    if (!agenda.fecha) { setErrMsg('Elegí la fecha del próximo contacto.'); return; }
    setGuardandoAgenda(true);
    const quien = perfil?.nombre || perfil?.email || 'sistema';
    const payload = {
      proforma: proforma.proforma,
      fecha_agenda: agenda.fecha,
      nota: agenda.nota?.trim() || null,
      agendado_por: agendaSaved.por || quien,
      actualizado_ts: new Date().toISOString(),
    };
    if (esAdmin) {
      payload.observacion = agenda.observacion?.trim() || null;
      payload.observacion_por = agenda.observacion?.trim() ? quien : null;
    }
    const { error } = await supabase.from('hermes_agenda').upsert(payload, { onConflict: 'proforma' });
    if (error) { setErrMsg(error.message || 'Error al agendar.'); setGuardandoAgenda(false); return; }
    try { await supabase.rpc('refresh_hermes_panel'); } catch {}
    setAgendaSaved(s => ({
      ...s,
      fecha: agenda.fecha,
      nota: agenda.nota?.trim() || '',
      por: s.por || quien,
      ...(esAdmin ? { observacion: agenda.observacion?.trim() || '', obsPor: agenda.observacion?.trim() ? quien : '' } : {}),
    }));
    setShowAgendaForm(false);
    setGuardandoAgenda(false);
    setOkMsg('Agenda guardada');
    if (onChange) onChange();
    setTimeout(() => setOkMsg(null), 3000);
  };

  const quitarAgenda = async () => {
    if (!confirm('¿Quitar la agenda de esta proforma?')) return;
    setGuardandoAgenda(true);
    const { error } = await supabase.from('hermes_agenda').delete().eq('proforma', proforma.proforma);
    if (error) { setErrMsg(error.message || 'Error al quitar.'); setGuardandoAgenda(false); return; }
    try { await supabase.rpc('refresh_hermes_panel'); } catch {}
    setAgendaSaved({ fecha: '', nota: '', observacion: '', por: '', obsPor: '' });
    setAgenda({ fecha: '', nota: '', observacion: '' });
    setShowAgendaForm(false);
    setGuardandoAgenda(false);
    setOkMsg('Agenda quitada');
    if (onChange) onChange();
    setTimeout(() => setOkMsg(null), 3000);
  };

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
    setForm({ canal: 'whatsapp', resultado: 'en_seguimiento', nota: '', razon: '' });
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

          {/* Sección: Agenda / próximo contacto */}
          <div style={{
            background: agendaSaved.fecha ? '#fffbeb' : '#f8fafc',
            border: `1px solid ${agendaSaved.fecha ? '#f0d98a' : '#e2e8f0'}`,
            borderRadius: 12, padding: 14, marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
              <h3 style={{ fontSize: '0.95rem', fontWeight: 700, color: C.text, margin: 0 }}>📅 Próximo contacto agendado</h3>
              {!showAgendaForm && (
                <button onClick={() => setShowAgendaForm(true)}
                  style={{ ...S.btnGhost, padding: '5px 12px', fontSize: '0.78rem' }}>
                  {agendaSaved.fecha ? 'Cambiar' : '+ Agendar'}
                </button>
              )}
            </div>

            {!showAgendaForm && agendaSaved.fecha && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: '0.9rem', color: C.text }}>Para el <strong>{fmtFecha(agendaSaved.fecha)}</strong></div>
                {agendaSaved.nota && <div style={{ fontSize: '0.84rem', color: C.text, marginTop: 4 }}>🗒 {agendaSaved.nota}</div>}
                {agendaSaved.observacion && (
                  <div style={{ fontSize: '0.84rem', color: '#92400e', marginTop: 4 }}>
                    👤 Indicación: <strong>{agendaSaved.observacion}</strong>
                  </div>
                )}
                <button onClick={quitarAgenda} disabled={guardandoAgenda}
                  style={{ background: 'none', border: 'none', color: C.red, cursor: 'pointer', fontSize: '0.78rem', padding: 0, marginTop: 8 }}>
                  Quitar agenda
                </button>
              </div>
            )}
            {!showAgendaForm && !agendaSaved.fecha && (
              <div style={{ fontSize: '0.82rem', color: C.muted, marginTop: 6 }}>
                Sin agenda. Programá cuándo volver a contactar a este cliente.
              </div>
            )}

            {showAgendaForm && (
              <div style={{ marginTop: 12 }}>
                <label style={S.label}>¿Cuándo volver a contactar?</label>
                <input type="date" value={agenda.fecha}
                  onChange={e => setAgenda({ ...agenda, fecha: e.target.value })}
                  style={{ ...S.input, marginBottom: 10 }} />
                <label style={S.label}>Nota</label>
                <textarea value={agenda.nota} onChange={e => setAgenda({ ...agenda, nota: e.target.value })}
                  rows={2} style={{ ...S.input, fontFamily: 'inherit', resize: 'vertical', marginBottom: 10 }}
                  placeholder="Ej: llamar el viernes a la tarde" />
                {esAdmin && (
                  <>
                    <label style={S.label}>Indicación para el vendedor (opcional)</label>
                    <textarea value={agenda.observacion} onChange={e => setAgenda({ ...agenda, observacion: e.target.value })}
                      rows={2} style={{ ...S.input, fontFamily: 'inherit', resize: 'vertical', marginBottom: 10 }}
                      placeholder="Lo que el vendedor debe hacer" />
                  </>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setShowAgendaForm(false); setAgenda({ fecha: agendaSaved.fecha, nota: agendaSaved.nota, observacion: agendaSaved.observacion }); setErrMsg(null); }}
                    disabled={guardandoAgenda} style={S.btnGhost}>Cancelar</button>
                  <button onClick={guardarAgenda} disabled={guardandoAgenda} style={S.btnPrimary}>
                    {guardandoAgenda ? 'Guardando...' : 'Guardar agenda'}
                  </button>
                </div>
              </div>
            )}
          </div>

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
                      #{s.numero_seguimiento} · {s.canal || '—'} · <span style={{ color: (RESULTADO_LABEL[s.estado_resultado]?.color) || C.blue }}>{(RESULTADO_LABEL[s.estado_resultado]?.txt) || s.estado_resultado || '—'}</span>
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
              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>Canal</label>
                <select value={form.canal} onChange={e => setForm({ ...form, canal: e.target.value })}
                  style={{ ...S.select, width: '100%' }}>
                  {CANALES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={S.label}>Resultado</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[
                    { v: 'en_seguimiento', label: 'En seguimiento', emoji: '🟡', color: '#92400e', bg: '#fef3c7' },
                    { v: 'ganada',         label: 'Vendida',        emoji: '✅', color: '#065f46', bg: '#d1fae5' },
                    { v: 'perdida',        label: 'Perdida',        emoji: '❌', color: '#b91c1c', bg: '#fee2e2' },
                  ].map(opt => {
                    const activo = form.resultado === opt.v;
                    return (
                      <button key={opt.v} type="button"
                        onClick={() => setForm({ ...form, resultado: opt.v })}
                        style={{
                          padding: '12px 8px', borderRadius: 12,
                          border: activo ? `2px solid ${opt.color}` : '1.5px solid rgba(0,0,0,0.08)',
                          background: activo ? opt.bg : '#fff',
                          color: activo ? opt.color : C.muted,
                          fontWeight: 700, fontSize: '0.84rem',
                          fontFamily: 'Rubik, sans-serif', cursor: 'pointer',
                          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                          transition: 'all .15s',
                        }}>
                        <span style={{ fontSize: '1.4rem', lineHeight: 1 }}>{opt.emoji}</span>
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
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
// Estados de semáforo que tiene sentido ofrecer como filtro de columna.
const ESTADOS_FILTRO = ['sin_contactar', 'atrasado', 'toca_hoy', 'al_dia', 'vendida', 'perdida', 'ganada'];
const miniCtrl = {
  width: '100%', boxSizing: 'border-box', padding: '4px 6px', borderRadius: 6,
  border: '1px solid #cbd5e1', fontSize: '0.74rem', fontFamily: 'Rubik, sans-serif',
  background: '#fff', color: C.text, outline: 'none',
};
const filterTh = {
  padding: '6px 8px', background: 'rgba(255,255,255,0.55)',
  borderBottom: '1px solid rgba(200,168,75,0.18)', verticalAlign: 'middle',
};

// Encabezado ordenable. Definido a nivel de módulo (no dentro del render) para
// que React no lo remonte en cada cambio de estado y el click siempre responda.
function SortHeader({ col, label, align = 'left', orden, onSort }) {
  const activo = orden?.col === col;
  const flecha = activo ? (orden.dir === 'asc' ? '▲' : '▼') : '⇅';
  return (
    <th onClick={() => onSort(col)}
      title="Tocá para ordenar"
      style={{
        ...S.th, textAlign: align, cursor: 'pointer',
        userSelect: 'none', whiteSpace: 'nowrap',
        color: activo ? C.gold : undefined,
      }}>
      {label}<span style={{ opacity: activo ? 1 : 0.3, marginLeft: 3, fontSize: '0.9em' }}>{flecha}</span>
    </th>
  );
}

function TablaProformas({ datos, onRow, mostrarSeguimientos = true, esAdmin = false, filtros = null, setFiltros = null, vendedoresUnicos = [], tiersUnicos = [] }) {
  const [orden, setOrden] = useState(null); // { col, dir: 'asc' | 'desc' }
  const [showFilters, setShowFilters] = useState(false);
  const puedeFiltrar = !!(filtros && setFiltros);
  if (!datos) return <Spinner />;

  const cambiarOrden = (col) => {
    setOrden(o => (o && o.col === col ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' }));
  };

  const cmp = (a, b, col) => {
    const get = (x) => {
      switch (col) {
        case 'estado':    return SEMAFORO[x.semaforo]?.orden ?? 99;
        case 'proforma':  return Number(x.proforma) || 0;
        case 'fecha':     return x.fecha || '';
        case 'cliente':   return String(x.cliente || '').toLowerCase();
        case 'vendedor':  return String(x.vendedor || '').toLowerCase();
        case 'tier':      return String(x.tier_nombre || '');
        case 'monto':     return N(x.monto_total);
        case 'margen':    return N(x.margen_pct);
        case 'utilidad':  return N(x.utilidad_mercaderia);
        case 'dias':      return Number(x.dias_desde_proforma) || 0;
        case 'seg':       return Number(x.seguimientos_realizados) || 0;
        default: return 0;
      }
    };
    const va = get(a), vb = get(b);
    if (va < vb) return -1;
    if (va > vb) return 1;
    return 0;
  };

  const filas = orden
    ? [...datos].sort((a, b) => cmp(a, b, orden.col) * (orden.dir === 'asc' ? 1 : -1))
    : datos;

  const setF = (k, v) => setFiltros(prev => ({ ...prev, [k]: v }));

  const colSpan = 8 + (esAdmin ? 2 : 0) + (mostrarSeguimientos ? 1 : 0);

  return (
    <div style={{ ...S.card, padding: 0 }}>
      {puedeFiltrar && (
        <div style={{
          padding: '8px 12px', borderBottom: '1px solid rgba(200,168,75,0.14)',
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <button onClick={() => setShowFilters(v => !v)}
            style={{ ...S.btnGhost, padding: '5px 14px', fontSize: '0.78rem', borderColor: showFilters ? C.gold : undefined, color: showFilters ? C.gold : C.text }}>
            {showFilters ? '▾ Ocultar filtros por columna' : '⛃ Filtrar por columna'}
          </button>
          <span style={{ fontSize: '0.74rem', color: C.muted }}>Tocá un título de columna para ordenar ⇅</span>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
        <thead>
          <tr>
            <SortHeader col="estado"   label="Estado"   orden={orden} onSort={cambiarOrden} />
            <SortHeader col="proforma" label="#"        orden={orden} onSort={cambiarOrden} />
            <SortHeader col="fecha"    label="Fecha"    orden={orden} onSort={cambiarOrden} />
            <SortHeader col="cliente"  label="Cliente"  orden={orden} onSort={cambiarOrden} />
            <SortHeader col="vendedor" label="Vendedor" orden={orden} onSort={cambiarOrden} />
            <SortHeader col="tier"     label="Tier"     orden={orden} onSort={cambiarOrden} />
            <SortHeader col="monto"    label="Monto"    orden={orden} onSort={cambiarOrden} align="right" />
            {esAdmin && <SortHeader col="margen"   label="Margen %" orden={orden} onSort={cambiarOrden} align="right" />}
            {esAdmin && <SortHeader col="utilidad" label="Utilidad" orden={orden} onSort={cambiarOrden} align="right" />}
            <SortHeader col="dias"     label="Días"     orden={orden} onSort={cambiarOrden} align="center" />
            {mostrarSeguimientos && <SortHeader col="seg" label="Seg." orden={orden} onSort={cambiarOrden} align="center" />}
          </tr>
          {puedeFiltrar && showFilters && (
            <tr>
              <th style={filterTh}>
                <select value={filtros.estado} onChange={e => setF('estado', e.target.value)} style={{ ...miniCtrl, cursor: 'pointer' }}>
                  <option value="">Todos</option>
                  {ESTADOS_FILTRO.map(s => <option key={s} value={s}>{SEMAFORO[s]?.label || s}</option>)}
                </select>
              </th>
              <th style={filterTh}>
                <input value={filtros.proforma} onChange={e => setF('proforma', e.target.value)} inputMode="numeric" placeholder="#" style={miniCtrl} />
              </th>
              <th style={filterTh}></th>
              <th style={filterTh}>
                <input value={filtros.cliente} onChange={e => setF('cliente', e.target.value)} placeholder="Buscar..." style={miniCtrl} />
              </th>
              <th style={filterTh}>
                <select value={filtros.vendedor} onChange={e => setF('vendedor', e.target.value)} style={{ ...miniCtrl, cursor: 'pointer' }}>
                  <option value="">Todos</option>
                  {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
              </th>
              <th style={filterTh}>
                <select value={filtros.tier} onChange={e => setF('tier', e.target.value)} style={{ ...miniCtrl, cursor: 'pointer' }}>
                  <option value="">Todos</option>
                  {(tiersUnicos.length ? tiersUnicos : ['Plata', 'Oro', 'Platino']).map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </th>
              <th style={filterTh}>
                <input value={filtros.montoMin} onChange={e => setF('montoMin', e.target.value)} inputMode="numeric" placeholder="≥ monto" style={{ ...miniCtrl, textAlign: 'right' }} />
              </th>
              {esAdmin && (
                <th style={filterTh}>
                  <input value={filtros.margenMin || ''} onChange={e => setF('margenMin', Number(e.target.value) || 0)} inputMode="numeric" placeholder="≥ %" style={{ ...miniCtrl, textAlign: 'right' }} />
                </th>
              )}
              {esAdmin && <th style={filterTh}></th>}
              <th style={filterTh}></th>
              {mostrarSeguimientos && <th style={filterTh}></th>}
            </tr>
          )}
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={colSpan} style={{ ...S.td, textAlign: 'center', padding: 40, color: C.muted }}>
                No hay proformas que coincidan con los filtros.
              </td>
            </tr>
          )}
          {filas.map(p => (
            <tr key={p.proforma}
              onClick={() => onRow && onRow(p)}
              style={{ cursor: onRow ? 'pointer' : 'default', transition: 'background .15s' }}
              onMouseEnter={e => { if (onRow) e.currentTarget.style.background = 'rgba(200,168,75,0.06)'; }}
              onMouseLeave={e => { if (onRow) e.currentTarget.style.background = 'transparent'; }}
            >
              <td style={S.td}>
                <SemaforoBadge semaforo={p.semaforo} />
                {p.agenda_vigente && (
                  <span title={`Agendado para ${fmtFecha(p.agenda_fecha)}${p.agenda_nota ? ' · ' + p.agenda_nota : ''}`}
                    style={{ marginLeft: 4 }}>📅</span>
                )}
              </td>
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

// ── Resumen por vendedor (vista de supervisor) ──────────────────────────────
const COL_VACIO = { vendedor: '', total: '', facturadas: '', enSeguimiento: '', vendidas: '', perdidas: '', bronce: '', atrasadas: '', conversion: '', montoFacturado: '', montoEnJuego: '' };

function ResumenVendedores({ resumen, esAdmin, onPick }) {
  const [orden, setOrden] = useState({ col: 'total', dir: 'desc' });
  const [showFilters, setShowFilters] = useState(false);
  const [colF, setColF] = useState({ ...COL_VACIO });
  if (!resumen) return <Spinner />;
  if (resumen.length === 0) return <Empty msg="Sin datos" sub="No hay proformas en el período seleccionado." />;

  const cambiarOrden = (col) => setOrden(o => (o.col === col ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' }));
  const setCF = (k, v) => setColF(prev => ({ ...prev, [k]: v }));
  const convDe = (r) => r.total ? (r.facturadas / r.total * 100) : 0;
  const num = (v) => parseFloat(v) || 0;
  const get = (r, col) => {
    if (col === 'vendedor') return String(r.vendedor).toLowerCase();
    if (col === 'conversion') return convDe(r);
    return r[col] ?? 0;
  };

  const filtrados = resumen.filter(r => {
    if (colF.vendedor && !String(r.vendedor).toLowerCase().includes(colF.vendedor.trim().toLowerCase())) return false;
    if (colF.total && r.total < num(colF.total)) return false;
    if (colF.facturadas && r.facturadas < num(colF.facturadas)) return false;
    if (colF.enSeguimiento && r.enSeguimiento < num(colF.enSeguimiento)) return false;
    if (colF.vendidas && r.vendidas < num(colF.vendidas)) return false;
    if (colF.perdidas && r.perdidas < num(colF.perdidas)) return false;
    if (colF.bronce && r.bronce < num(colF.bronce)) return false;
    if (colF.atrasadas && r.atrasadas < num(colF.atrasadas)) return false;
    if (colF.conversion && convDe(r) < num(colF.conversion)) return false;
    if (colF.montoFacturado && r.montoFacturado < num(colF.montoFacturado)) return false;
    if (colF.montoEnJuego && r.montoEnJuego < num(colF.montoEnJuego)) return false;
    return true;
  });

  const filas = [...filtrados].sort((a, b) => {
    const va = get(a, orden.col), vb = get(b, orden.col);
    if (va < vb) return orden.dir === 'asc' ? -1 : 1;
    if (va > vb) return orden.dir === 'asc' ? 1 : -1;
    return 0;
  });

  const tot = filtrados.reduce((s, r) => ({
    total: s.total + r.total, facturadas: s.facturadas + r.facturadas,
    enSeguimiento: s.enSeguimiento + r.enSeguimiento, vendidas: s.vendidas + r.vendidas,
    perdidas: s.perdidas + r.perdidas,
    bronce: s.bronce + r.bronce,
    atrasadas: s.atrasadas + r.atrasadas, montoEnJuego: s.montoEnJuego + r.montoEnJuego,
    montoFacturado: s.montoFacturado + r.montoFacturado,
  }), { total: 0, facturadas: 0, enSeguimiento: 0, vendidas: 0, perdidas: 0, bronce: 0, atrasadas: 0, montoEnJuego: 0, montoFacturado: 0 });

  const colSpan = 9 + (esAdmin ? 2 : 0);

  return (
    <div style={{ ...S.card, padding: 0 }}>
      <div style={{
        padding: '8px 12px', borderBottom: '1px solid rgba(200,168,75,0.14)',
        display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
      }}>
        <button onClick={() => setShowFilters(v => !v)}
          style={{ ...S.btnGhost, padding: '5px 14px', fontSize: '0.78rem', borderColor: showFilters ? C.gold : undefined, color: showFilters ? C.gold : C.text }}>
          {showFilters ? '▾ Ocultar filtros por columna' : '⛃ Filtrar por columna'}
        </button>
        <span style={{ fontSize: '0.74rem', color: C.muted }}>Tocá un título de columna para ordenar ⇅</span>
      </div>
      <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
        <thead>
          <tr>
            <SortHeader col="vendedor" label="Vendedor" align="left" orden={orden} onSort={cambiarOrden} />
            <SortHeader col="total" label="Proformas" align="right" orden={orden} onSort={cambiarOrden} />
            <SortHeader col="facturadas" label="Facturadas" align="right" orden={orden} onSort={cambiarOrden} />
            <SortHeader col="enSeguimiento" label="En seguim." align="right" orden={orden} onSort={cambiarOrden} />
            <SortHeader col="vendidas" label="Vendidas" align="right" orden={orden} onSort={cambiarOrden} />
            <SortHeader col="perdidas" label="Perdidas" align="right" orden={orden} onSort={cambiarOrden} />
            <SortHeader col="bronce" label="Bronce" align="right" orden={orden} onSort={cambiarOrden} />
            <SortHeader col="atrasadas" label="Atrasadas" align="right" orden={orden} onSort={cambiarOrden} />
            <SortHeader col="conversion" label="Conversión" align="right" orden={orden} onSort={cambiarOrden} />
            {esAdmin && <SortHeader col="montoFacturado" label="Monto facturado" align="right" orden={orden} onSort={cambiarOrden} />}
            {esAdmin && <SortHeader col="montoEnJuego" label="Monto en juego" align="right" orden={orden} onSort={cambiarOrden} />}
          </tr>
          {showFilters && (
            <tr>
              <th style={filterTh}>
                <input value={colF.vendedor} onChange={e => setCF('vendedor', e.target.value)} placeholder="Buscar..." style={miniCtrl} />
              </th>
              <th style={filterTh}><input value={colF.total} onChange={e => setCF('total', e.target.value)} inputMode="numeric" placeholder="≥" style={{ ...miniCtrl, textAlign: 'right' }} /></th>
              <th style={filterTh}><input value={colF.facturadas} onChange={e => setCF('facturadas', e.target.value)} inputMode="numeric" placeholder="≥" style={{ ...miniCtrl, textAlign: 'right' }} /></th>
              <th style={filterTh}><input value={colF.enSeguimiento} onChange={e => setCF('enSeguimiento', e.target.value)} inputMode="numeric" placeholder="≥" style={{ ...miniCtrl, textAlign: 'right' }} /></th>
              <th style={filterTh}><input value={colF.vendidas} onChange={e => setCF('vendidas', e.target.value)} inputMode="numeric" placeholder="≥" style={{ ...miniCtrl, textAlign: 'right' }} /></th>
              <th style={filterTh}><input value={colF.perdidas} onChange={e => setCF('perdidas', e.target.value)} inputMode="numeric" placeholder="≥" style={{ ...miniCtrl, textAlign: 'right' }} /></th>
              <th style={filterTh}><input value={colF.bronce} onChange={e => setCF('bronce', e.target.value)} inputMode="numeric" placeholder="≥" style={{ ...miniCtrl, textAlign: 'right' }} /></th>
              <th style={filterTh}><input value={colF.atrasadas} onChange={e => setCF('atrasadas', e.target.value)} inputMode="numeric" placeholder="≥" style={{ ...miniCtrl, textAlign: 'right' }} /></th>
              <th style={filterTh}><input value={colF.conversion} onChange={e => setCF('conversion', e.target.value)} inputMode="numeric" placeholder="≥ %" style={{ ...miniCtrl, textAlign: 'right' }} /></th>
              {esAdmin && <th style={filterTh}><input value={colF.montoFacturado} onChange={e => setCF('montoFacturado', e.target.value)} inputMode="numeric" placeholder="≥ ₡" style={{ ...miniCtrl, textAlign: 'right' }} /></th>}
              {esAdmin && <th style={filterTh}><input value={colF.montoEnJuego} onChange={e => setCF('montoEnJuego', e.target.value)} inputMode="numeric" placeholder="≥ ₡" style={{ ...miniCtrl, textAlign: 'right' }} /></th>}
            </tr>
          )}
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={colSpan} style={{ ...S.td, textAlign: 'center', padding: 40, color: C.muted }}>
                Ningún vendedor coincide con los filtros.
              </td>
            </tr>
          )}
          {filas.map(r => {
            const conv = r.total ? (r.facturadas / r.total * 100) : 0;
            return (
              <tr key={r.vendedor} onClick={() => onPick && onPick(r.vendedor)}
                style={{ cursor: onPick ? 'pointer' : 'default', transition: 'background .15s' }}
                onMouseEnter={e => { if (onPick) e.currentTarget.style.background = 'rgba(200,168,75,0.06)'; }}
                onMouseLeave={e => { if (onPick) e.currentTarget.style.background = 'transparent'; }}>
                <td style={{ ...S.td, fontWeight: 700 }}>{r.vendedor}</td>
                <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{r.total.toLocaleString('es-CR')}</td>
                <td style={{ ...S.td, textAlign: 'right', color: C.green, fontWeight: 700 }}>{r.facturadas.toLocaleString('es-CR')}</td>
                <td style={{ ...S.td, textAlign: 'right', color: C.blue }}>{r.enSeguimiento.toLocaleString('es-CR')}</td>
                <td style={{ ...S.td, textAlign: 'right', color: r.vendidas > 0 ? C.green : C.muted, fontWeight: r.vendidas > 0 ? 700 : 400 }}>{r.vendidas.toLocaleString('es-CR')}</td>
                <td style={{ ...S.td, textAlign: 'right', color: r.perdidas > 0 ? C.red : C.muted, fontWeight: r.perdidas > 0 ? 700 : 400 }}>{r.perdidas.toLocaleString('es-CR')}</td>
                <td style={{ ...S.td, textAlign: 'right', color: C.muted }}>{r.bronce.toLocaleString('es-CR')}</td>
                <td style={{ ...S.td, textAlign: 'right', color: r.atrasadas > 0 ? C.red : C.muted, fontWeight: r.atrasadas > 0 ? 700 : 400 }}>{r.atrasadas.toLocaleString('es-CR')}</td>
                <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: conv >= 50 ? C.green : conv >= 25 ? C.orange : C.muted }}>{conv.toFixed(0)}%</td>
                {esAdmin && <td style={{ ...S.td, textAlign: 'right' }}>{CRC(r.montoFacturado)}</td>}
                {esAdmin && <td style={{ ...S.td, textAlign: 'right', color: C.gold, fontWeight: 700 }}>{CRC(r.montoEnJuego)}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ background: 'rgba(200,168,75,0.10)' }}>
            <td style={{ ...S.td, fontWeight: 800 }}>TOTAL · {filtrados.length} vend.</td>
            <td style={{ ...S.td, textAlign: 'right', fontWeight: 800 }}>{tot.total.toLocaleString('es-CR')}</td>
            <td style={{ ...S.td, textAlign: 'right', fontWeight: 800, color: C.green }}>{tot.facturadas.toLocaleString('es-CR')}</td>
            <td style={{ ...S.td, textAlign: 'right', fontWeight: 800, color: C.blue }}>{tot.enSeguimiento.toLocaleString('es-CR')}</td>
            <td style={{ ...S.td, textAlign: 'right', fontWeight: 800, color: tot.vendidas > 0 ? C.green : undefined }}>{tot.vendidas.toLocaleString('es-CR')}</td>
            <td style={{ ...S.td, textAlign: 'right', fontWeight: 800, color: tot.perdidas > 0 ? C.red : undefined }}>{tot.perdidas.toLocaleString('es-CR')}</td>
            <td style={{ ...S.td, textAlign: 'right', fontWeight: 800 }}>{tot.bronce.toLocaleString('es-CR')}</td>
            <td style={{ ...S.td, textAlign: 'right', fontWeight: 800, color: tot.atrasadas > 0 ? C.red : undefined }}>{tot.atrasadas.toLocaleString('es-CR')}</td>
            <td style={{ ...S.td, textAlign: 'right', fontWeight: 800 }}>{tot.total ? (tot.facturadas / tot.total * 100).toFixed(0) : 0}%</td>
            {esAdmin && <td style={{ ...S.td, textAlign: 'right', fontWeight: 800 }}>{CRC(tot.montoFacturado)}</td>}
            {esAdmin && <td style={{ ...S.td, textAlign: 'right', fontWeight: 800, color: C.gold }}>{CRC(tot.montoEnJuego)}</td>}
          </tr>
        </tfoot>
      </table>
      </div>
    </div>
  );
}

// ── Agenda de hoy: tarjetas por vendedor (encabezado / "alarma") ─────────────
// Junta los contactos agendados para hoy o vencidos (agenda vigente) y los
// agrupa por vendedor. Los supervisores pueden dejar una indicación que el
// vendedor ve en su tarjeta.
function AgendaHoy({ filas, esAdmin, perfil, onChange, onRow }) {
  const [editId, setEditId] = useState(null);   // proforma cuya indicación se edita
  const [obsDraft, setObsDraft] = useState('');
  const [savingObs, setSavingObs] = useState(false);

  const hoyStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local (CR)

  const items = useMemo(() => {
    if (!filas) return [];
    return filas
      .filter(f => f.agenda_vigente && f.agenda_fecha && String(f.agenda_fecha).slice(0, 10) <= hoyStr)
      .sort((a, b) => String(a.agenda_fecha).slice(0, 10).localeCompare(String(b.agenda_fecha).slice(0, 10)));
  }, [filas, hoyStr]);

  const grupos = useMemo(() => {
    const m = {};
    for (const f of items) { const v = f.vendedor || 'Sin asignar'; (m[v] = m[v] || []).push(f); }
    return Object.entries(m).sort((a, b) => b[1].length - a[1].length);
  }, [items]);

  if (!filas || items.length === 0) return null;

  async function guardarObs(proforma) {
    setSavingObs(true);
    const quien = perfil?.nombre || perfil?.email || 'sistema';
    const txt = obsDraft.trim();
    const { error } = await supabase.from('hermes_agenda')
      .update({ observacion: txt || null, observacion_por: txt ? quien : null })
      .eq('proforma', proforma);
    if (!error) { try { await supabase.rpc('refresh_hermes_panel'); } catch {} }
    setSavingObs(false);
    setEditId(null);
    if (!error && onChange) onChange();
  }

  return (
    <div style={{ ...S.card, marginBottom: 18, borderTop: `3px solid ${C.orange}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ fontSize: '1.4rem' }}>📅</span>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: C.text }}>Agenda de hoy</h3>
        <span style={{ fontSize: '0.78rem', color: C.muted, marginLeft: 'auto' }}>
          {items.length} contacto{items.length === 1 ? '' : 's'} para hoy o vencido{items.length === 1 ? '' : 's'}
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        {grupos.map(([vendedor, lista]) => (
          <div key={vendedor} style={{ background: 'rgba(255,255,255,0.7)', border: '1px solid rgba(0,0,0,0.06)', borderRadius: 14, padding: 12 }}>
            <div style={{ fontWeight: 800, fontSize: '0.9rem', color: C.text, marginBottom: 8, display: 'flex', justifyContent: 'space-between' }}>
              <span>{vendedor}</span>
              <span style={{ color: C.orange }}>{lista.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {lista.map(f => {
                const fstr = String(f.agenda_fecha).slice(0, 10);
                const esHoy = fstr === hoyStr;
                return (
                  <div key={f.proforma} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 10, padding: '8px 10px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                      <span onClick={() => onRow && onRow(f)} style={{ fontWeight: 700, fontSize: '0.84rem', color: C.text, cursor: 'pointer' }}>
                        Llamar a {f.cliente || '—'}
                      </span>
                      <span style={{
                        fontSize: '0.7rem', fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                        background: esHoy ? '#fef3c7' : '#fee2e2', color: esHoy ? '#92400e' : '#b91c1c', whiteSpace: 'nowrap',
                      }}>
                        {esHoy ? '🟡 Hoy' : '🔴 ' + fmtFecha(f.agenda_fecha)}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.74rem', color: C.muted, fontFamily: 'monospace' }}>#{f.proforma}</div>
                    {f.agenda_nota && <div style={{ fontSize: '0.8rem', color: C.text, marginTop: 3 }}>🗒 {f.agenda_nota}</div>}
                    {editId === f.proforma ? (
                      <div style={{ marginTop: 6 }}>
                        <textarea value={obsDraft} onChange={e => setObsDraft(e.target.value)} rows={2}
                          style={{ width: '100%', boxSizing: 'border-box', padding: '6px 8px', borderRadius: 8, border: '1px solid #cbd5e1', fontSize: '0.8rem', fontFamily: 'inherit', resize: 'vertical' }}
                          placeholder="Indicación para el vendedor" />
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', marginTop: 6 }}>
                          <button onClick={() => setEditId(null)} disabled={savingObs} style={{ ...S.btnGhost, padding: '4px 10px', fontSize: '0.74rem' }}>Cancelar</button>
                          <button onClick={() => guardarObs(f.proforma)} disabled={savingObs} style={{ ...S.btnPrimary, padding: '4px 10px', fontSize: '0.74rem' }}>{savingObs ? '...' : 'Guardar'}</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {f.agenda_observacion && (
                          <div style={{ fontSize: '0.8rem', color: '#92400e', marginTop: 4, background: '#fffbeb', borderRadius: 8, padding: '5px 8px' }}>
                            👤 {f.agenda_observacion}
                          </div>
                        )}
                        {esAdmin && (
                          <button onClick={() => { setEditId(f.proforma); setObsDraft(f.agenda_observacion || ''); }}
                            style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontSize: '0.74rem', padding: 0, marginTop: 5 }}>
                            {f.agenda_observacion ? '✏️ Editar indicación' : '+ Agregar indicación'}
                          </button>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
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
  const [filtros, setFiltros] = useState({ vendedor: '', tier: '', margenMin: 0, fechaDesde: '', fechaHasta: '', proforma: '', cliente: '', estado: '', montoMin: '' });
  const [drawerProf, setDrawerProf] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // Carga datos del panel.
  // Supabase corta cada query en 1000 filas. La vista tiene miles de proformas,
  // así que paginamos con .range() hasta traerlas todas; de lo contrario solo se
  // cargaban las más recientes y las proformas viejas desaparecían del panel.
  // IMPORTANTE: el orden necesita un desempate único (proforma), porque ordenar
  // solo por `fecha` no es estable entre páginas y se colaban proformas
  // duplicadas (o se saltaban). Las duplicadas rompían el render de React al
  // filtrar (keys repetidas → filas viejas que no se actualizaban). Igual
  // deduplicamos por proforma como red de seguridad.
  const cargar = useCallback(async () => {
    setFilas(null);
    const PAGE = 1000;
    let desde = 0;
    let todas = [];
    for (;;) {
      const { data, error } = await supabase
        .from('hermes_panel_view')
        .select('*')
        .order('fecha', { ascending: false })
        .order('proforma', { ascending: false })
        .range(desde, desde + PAGE - 1);
      if (error) {
        console.error('[Hermes] Error al cargar panel:', error);
        break;
      }
      todas = todas.concat(data || []);
      if (!data || data.length < PAGE) break;
      desde += PAGE;
    }
    const vistos = new Set();
    const unicas = todas.filter(r => {
      if (vistos.has(r.proforma)) return false;
      vistos.add(r.proforma);
      return true;
    });
    setFilas(unicas);
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

  const tiersUnicos = useMemo(() => {
    if (!filas) return [];
    return [...new Set(filas.map(f => f.tier_nombre).filter(Boolean))];
  }, [filas]);

  // Convierte "YYYY-MM-DD" o ISO string o Date a timestamp (ms al inicio del día UTC).
  // Compara fechas robustamente sin caer en problemas de strings con/sin ceros.
  const fechaMs = (v) => {
    if (!v) return NaN;
    if (v instanceof Date) return Date.UTC(v.getUTCFullYear(), v.getUTCMonth(), v.getUTCDate());
    const s = String(v).slice(0, 10);
    const [y, m, d] = s.split('-').map(Number);
    if (!y || !m || !d) return NaN;
    return Date.UTC(y, m - 1, d);
  };

  // Filtros aplicados sobre Abiertas
  const filasAbiertasFiltradas = useMemo(() => {
    if (!filasAbiertas) return null;
    const profQ = String(filtros.proforma || '').trim();
    const cliQ = String(filtros.cliente || '').trim().toLowerCase();
    const desdeMs = fechaMs(filtros.fechaDesde);
    const hastaMs = fechaMs(filtros.fechaHasta);
    const montoMin = N(filtros.montoMin);
    let arr = filasAbiertas.filter(f => {
      if (filtros.vendedor && f.vendedor !== filtros.vendedor) return false;
      if (filtros.tier && f.tier_nombre !== filtros.tier) return false;
      if (filtros.estado && f.semaforo !== filtros.estado) return false;
      if (montoMin > 0 && N(f.monto_total) < montoMin) return false;
      if (filtros.margenMin > 0) {
        const m = N(f.margen_pct);
        if (m < filtros.margenMin) return false;
      }
      if (!Number.isNaN(desdeMs) || !Number.isNaN(hastaMs)) {
        const fMs = fechaMs(f.fecha);
        if (Number.isNaN(fMs)) return false;
        if (!Number.isNaN(desdeMs) && fMs < desdeMs) return false;
        if (!Number.isNaN(hastaMs) && fMs > hastaMs) return false;
      }
      if (profQ && !String(f.proforma).includes(profQ)) return false;
      if (cliQ && !String(f.cliente || '').toLowerCase().includes(cliQ)) return false;
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
    const profQ = String(filtros.proforma || '').trim();
    const cliQ = String(filtros.cliente || '').trim().toLowerCase();
    const desdeMs = fechaMs(filtros.fechaDesde);
    const hastaMs = fechaMs(filtros.fechaHasta);
    const montoMin = N(filtros.montoMin);
    let arr = filasGanadas.filter(f => {
      if (filtros.vendedor && f.vendedor !== filtros.vendedor) return false;
      if (montoMin > 0 && N(f.monto_total) < montoMin) return false;
      if (!Number.isNaN(desdeMs) || !Number.isNaN(hastaMs)) {
        const fMs = fechaMs(f.fecha);
        if (Number.isNaN(fMs)) return false;
        if (!Number.isNaN(desdeMs) && fMs < desdeMs) return false;
        if (!Number.isNaN(hastaMs) && fMs > hastaMs) return false;
      }
      if (profQ && !String(f.proforma).includes(profQ)) return false;
      if (cliQ && !String(f.cliente || '').toLowerCase().includes(cliQ)) return false;
      return true;
    });
    arr = [...arr].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    return arr;
  }, [filasGanadas, filtros]);

  const hayFiltrosActivos = !!(filtros.vendedor || filtros.tier || filtros.fechaDesde || filtros.fechaHasta || filtros.margenMin > 0 || filtros.proforma || filtros.cliente || filtros.estado || filtros.montoMin);

  const limpiarFiltros = () => setFiltros({ vendedor: '', tier: '', margenMin: 0, fechaDesde: '', fechaHasta: '', proforma: '', cliente: '', estado: '', montoMin: '' });

  // Chips visibles de filtros activos (sirven como feedback de que el estado captura el input).
  const chipsFiltros = () => {
    const items = [];
    if (filtros.vendedor) items.push({ k: 'vendedor', label: `Vendedor: ${filtros.vendedor}` });
    if (filtros.estado) items.push({ k: 'estado', label: `Estado: ${SEMAFORO[filtros.estado]?.label || filtros.estado}` });
    if (filtros.tier) items.push({ k: 'tier', label: `Tier: ${filtros.tier}` });
    if (filtros.montoMin) items.push({ k: 'montoMin', label: `Monto ≥ ${CRCnoSym(filtros.montoMin)}` });
    if (filtros.fechaDesde) items.push({ k: 'fechaDesde', label: `Desde: ${filtros.fechaDesde}` });
    if (filtros.fechaHasta) items.push({ k: 'fechaHasta', label: `Hasta: ${filtros.fechaHasta}` });
    if (filtros.margenMin > 0) items.push({ k: 'margenMin', label: `Margen ≥ ${filtros.margenMin}%` });
    if (filtros.proforma) items.push({ k: 'proforma', label: `# ${filtros.proforma}` });
    if (filtros.cliente) items.push({ k: 'cliente', label: `Cliente: ${filtros.cliente}` });
    if (!items.length) return null;
    return (
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {items.map(it => (
          <span key={it.k} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: 'rgba(212,175,55,0.18)', color: C.text,
            border: `1px solid ${C.gold}`, borderRadius: 999,
            padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600,
          }}>
            {it.label}
            <button onClick={() => setFiltros({ ...filtros, [it.k]: it.k === 'margenMin' ? 0 : '' })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.muted, fontSize: '0.9rem', lineHeight: 1, padding: 0 }}>
              ×
            </button>
          </span>
        ))}
      </div>
    );
  };

  // Resalta visualmente los inputs cuando tienen valor (feedback de que el filtro está activo)
  const inputFiltro = (activo) => activo
    ? { ...S.input, borderColor: C.gold, background: 'rgba(212,175,55,0.10)', boxShadow: '0 0 0 2px rgba(212,175,55,0.18)' }
    : S.input;
  const selectFiltro = (activo) => activo
    ? { ...S.select, width: '100%', borderColor: C.gold, background: 'rgba(212,175,55,0.10)', boxShadow: '0 0 0 2px rgba(212,175,55,0.18)' }
    : { ...S.select, width: '100%' };

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

  // Resumen por vendedor: panorama completo (total / facturadas / en seguimiento /
  // Bronce) respetando el rango de fechas y la búsqueda, para que el supervisor vea
  // el volumen real de cada quien sin que ninguna proforma se pierda de vista.
  const resumenVendedores = useMemo(() => {
    if (!filas) return null;
    const desdeMs = fechaMs(filtros.fechaDesde);
    const hastaMs = fechaMs(filtros.fechaHasta);
    const cliQ = String(filtros.cliente || '').trim().toLowerCase();
    const profQ = String(filtros.proforma || '').trim();
    const map = {};
    for (const f of filas) {
      if (!Number.isNaN(desdeMs) || !Number.isNaN(hastaMs)) {
        const fMs = fechaMs(f.fecha);
        if (Number.isNaN(fMs)) continue;
        if (!Number.isNaN(desdeMs) && fMs < desdeMs) continue;
        if (!Number.isNaN(hastaMs) && fMs > hastaMs) continue;
      }
      if (profQ && !String(f.proforma).includes(profQ)) continue;
      if (cliQ && !String(f.cliente || '').toLowerCase().includes(cliQ)) continue;
      const v = f.vendedor || 'Sin asignar';
      if (!map[v]) map[v] = { vendedor: v, total: 0, facturadas: 0, enSeguimiento: 0, vendidas: 0, perdidas: 0, bronce: 0, sinTier: 0, atrasadas: 0, montoEnJuego: 0, montoFacturado: 0 };
      const r = map[v];
      r.total++;
      if (f.facturada) {
        r.facturadas++;
        r.montoFacturado += N(f.monto_total);
      } else if (f.semaforo === 'perdida') {
        // Proforma cerrada como perdida: deja de contar como "en seguimiento".
        r.perdidas++;
      } else if (f.semaforo === 'vendida') {
        // Cerrada como vendida (pendiente de facturar): fuera del pipeline activo.
        r.vendidas++;
      } else if (f.tier_nombre === 'Bronce') {
        r.bronce++;
      } else if (!f.tier_nombre) {
        r.sinTier++;
      } else {
        r.enSeguimiento++;
        r.montoEnJuego += N(f.monto_total);
        if (f.semaforo === 'atrasado' || f.semaforo === 'sin_contactar') r.atrasadas++;
      }
    }
    return Object.values(map).sort((a, b) => b.total - a.total);
  }, [filas, filtros.fechaDesde, filtros.fechaHasta, filtros.cliente, filtros.proforma]);

  // Resumen del vendedor seleccionado (para el aviso en la pestaña Abiertas).
  const resumenVendedorSel = useMemo(() => {
    if (!filtros.vendedor || !resumenVendedores) return null;
    return resumenVendedores.find(r => r.vendedor === filtros.vendedor) || null;
  }, [filtros.vendedor, resumenVendedores]);

  // Click en una fila del resumen → filtra ese vendedor y salta a Abiertas.
  const verVendedorEnSeguimiento = useCallback((v) => {
    setFiltros(prev => ({ ...prev, vendedor: v === 'Sin asignar' ? '' : v }));
    setTab('abiertas');
  }, []);

  // Descarga a Excel del listado ya filtrado (exactamente lo que se ve en la
  // tabla). Se arma en el navegador con exceljs, sin re-consultar el panel.
  const [bajandoExcel, setBajandoExcel] = useState(false);
  const descargarExcel = useCallback(async (rows, hoja, incluirSeg) => {
    if (!rows || rows.length === 0) return;
    setBajandoExcel(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet(hoja);
      const cols = [
        { header: 'Estado', key: 'estado', width: 16 },
        { header: 'Proforma', key: 'proforma', width: 12 },
        { header: 'Fecha', key: 'fecha', width: 12 },
        { header: 'Cliente', key: 'cliente', width: 34 },
        { header: 'Vendedor', key: 'vendedor', width: 18 },
        { header: 'Tier', key: 'tier', width: 10 },
        { header: 'Monto', key: 'monto', width: 16 },
      ];
      if (esAdmin) {
        cols.push({ header: 'Margen %', key: 'margen', width: 10 });
        cols.push({ header: 'Utilidad', key: 'utilidad', width: 16 });
      }
      cols.push({ header: 'Días', key: 'dias', width: 8 });
      if (incluirSeg) {
        cols.push({ header: 'Seguimientos', key: 'seg', width: 14 });
        cols.push({ header: 'Último resultado', key: 'resultado', width: 18 });
      }
      ws.columns = cols;
      ws.getRow(1).font = { bold: true };
      ws.getRow(1).alignment = { vertical: 'middle' };
      for (const p of rows) {
        const fila = {
          estado: SEMAFORO[p.semaforo]?.label || p.semaforo || '',
          proforma: p.proforma,
          fecha: fmtFecha(p.fecha),
          cliente: p.cliente || '',
          vendedor: p.vendedor || '',
          tier: p.tier_nombre || '',
          monto: N(p.monto_total),
        };
        if (esAdmin) {
          fila.margen = (p.margen_pct === null || p.margen_pct === undefined) ? '' : N(p.margen_pct);
          fila.utilidad = N(p.utilidad_mercaderia);
        }
        fila.dias = p.dias_desde_proforma ?? '';
        if (incluirSeg) {
          fila.seg = `${p.seguimientos_realizados || 0}/${p.seguimientos_req || 0}`;
          fila.resultado = RESULTADO_LABEL[p.ultimo_seg_estado]?.txt || '';
        }
        ws.addRow(fila);
      }
      ws.getColumn('monto').numFmt = '#,##0';
      if (esAdmin) {
        ws.getColumn('utilidad').numFmt = '#,##0';
        ws.getColumn('margen').numFmt = '0.0';
      }
      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const ts = new Date().toISOString().slice(0, 16).replace('T', '_').replace(/:/g, '-');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `seguimiento_proformas_${hoja}_${ts}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('[Hermes] Error al generar Excel:', e);
      alert('No se pudo generar el Excel: ' + (e?.message || e));
    } finally {
      setBajandoExcel(false);
    }
  }, [esAdmin]);

  // Estilo del botón de descarga (verde, look de acción).
  const btnExcel = {
    background: bajandoExcel ? '#9ca3af' : C.green,
    color: '#fff', border: 'none', borderRadius: 12,
    padding: '9px 18px', fontWeight: 700,
    cursor: bajandoExcel ? 'wait' : 'pointer',
    fontSize: '0.85rem', fontFamily: 'Rubik, sans-serif',
    boxShadow: '0 2px 10px rgba(46,125,79,0.25)',
    whiteSpace: 'nowrap',
  };


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
          { key: 'resumen',       label: 'Resumen' },
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
          <AgendaHoy
            filas={filas}
            esAdmin={esAdmin}
            perfil={perfil}
            onChange={refrescar}
            onRow={p => setDrawerProf(p)}
          />

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
            borderRadius: 14, padding: 14, marginBottom: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
          }}>
            <div>
              <label style={S.label}>Vendedor</label>
              <select value={filtros.vendedor} onChange={e => setFiltros({ ...filtros, vendedor: e.target.value })}
                style={selectFiltro(!!filtros.vendedor)}>
                <option value="">Todos</option>
                {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Tier</label>
              <select value={filtros.tier} onChange={e => setFiltros({ ...filtros, tier: e.target.value })}
                style={selectFiltro(!!filtros.tier)}>
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
                style={inputFiltro(!!filtros.fechaDesde)} />
            </div>
            <div>
              <label style={S.label}>Fecha hasta</label>
              <input type="date" value={filtros.fechaHasta}
                onChange={e => setFiltros({ ...filtros, fechaHasta: e.target.value })}
                style={inputFiltro(!!filtros.fechaHasta)} />
            </div>
            <div>
              <label style={S.label}># Proforma</label>
              <input type="text" inputMode="numeric" value={filtros.proforma}
                onChange={e => setFiltros({ ...filtros, proforma: e.target.value })}
                placeholder="Ej: 136248"
                style={inputFiltro(!!filtros.proforma)} />
            </div>
            <div>
              <label style={S.label}>Cliente</label>
              <input type="text" value={filtros.cliente}
                onChange={e => setFiltros({ ...filtros, cliente: e.target.value })}
                placeholder="Buscar por nombre..."
                style={inputFiltro(!!filtros.cliente)} />
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
          </div>

          {/* Chips de filtros activos */}
          {chipsFiltros()}

          {/* Contador de resultados + botón limpiar (siempre visible cuando hay filtros) */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, flexWrap: 'wrap', marginBottom: 14, padding: '0 4px',
          }}>
            <div style={{ fontSize: '0.85rem', color: C.muted, fontWeight: 600 }}>
              {filasAbiertasFiltradas
                ? <>Mostrando <strong style={{ color: hayFiltrosActivos ? C.gold : C.text }}>{filasAbiertasFiltradas.length.toLocaleString('es-CR')}</strong> de {(filasAbiertas || []).length.toLocaleString('es-CR')} proformas</>
                : 'Cargando…'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {hayFiltrosActivos && (
                <button onClick={limpiarFiltros} style={S.btnGhost}>✕ Limpiar filtros</button>
              )}
              <button
                onClick={() => descargarExcel(filasAbiertasFiltradas, 'Abiertas', true)}
                disabled={bajandoExcel || !filasAbiertasFiltradas || filasAbiertasFiltradas.length === 0}
                style={btnExcel}
                title="Descargar el listado filtrado en Excel">
                {bajandoExcel ? 'Generando…' : '⬇ Descargar Excel'}
              </button>
            </div>
          </div>

          {/* Aviso de panorama: al filtrar por vendedor, explica dónde está el resto
              de sus proformas (facturadas / Bronce) para que no parezca que faltan. */}
          {resumenVendedorSel && resumenVendedorSel.total > resumenVendedorSel.enSeguimiento && (
            <div style={{
              background: 'rgba(59,110,165,0.08)', border: '1px solid rgba(59,110,165,0.25)',
              borderRadius: 12, padding: '10px 14px', marginBottom: 14,
              fontSize: '0.84rem', color: C.text, lineHeight: 1.5,
            }}>
              <strong>{resumenVendedorSel.vendedor}</strong> tiene <strong>{resumenVendedorSel.total.toLocaleString('es-CR')}</strong> proformas en este período:{' '}
              <strong style={{ color: C.green }}>{resumenVendedorSel.facturadas.toLocaleString('es-CR')}</strong> facturadas <span style={{ color: C.muted }}>(pestaña Ganadas)</span>
              {resumenVendedorSel.bronce > 0 && <> · <strong>{resumenVendedorSel.bronce.toLocaleString('es-CR')}</strong> Bronce <span style={{ color: C.muted }}>(monto chico, no se siguen)</span></>}
              {resumenVendedorSel.sinTier > 0 && <> · <strong>{resumenVendedorSel.sinTier.toLocaleString('es-CR')}</strong> sin tier</>}
              {' '}· <strong style={{ color: C.blue }}>{resumenVendedorSel.enSeguimiento.toLocaleString('es-CR')}</strong> en seguimiento <span style={{ color: C.muted }}>(la lista de acá abajo)</span>.
            </div>
          )}

          <TablaProformas
            datos={filasAbiertasFiltradas}
            onRow={p => setDrawerProf(p)}
            mostrarSeguimientos={true}
            esAdmin={esAdmin}
            filtros={filtros}
            setFiltros={setFiltros}
            vendedoresUnicos={vendedoresUnicos}
            tiersUnicos={tiersUnicos}
          />
        </div>
      )}

      {/* Tab: Ganadas */}
      {tab === 'ganadas' && (
        <div>
          <div style={{
            background: '#fff', border: '1px solid rgba(200,168,75,0.18)',
            borderRadius: 14, padding: 14, marginBottom: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
          }}>
            <div>
              <label style={S.label}>Vendedor</label>
              <select value={filtros.vendedor} onChange={e => setFiltros({ ...filtros, vendedor: e.target.value })}
                style={selectFiltro(!!filtros.vendedor)}>
                <option value="">Todos</option>
                {vendedoresUnicos.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Fecha desde</label>
              <input type="date" value={filtros.fechaDesde}
                onChange={e => setFiltros({ ...filtros, fechaDesde: e.target.value })}
                style={inputFiltro(!!filtros.fechaDesde)} />
            </div>
            <div>
              <label style={S.label}>Fecha hasta</label>
              <input type="date" value={filtros.fechaHasta}
                onChange={e => setFiltros({ ...filtros, fechaHasta: e.target.value })}
                style={inputFiltro(!!filtros.fechaHasta)} />
            </div>
            <div>
              <label style={S.label}># Proforma</label>
              <input type="text" inputMode="numeric" value={filtros.proforma}
                onChange={e => setFiltros({ ...filtros, proforma: e.target.value })}
                placeholder="Ej: 136248"
                style={inputFiltro(!!filtros.proforma)} />
            </div>
            <div>
              <label style={S.label}>Cliente</label>
              <input type="text" value={filtros.cliente}
                onChange={e => setFiltros({ ...filtros, cliente: e.target.value })}
                placeholder="Buscar por nombre..."
                style={inputFiltro(!!filtros.cliente)} />
            </div>
          </div>
          {chipsFiltros()}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, flexWrap: 'wrap', marginBottom: 14, padding: '0 4px',
          }}>
            <div style={{ fontSize: '0.85rem', color: C.muted, fontWeight: 600 }}>
              {filasGanadasFiltradas
                ? <>Mostrando <strong style={{ color: hayFiltrosActivos ? C.gold : C.text }}>{filasGanadasFiltradas.length.toLocaleString('es-CR')}</strong> de {(filasGanadas || []).length.toLocaleString('es-CR')} ganadas</>
                : 'Cargando…'}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {hayFiltrosActivos && (
                <button onClick={limpiarFiltros} style={S.btnGhost}>✕ Limpiar filtros</button>
              )}
              <button
                onClick={() => descargarExcel(filasGanadasFiltradas, 'Ganadas', false)}
                disabled={bajandoExcel || !filasGanadasFiltradas || filasGanadasFiltradas.length === 0}
                style={btnExcel}
                title="Descargar el listado filtrado en Excel">
                {bajandoExcel ? 'Generando…' : '⬇ Descargar Excel'}
              </button>
            </div>
          </div>
          <TablaProformas
            datos={filasGanadasFiltradas}
            onRow={p => setDrawerProf(p)}
            mostrarSeguimientos={false}
            esAdmin={esAdmin}
            filtros={filtros}
            setFiltros={setFiltros}
            vendedoresUnicos={vendedoresUnicos}
            tiersUnicos={tiersUnicos}
          />
        </div>
      )}

      {/* Tab: Resumen por vendedor */}
      {tab === 'resumen' && (
        <div>
          <div style={{
            background: '#fff', border: '1px solid rgba(200,168,75,0.18)',
            borderRadius: 14, padding: 14, marginBottom: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
          }}>
            <div>
              <label style={S.label}>Fecha desde</label>
              <input type="date" value={filtros.fechaDesde}
                onChange={e => setFiltros({ ...filtros, fechaDesde: e.target.value })}
                style={inputFiltro(!!filtros.fechaDesde)} />
            </div>
            <div>
              <label style={S.label}>Fecha hasta</label>
              <input type="date" value={filtros.fechaHasta}
                onChange={e => setFiltros({ ...filtros, fechaHasta: e.target.value })}
                style={inputFiltro(!!filtros.fechaHasta)} />
            </div>
            <div>
              <label style={S.label}>Cliente</label>
              <input type="text" value={filtros.cliente}
                onChange={e => setFiltros({ ...filtros, cliente: e.target.value })}
                placeholder="Buscar por nombre..."
                style={inputFiltro(!!filtros.cliente)} />
            </div>
            <div>
              <label style={S.label}># Proforma</label>
              <input type="text" inputMode="numeric" value={filtros.proforma}
                onChange={e => setFiltros({ ...filtros, proforma: e.target.value })}
                placeholder="Ej: 136248"
                style={inputFiltro(!!filtros.proforma)} />
            </div>
          </div>
          {chipsFiltros()}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 10, flexWrap: 'wrap', marginBottom: 14, padding: '0 4px',
          }}>
            <div style={{ fontSize: '0.85rem', color: C.muted, fontWeight: 600 }}>
              Panorama completo por vendedor en el período. Tocá una fila para ver sus proformas en seguimiento.
            </div>
            {hayFiltrosActivos && (
              <button onClick={limpiarFiltros} style={S.btnGhost}>✕ Limpiar filtros</button>
            )}
          </div>
          <ResumenVendedores
            resumen={resumenVendedores}
            esAdmin={esAdmin}
            onPick={verVendedorEnSeguimiento}
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
          esAdmin={esAdmin}
          onClose={() => setDrawerProf(null)}
          onChange={() => { refrescar(); }}
        />
      )}
    </div>
  );
}
