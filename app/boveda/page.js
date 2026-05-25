'use client';
import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../lib/useAuth';
import { puedeVerBoveda } from '../../lib/boveda';

const C = {
  orange: '#ED6E2E', burgundy: '#5E2733', teal: '#225F74',
  cream: '#FDF4F4', creamDark: '#F5EAEA',
  text: '#1a1a1a', sec: '#666', muted: '#999',
  border: '#EAE0E0', borderSoft: '#F0E8E8',
  shadow: '0 1px 4px rgba(94,39,51,0.06)',
};

const EMPTY_FORM = { titulo: '', categoria: '', usuario: '', correo: '', clave: '', descripcion: '' };

// Emoji según palabra clave de la categoría/título (solo decorativo).
function pico(a) {
  const t = `${a.categoria || ''} ${a.titulo || ''}`.toLowerCase();
  if (/whatsapp|wpp/.test(t)) return '💬';
  if (/banco|bac|bcr|bn|cuenta/.test(t)) return '🏦';
  if (/instagram|facebook|tiktok|red|social/.test(t)) return '📱';
  if (/correo|gmail|email|mail/.test(t)) return '✉️';
  if (/web|sitio|nidux|dominio|host|vercel/.test(t)) return '🌐';
  if (/base|supabase|db|sistema|servidor/.test(t)) return '🗄️';
  if (/proveedor/.test(t)) return '📦';
  return '🔐';
}

function fmtFecha(s) {
  if (!s) return '';
  try {
    return new Date(s).toLocaleString('es-CR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return s; }
}

export default function BovedaPage() {
  const { user, loading: authLoading } = useAuth();
  const autorizado = puedeVerBoveda(user);

  const [accesos, setAccesos] = useState([]);
  const [actor, setActor] = useState({ nombre: '', admin: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [revealed, setRevealed] = useState({});   // id -> { clave, visible }
  const [busy, setBusy] = useState({});            // id -> bool (revelando)
  const [toast, setToast] = useState(null);

  const [showLog, setShowLog] = useState(false);
  const [logRows, setLogRows] = useState([]);
  const [logLoading, setLogLoading] = useState(false);

  const notify = useCallback((m) => {
    setToast(m);
    setTimeout(() => setToast(null), 1800);
  }, []);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/boveda');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al cargar');
      setAccesos(j.accesos || []);
      setActor(j.actor || { nombre: '', admin: false });
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authLoading && autorizado) cargar();
    else if (!authLoading) setLoading(false);
  }, [authLoading, autorizado, cargar]);

  function abrirNuevo() {
    setEditId(null); setForm(EMPTY_FORM); setShowForm(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function abrirEditar(a) {
    setEditId(a.id);
    setForm({
      titulo: a.titulo || '', categoria: a.categoria || '',
      usuario: a.usuario_acceso || '', correo: a.correo || '',
      clave: '', descripcion: a.descripcion || '',
    });
    setShowForm(true);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function cerrarForm() { setShowForm(false); setEditId(null); setForm(EMPTY_FORM); }

  async function guardar() {
    if (!form.titulo.trim()) { notify('Falta el título'); return; }
    setSaving(true);
    try {
      const editando = !!editId;
      const r = await fetch('/api/boveda', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando ? { id: editId, ...form } : form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al guardar');
      notify(editando ? 'Acceso actualizado ✓' : 'Acceso guardado ✓');
      cerrarForm();
      if (editando) setRevealed((p) => { const n = { ...p }; delete n[editId]; return n; });
      await cargar();
    } catch (e) {
      notify('Error: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function borrar(a) {
    if (typeof window !== 'undefined' && !window.confirm(`¿Borrar el acceso "${a.titulo}"? No se puede deshacer.`)) return;
    try {
      const r = await fetch(`/api/boveda?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al borrar');
      notify('Acceso borrado');
      await cargar();
    } catch (e) {
      notify('Error: ' + e.message);
    }
  }

  async function pedirClave(id, accion) {
    const r = await fetch('/api/boveda/reveal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Error');
    return j.clave;
  }

  async function revelar(a) {
    const cur = revealed[a.id];
    if (cur && cur.clave != null) {
      setRevealed((p) => ({ ...p, [a.id]: { ...cur, visible: !cur.visible } }));
      return;
    }
    setBusy((p) => ({ ...p, [a.id]: true }));
    try {
      const clave = await pedirClave(a.id, 'revelar');
      setRevealed((p) => ({ ...p, [a.id]: { clave, visible: true } }));
    } catch (e) {
      notify('Error: ' + e.message);
    } finally {
      setBusy((p) => ({ ...p, [a.id]: false }));
    }
  }

  async function copiarClave(a) {
    setBusy((p) => ({ ...p, [a.id]: true }));
    try {
      const clave = await pedirClave(a.id, 'copiar');
      if (clave == null) { notify('Este acceso no tiene clave'); return; }
      await copiarTexto(clave);
      setRevealed((p) => ({ ...p, [a.id]: { clave, visible: (p[a.id]?.visible) || false } }));
      notify('Clave copiada ✓');
    } catch (e) {
      notify('Error: ' + e.message);
    } finally {
      setBusy((p) => ({ ...p, [a.id]: false }));
    }
  }

  async function copiarTexto(t) {
    try {
      if (navigator.clipboard) await navigator.clipboard.writeText(t);
    } catch { /* ignore */ }
  }

  async function cargarLog() {
    setShowLog((v) => !v);
    if (!showLog && logRows.length === 0) {
      setLogLoading(true);
      try {
        const r = await fetch('/api/boveda/log');
        const j = await r.json();
        if (r.ok) setLogRows(j.log || []);
      } finally {
        setLogLoading(false);
      }
    }
  }

  // ── Estados de carga / acceso ──────────────────────────────────────────
  if (authLoading || (autorizado && loading)) {
    return <div style={{ padding: 40, color: C.muted }}>Cargando…</div>;
  }
  if (!autorizado) {
    return (
      <div style={{ maxWidth: 460, margin: '60px auto', textAlign: 'center', background: '#fff',
        border: `1px solid ${C.borderSoft}`, borderRadius: 14, padding: '40px 32px', boxShadow: C.shadow }}>
        <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: C.burgundy, fontSize: '1.2rem', marginBottom: 8 }}>Acceso restringido</h2>
        <p style={{ color: C.sec, fontSize: '0.9rem', lineHeight: 1.5 }}>
          Este módulo solo está disponible para personas autorizadas.
        </p>
      </div>
    );
  }

  const norm = (s) => String(s || '').toLowerCase();
  const ql = norm(q.trim());
  const lista = ql
    ? accesos.filter((a) => [a.titulo, a.categoria, a.usuario_acceso, a.correo, a.descripcion].some((f) => norm(f).includes(ql)))
    : accesos;

  return (
    <div style={{ fontFamily: "'Rubik',sans-serif", color: C.text }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap', marginBottom: 18 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 42, height: 42, borderRadius: 11, background: C.burgundy, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', boxShadow: C.shadow }}>🔐</span>
            <h1 style={{ fontSize: '1.5rem', color: C.burgundy, letterSpacing: '0.02em', margin: 0, fontWeight: 700 }}>Bóveda de Accesos</h1>
          </div>
          <p style={{ fontSize: '0.82rem', color: C.muted, marginTop: 6, maxWidth: 560, lineHeight: 1.5 }}>
            Claves, usuarios y correos de todas las plataformas, centralizados y cifrados. Acceso restringido al círculo de confianza.
          </p>
        </div>
        <button onClick={abrirNuevo} style={btn(C.orange)}>＋ Agregar acceso</button>
      </div>

      {/* Banner de acceso */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1px solid ${C.borderSoft}`, borderLeft: `4px solid ${C.teal}`, borderRadius: 10, padding: '11px 16px', marginBottom: 18, fontSize: '0.8rem', color: C.sec, boxShadow: C.shadow, flexWrap: 'wrap' }}>
        <span>🛡️ Estás dentro como <b style={{ color: C.burgundy }}>{actor.nombre || '—'}</b>.</span>
        <span style={{ color: C.muted }}>
          {actor.admin
            ? 'Podés ver, agregar, editar y borrar.'
            : 'Podés ver y agregar accesos. Editar y borrar queda reservado para Luis.'}
        </span>
        {actor.admin && (
          <button onClick={cargarLog} style={{ ...btnOutline(), marginLeft: 'auto' }}>
            {showLog ? 'Ocultar bitácora' : '📜 Ver bitácora'}
          </button>
        )}
      </div>

      {/* Bitácora (solo admin) */}
      {actor.admin && showLog && (
        <div style={{ background: '#fff', border: `1px solid ${C.borderSoft}`, borderRadius: 12, boxShadow: C.shadow, marginBottom: 22, overflow: 'hidden' }}>
          <div style={{ padding: '12px 16px', borderBottom: `1px solid ${C.borderSoft}`, fontWeight: 600, color: C.burgundy, fontSize: '0.88rem' }}>
            📜 Bitácora de actividad <span style={{ fontWeight: 400, color: C.muted, fontSize: '0.78rem' }}>· últimos movimientos</span>
          </div>
          {logLoading ? (
            <div style={{ padding: 20, color: C.muted, fontSize: '0.85rem' }}>Cargando…</div>
          ) : logRows.length === 0 ? (
            <div style={{ padding: 20, color: C.muted, fontSize: '0.85rem' }}>Sin movimientos todavía.</div>
          ) : (
            <div style={{ maxHeight: 280, overflowY: 'auto' }}>
              {logRows.map((l) => (
                <div key={l.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 16px', borderBottom: `1px solid ${C.borderSoft}`, fontSize: '0.8rem' }}>
                  <span style={accionBadge(l.accion)}>{l.accion}</span>
                  <span style={{ color: C.text, fontWeight: 500 }}>{l.acceso_titulo || '—'}</span>
                  <span style={{ color: C.sec }}>· {l.actor_nombre || '—'}</span>
                  <span style={{ marginLeft: 'auto', color: C.muted, fontSize: '0.74rem' }}>{fmtFecha(l.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Formulario agregar / editar */}
      {showForm && (
        <div style={{ background: '#fff', border: `1px solid ${C.borderSoft}`, borderRadius: 12, boxShadow: C.shadow, padding: '18px 20px', marginBottom: 24 }}>
          <h3 style={{ fontSize: '0.92rem', color: C.burgundy, fontWeight: 600, marginBottom: 14 }}>
            {editId ? '✏️ Editar acceso' : '➕ Nuevo acceso'}
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            <Campo label="Plataforma / Título *" value={form.titulo} onChange={(v) => setForm({ ...form, titulo: v })} placeholder="Ej: WhatsApp Business" />
            <Campo label="Categoría" value={form.categoria} onChange={(v) => setForm({ ...form, categoria: v })} placeholder="Ej: Redes / Banco / Sistema" />
            <Campo label="Usuario" value={form.usuario} onChange={(v) => setForm({ ...form, usuario: v })} placeholder="usuario o teléfono" />
            <Campo label="Correo asociado" value={form.correo} onChange={(v) => setForm({ ...form, correo: v })} placeholder="correo@ejemplo.com" />
            <Campo full label={editId ? 'Clave (dejá vacío para no cambiarla)' : 'Clave'} value={form.clave} onChange={(v) => setForm({ ...form, clave: v })} placeholder="contraseña / PIN / código" />
            <Campo full textarea label="Descripción / Notas" value={form.descripcion} onChange={(v) => setForm({ ...form, descripcion: v })} placeholder="¿A qué da acceso? ¿A quién le llega el código de verificación? Notas útiles…" />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
            <button onClick={cerrarForm} style={btnGhost()}>Cancelar</button>
            <button onClick={guardar} disabled={saving} style={btn(saving ? '#bbb' : C.orange)}>
              {saving ? 'Guardando…' : (editId ? 'Guardar cambios' : 'Guardar acceso')}
            </button>
          </div>
        </div>
      )}

      {/* Buscador */}
      <div style={{ position: 'relative', marginBottom: 18, maxWidth: 420 }}>
        <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por plataforma, usuario o correo…"
          style={{ width: '100%', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px 10px 38px', fontSize: '0.85rem', fontFamily: 'inherit', color: C.text, outline: 'none' }} />
      </div>

      {error && (
        <div style={{ background: '#fdecea', border: '1px solid #f5c6c2', color: '#a33', borderRadius: 10, padding: '12px 16px', marginBottom: 18, fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {/* Grid de tarjetas */}
      {lista.length === 0 ? (
        <div style={{ textAlign: 'center', color: C.muted, padding: '50px 20px', background: '#fff', border: `1px dashed ${C.border}`, borderRadius: 12 }}>
          {accesos.length === 0
            ? <>Todavía no hay accesos guardados.<br />Tocá <b style={{ color: C.orange }}>＋ Agregar acceso</b> para cargar el primero.</>
            : 'No hay accesos que coincidan con la búsqueda.'}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(330px, 1fr))', gap: 16 }}>
          {lista.map((a) => {
            const rev = revealed[a.id];
            const visible = rev && rev.visible;
            return (
              <div key={a.id} style={{ background: '#fff', border: `1px solid ${C.borderSoft}`, borderRadius: 12, boxShadow: C.shadow, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '14px 16px', borderBottom: `1px solid ${C.borderSoft}` }}>
                  <span style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.15rem', background: C.creamDark, flexShrink: 0 }}>{pico(a)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.92rem', color: C.burgundy, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.titulo}</div>
                    {a.categoria && <div style={{ fontSize: '0.68rem', color: C.muted, marginTop: 2 }}>{a.categoria}</div>}
                  </div>
                  <div style={{ flex: 1 }} />
                  {actor.admin && (
                    <>
                      <button title="Editar" onClick={() => abrirEditar(a)} style={iconBtn()}>✏️</button>
                      <button title="Borrar" onClick={() => borrar(a)} style={iconBtn('del')}>🗑️</button>
                    </>
                  )}
                </div>

                <Fila k="Usuario" v={a.usuario_acceso} onCopy={a.usuario_acceso ? () => { copiarTexto(a.usuario_acceso); notify('Copiado ✓'); } : null} />
                <Fila k="Correo" v={a.correo} onCopy={a.correo ? () => { copiarTexto(a.correo); notify('Copiado ✓'); } : null} />

                {/* Clave */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${C.borderSoft}` }}>
                  <span style={rkStyle}>Clave</span>
                  <span style={{ flex: 1, fontSize: '0.84rem', fontFamily: 'ui-monospace, monospace', color: a.tiene_clave ? C.text : C.muted, letterSpacing: visible ? 0 : '0.12em', wordBreak: 'break-all' }}>
                    {!a.tiene_clave ? '— sin clave —' : (visible ? rev.clave : '••••••••••')}
                  </span>
                  {a.tiene_clave && (
                    <>
                      <button title={visible ? 'Ocultar' : 'Revelar'} onClick={() => revelar(a)} disabled={busy[a.id]} style={miniBtn()}>{busy[a.id] ? '…' : (visible ? '🙈' : '👁️')}</button>
                      <button title="Copiar clave" onClick={() => copiarClave(a)} disabled={busy[a.id]} style={miniBtn('teal')}>⧉</button>
                    </>
                  )}
                </div>

                {a.descripcion && (
                  <div style={{ display: 'flex', gap: 10, padding: '10px 16px' }}>
                    <span style={rkStyle}>Notas</span>
                    <span style={{ flex: 1, fontSize: '0.8rem', color: C.sec, lineHeight: 1.4 }}>{a.descripcion}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ textAlign: 'center', color: C.muted, fontSize: '0.72rem', marginTop: 30, lineHeight: 1.6 }}>
        🔒 Las claves se guardan cifradas. Cada vez que alguien revela o copia una clave queda registrado.
      </div>

      {toast && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: C.burgundy, color: '#fff', padding: '11px 20px', borderRadius: 10, fontSize: '0.82rem', boxShadow: '0 8px 24px rgba(0,0,0,0.2)', zIndex: 200 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────
const rkStyle = { fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#999', width: 64, flexShrink: 0, paddingTop: 2 };

function Fila({ k, v, onCopy }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: `1px solid ${C.borderSoft}` }}>
      <span style={rkStyle}>{k}</span>
      <span style={{ flex: 1, fontSize: '0.84rem', color: v ? C.text : C.muted, wordBreak: 'break-all', fontFamily: 'ui-monospace, monospace' }}>{v || '—'}</span>
      {onCopy && <button title="Copiar" onClick={onCopy} style={miniBtn('teal')}>⧉</button>}
    </div>
  );
}

function Campo({ label, value, onChange, placeholder, full, textarea }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: full ? '1 / -1' : 'auto' }}>
      <label style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted }}>{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2}
          style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      )}
    </div>
  );
}

const inputStyle = {
  background: C.cream, border: `1px solid ${C.border}`, borderRadius: 8,
  padding: '9px 12px', fontSize: '0.84rem', fontFamily: 'inherit', color: C.text, outline: 'none',
};

// ── Estilos de botones ───────────────────────────────────────────────────
function btn(bg) {
  return { background: bg, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
}
function btnGhost() {
  return { background: 'none', border: `1px solid ${C.border}`, color: C.sec, borderRadius: 9, padding: '10px 18px', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
}
function btnOutline() {
  return { background: 'none', border: `1px solid ${C.teal}`, color: C.teal, borderRadius: 8, padding: '6px 13px', fontSize: '0.76rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
}
function iconBtn(kind) {
  return { width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.85rem', color: kind === 'del' ? '#c0392b' : C.sec, flexShrink: 0 };
}
function miniBtn(kind) {
  return { width: 28, height: 28, borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: kind === 'teal' ? C.teal : C.sec, flexShrink: 0 };
}
function accionBadge(accion) {
  const map = {
    crear: ['#2d8a4e', '#e6f4ec'], editar: ['#b8860b', '#fbf3df'],
    borrar: ['#c0392b', '#fdecea'], revelar: ['#225F74', '#e3eef2'], copiar: ['#5E2733', '#f3e9eb'],
  };
  const [fg, bg] = map[accion] || ['#666', '#eee'];
  return { background: bg, color: fg, borderRadius: 20, padding: '2px 9px', fontSize: '0.68rem', fontWeight: 600, textTransform: 'capitalize', flexShrink: 0 };
}
