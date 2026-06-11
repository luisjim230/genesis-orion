'use client';
import { useEffect, useState, useCallback } from 'react';

// Inventario TI — sub-módulo dentro de la Bóveda de Accesos.
// Dos sub-pestañas: Equipos (hardware) y Licencias (software/suscripciones).
// Mismo look & feel que la bóveda. La seguridad real vive en el servidor.

const C = {
  orange: '#ED6E2E', burgundy: '#5E2733', teal: '#225F74',
  cream: '#FDF4F4', creamDark: '#F5EAEA',
  text: '#1a1a1a', sec: '#666', muted: '#999',
  border: '#EAE0E0', borderSoft: '#F0E8E8',
  shadow: '0 1px 4px rgba(94,39,51,0.06)',
};

const TIPOS_EQUIPO = ['Laptop', 'Desktop', 'Monitor', 'Impresora', 'Teléfono', 'Tablet', 'Red', 'Servidor', 'Otro'];
const ESTADOS_EQUIPO = ['Activo', 'Disponible', 'En reparación', 'De baja'];
const TIPOS_LIC = ['Suscripción', 'Perpetua', 'Otra'];

const EMPTY_EQUIPO = { nombre: '', tipo: '', marca: '', modelo: '', serie: '', asignado_a: '', ubicacion: '', estado: '', fecha_compra: '', notas: '' };
const EMPTY_LIC = { software: '', tipo: '', usuario: '', correo: '', clave: '', asignado_a: '', fecha_pago: '', costo: '', notas: '' };

function fmtFecha(s) {
  const p = String(s || '').slice(0, 10).split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : (s || '');
}
function vencimiento(s) {
  const p = String(s || '').slice(0, 10).split('-');
  if (p.length !== 3) return null;
  const d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
  const dias = Math.round((d - hoy) / 86400000);
  if (dias < 0) return { color: '#c0392b', nota: 'vencido' };
  if (dias === 0) return { color: '#c0392b', nota: 'hoy' };
  if (dias <= 7) return { color: '#b8860b', nota: `en ${dias}d` };
  return { color: C.text, nota: '' };
}
function estadoColor(e) {
  const map = {
    'Activo': ['#2d8a4e', '#e6f4ec'], 'Disponible': ['#225F74', '#e3eef2'],
    'En reparación': ['#b8860b', '#fbf3df'], 'De baja': ['#c0392b', '#fdecea'],
  };
  const [fg, bg] = map[e] || ['#666', '#eee'];
  return { background: bg, color: fg, borderRadius: 20, padding: '2px 9px', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' };
}

async function copiarTexto(t) {
  try { if (navigator.clipboard) await navigator.clipboard.writeText(t); } catch { /* ignore */ }
}

export default function InventarioTI({ actor, notify }) {
  const [tab, setTab] = useState('equipos');     // equipos | licencias
  const isAdmin = !!(actor && actor.admin);

  return (
    <div>
      {/* Sub-pestañas */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
        <button onClick={() => setTab('equipos')} style={subTab(tab === 'equipos')}>💻 Equipos</button>
        <button onClick={() => setTab('licencias')} style={subTab(tab === 'licencias')}>🧾 Licencias</button>
      </div>

      {tab === 'equipos'
        ? <Equipos isAdmin={isAdmin} notify={notify} />
        : <Licencias isAdmin={isAdmin} notify={notify} />}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// EQUIPOS
// ════════════════════════════════════════════════════════════════════════
function Equipos({ isAdmin, notify }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_EQUIPO);
  const [saving, setSaving] = useState(false);

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/boveda/equipos');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al cargar');
      setRows(j.equipos || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() { setEditId(null); setForm(EMPTY_EQUIPO); setShowForm(true); }
  function abrirEditar(a) {
    setEditId(a.id);
    setForm({
      nombre: a.nombre || '', tipo: a.tipo || '', marca: a.marca || '', modelo: a.modelo || '',
      serie: a.serie || '', asignado_a: a.asignado_a || '', ubicacion: a.ubicacion || '',
      estado: a.estado || '', fecha_compra: a.fecha_compra ? String(a.fecha_compra).slice(0, 10) : '',
      notas: a.notas || '',
    });
    setShowForm(true);
  }
  function cerrar() { setShowForm(false); setEditId(null); setForm(EMPTY_EQUIPO); }

  async function guardar() {
    if (!form.nombre.trim()) { notify('Falta el nombre del equipo'); return; }
    setSaving(true);
    try {
      const editando = !!editId;
      const r = await fetch('/api/boveda/equipos', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando ? { id: editId, ...form } : form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al guardar');
      notify(editando ? 'Equipo actualizado ✓' : 'Equipo guardado ✓');
      cerrar(); await cargar();
    } catch (e) { notify('Error: ' + e.message); } finally { setSaving(false); }
  }

  async function borrar(a) {
    if (typeof window !== 'undefined' && !window.confirm(`¿Borrar el equipo "${a.nombre}"? No se puede deshacer.`)) return;
    try {
      const r = await fetch(`/api/boveda/equipos?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al borrar');
      notify('Equipo borrado'); await cargar();
    } catch (e) { notify('Error: ' + e.message); }
  }

  const norm = (s) => String(s || '').toLowerCase();
  const ql = norm(q.trim());
  const lista = ql
    ? rows.filter((a) => [a.nombre, a.tipo, a.marca, a.modelo, a.serie, a.asignado_a, a.ubicacion, a.estado].some((f) => norm(f).includes(ql)))
    : rows;

  return (
    <div>
      <BarraSuperior
        q={q} setQ={setQ} placeholder="Buscar equipo, serie, asignado…"
        onNuevo={abrirNuevo} nuevoLabel="＋ Agregar equipo" count={rows.length} singular="equipo" plural="equipos"
      />

      {showForm && (
        <FormCard titulo={editId ? '✏️ Editar equipo' : '➕ Nuevo equipo'} onCancel={cerrar} onSave={guardar} saving={saving}>
          <Campo label="Equipo / Nombre *" value={form.nombre} onChange={(v) => setForm({ ...form, nombre: v })} placeholder="Ej: Laptop Toni" />
          <CampoSelect label="Tipo" value={form.tipo} onChange={(v) => setForm({ ...form, tipo: v })} options={TIPOS_EQUIPO} />
          <Campo label="Marca" value={form.marca} onChange={(v) => setForm({ ...form, marca: v })} placeholder="Ej: HP / Dell / Apple" />
          <Campo label="Modelo" value={form.modelo} onChange={(v) => setForm({ ...form, modelo: v })} placeholder="Ej: ProBook 450" />
          <Campo label="Número de serie" value={form.serie} onChange={(v) => setForm({ ...form, serie: v })} placeholder="S/N" />
          <Campo label="Asignado a" value={form.asignado_a} onChange={(v) => setForm({ ...form, asignado_a: v })} placeholder="Persona responsable" />
          <Campo label="Ubicación" value={form.ubicacion} onChange={(v) => setForm({ ...form, ubicacion: v })} placeholder="Sucursal / departamento" />
          <CampoSelect label="Estado" value={form.estado} onChange={(v) => setForm({ ...form, estado: v })} options={ESTADOS_EQUIPO} />
          <Campo type="date" label="Fecha de compra" value={form.fecha_compra} onChange={(v) => setForm({ ...form, fecha_compra: v })} />
          <Campo full textarea label="Notas" value={form.notas} onChange={(v) => setForm({ ...form, notas: v })} placeholder="Accesorios, garantía, observaciones…" />
        </FormCard>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}

      {loading ? <Cargando /> : lista.length === 0 ? (
        <Vacio hayDatos={rows.length > 0} nuevoLabel="＋ Agregar equipo">equipos</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Equipo</Th><Th>Tipo</Th><Th>Marca / Modelo</Th><Th>Serie</Th>
              <Th>Asignado a</Th><Th>Ubicación</Th><Th>Estado</Th><Th>Compra</Th>
              {isAdmin && <Th right>Acciones</Th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => (
              <tr key={a.id} style={trStyle}>
                <Td bold>{a.nombre}</Td>
                <Td>{a.tipo || '—'}</Td>
                <Td>{[a.marca, a.modelo].filter(Boolean).join(' ') || '—'}</Td>
                <Td mono>{a.serie || '—'}</Td>
                <Td>{a.asignado_a || '—'}</Td>
                <Td>{a.ubicacion || '—'}</Td>
                <Td>{a.estado ? <span style={estadoColor(a.estado)}>{a.estado}</span> : '—'}</Td>
                <Td>{a.fecha_compra ? fmtFecha(a.fecha_compra) : '—'}</Td>
                {isAdmin && (
                  <Td right>
                    <button title="Editar" onClick={() => abrirEditar(a)} style={iconBtn()}>✏️</button>
                    <button title="Borrar" onClick={() => borrar(a)} style={iconBtn('del')}>🗑️</button>
                  </Td>
                )}
              </tr>
            ))}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// LICENCIAS
// ════════════════════════════════════════════════════════════════════════
function Licencias({ isAdmin, notify }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_LIC);
  const [saving, setSaving] = useState(false);
  const [revealed, setRevealed] = useState({});   // id -> { clave, visible }
  const [busy, setBusy] = useState({});

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/boveda/licencias');
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al cargar');
      setRows(j.licencias || []);
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  function abrirNuevo() { setEditId(null); setForm(EMPTY_LIC); setShowForm(true); }
  function abrirEditar(a) {
    setEditId(a.id);
    setForm({
      software: a.software || '', tipo: a.tipo || '', usuario: a.usuario || '', correo: a.correo || '',
      clave: '', asignado_a: a.asignado_a || '', fecha_pago: a.fecha_pago ? String(a.fecha_pago).slice(0, 10) : '',
      costo: a.costo || '', notas: a.notas || '',
    });
    setShowForm(true);
  }
  function cerrar() { setShowForm(false); setEditId(null); setForm(EMPTY_LIC); }

  async function guardar() {
    if (!form.software.trim()) { notify('Falta el nombre del software'); return; }
    setSaving(true);
    try {
      const editando = !!editId;
      const r = await fetch('/api/boveda/licencias', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando ? { id: editId, ...form } : form),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al guardar');
      notify(editando ? 'Licencia actualizada ✓' : 'Licencia guardada ✓');
      cerrar();
      if (editando) setRevealed((p) => { const n = { ...p }; delete n[editId]; return n; });
      await cargar();
    } catch (e) { notify('Error: ' + e.message); } finally { setSaving(false); }
  }

  async function borrar(a) {
    if (typeof window !== 'undefined' && !window.confirm(`¿Borrar la licencia "${a.software}"? No se puede deshacer.`)) return;
    try {
      const r = await fetch(`/api/boveda/licencias?id=${encodeURIComponent(a.id)}`, { method: 'DELETE' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al borrar');
      notify('Licencia borrada'); await cargar();
    } catch (e) { notify('Error: ' + e.message); }
  }

  async function pedirClave(id, accion) {
    const r = await fetch('/api/boveda/licencias/reveal', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, accion }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Error');
    return j.clave;
  }
  async function revelar(a) {
    const cur = revealed[a.id];
    if (cur && cur.clave != null) { setRevealed((p) => ({ ...p, [a.id]: { ...cur, visible: !cur.visible } })); return; }
    setBusy((p) => ({ ...p, [a.id]: true }));
    try {
      const clave = await pedirClave(a.id, 'revelar');
      setRevealed((p) => ({ ...p, [a.id]: { clave, visible: true } }));
    } catch (e) { notify('Error: ' + e.message); } finally { setBusy((p) => ({ ...p, [a.id]: false })); }
  }
  async function copiarClave(a) {
    setBusy((p) => ({ ...p, [a.id]: true }));
    try {
      const clave = await pedirClave(a.id, 'copiar');
      if (clave == null) { notify('Esta licencia no tiene clave'); return; }
      await copiarTexto(clave);
      setRevealed((p) => ({ ...p, [a.id]: { clave, visible: (p[a.id]?.visible) || false } }));
      notify('Clave copiada ✓');
    } catch (e) { notify('Error: ' + e.message); } finally { setBusy((p) => ({ ...p, [a.id]: false })); }
  }

  const norm = (s) => String(s || '').toLowerCase();
  const ql = norm(q.trim());
  const lista = ql
    ? rows.filter((a) => [a.software, a.tipo, a.usuario, a.correo, a.asignado_a].some((f) => norm(f).includes(ql)))
    : rows;

  return (
    <div>
      <BarraSuperior
        q={q} setQ={setQ} placeholder="Buscar software, usuario, correo…"
        onNuevo={abrirNuevo} nuevoLabel="＋ Agregar licencia" count={rows.length} singular="licencia" plural="licencias"
      />

      {showForm && (
        <FormCard titulo={editId ? '✏️ Editar licencia' : '➕ Nueva licencia'} onCancel={cerrar} onSave={guardar} saving={saving}>
          <Campo label="Software *" value={form.software} onChange={(v) => setForm({ ...form, software: v })} placeholder="Ej: Microsoft 365" />
          <CampoSelect label="Tipo" value={form.tipo} onChange={(v) => setForm({ ...form, tipo: v })} options={TIPOS_LIC} />
          <Campo label="Usuario / Cuenta" value={form.usuario} onChange={(v) => setForm({ ...form, usuario: v })} placeholder="usuario de la licencia" />
          <Campo label="Correo asociado" value={form.correo} onChange={(v) => setForm({ ...form, correo: v })} placeholder="correo@ejemplo.com" />
          <Campo label="Asignado a" value={form.asignado_a} onChange={(v) => setForm({ ...form, asignado_a: v })} placeholder="A quién pertenece / la usa" />
          <Campo type="date" label="Próximo pago / renovación" value={form.fecha_pago} onChange={(v) => setForm({ ...form, fecha_pago: v })} />
          <Campo label="Costo" value={form.costo} onChange={(v) => setForm({ ...form, costo: v })} placeholder="Ej: $99/año" />
          <Campo full label={editId ? 'Clave / Serial (dejá vacío para no cambiarla)' : 'Clave / Serial (opcional)'} value={form.clave} onChange={(v) => setForm({ ...form, clave: v })} placeholder="product key / serial" />
          <Campo full textarea label="Notas" value={form.notas} onChange={(v) => setForm({ ...form, notas: v })} placeholder="Cantidad de asientos, observaciones…" />
        </FormCard>
      )}

      {error && <ErrorBox>{error}</ErrorBox>}

      {loading ? <Cargando /> : lista.length === 0 ? (
        <Vacio hayDatos={rows.length > 0} nuevoLabel="＋ Agregar licencia">licencias</Vacio>
      ) : (
        <Tabla>
          <thead>
            <tr>
              <Th>Software</Th><Th>Tipo</Th><Th>Usuario / Correo</Th><Th>Clave</Th>
              <Th>Asignado a</Th><Th>Próximo pago</Th><Th>Costo</Th>
              {isAdmin && <Th right>Acciones</Th>}
            </tr>
          </thead>
          <tbody>
            {lista.map((a) => {
              const rev = revealed[a.id];
              const visible = rev && rev.visible;
              const v = a.fecha_pago ? vencimiento(a.fecha_pago) : null;
              return (
                <tr key={a.id} style={trStyle}>
                  <Td bold>{a.software}</Td>
                  <Td>{a.tipo || '—'}</Td>
                  <Td>
                    <div>{a.usuario || '—'}</div>
                    {a.correo && <div style={{ fontSize: '0.74rem', color: C.muted }}>{a.correo}</div>}
                  </Td>
                  <Td>
                    {!a.tiene_clave ? <span style={{ color: C.muted }}>—</span> : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontFamily: 'ui-monospace, monospace', letterSpacing: visible ? 0 : '0.12em' }}>
                          {visible ? rev.clave : '••••••'}
                        </span>
                        <button title={visible ? 'Ocultar' : 'Revelar'} onClick={() => revelar(a)} disabled={busy[a.id]} style={miniBtn()}>{busy[a.id] ? '…' : (visible ? '🙈' : '👁️')}</button>
                        <button title="Copiar" onClick={() => copiarClave(a)} disabled={busy[a.id]} style={miniBtn('teal')}>⧉</button>
                      </span>
                    )}
                  </Td>
                  <Td>{a.asignado_a || '—'}</Td>
                  <Td>
                    {a.fecha_pago ? (
                      <span style={{ color: v ? v.color : C.text, fontWeight: 600 }}>
                        {fmtFecha(a.fecha_pago)}{v && v.nota && <span style={{ fontWeight: 500, fontSize: '0.72rem' }}> · {v.nota}</span>}
                      </span>
                    ) : '—'}
                  </Td>
                  <Td>{a.costo || '—'}</Td>
                  {isAdmin && (
                    <Td right>
                      <button title="Editar" onClick={() => abrirEditar(a)} style={iconBtn()}>✏️</button>
                      <button title="Borrar" onClick={() => borrar(a)} style={iconBtn('del')}>🗑️</button>
                    </Td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </Tabla>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Subcomponentes compartidos
// ════════════════════════════════════════════════════════════════════════
function BarraSuperior({ q, setQ, placeholder, onNuevo, nuevoLabel, count, singular, plural }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
      <div style={{ position: 'relative', flex: 1, minWidth: 240, maxWidth: 420 }}>
        <span style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', opacity: 0.4 }}>🔍</span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder}
          style={{ width: '100%', background: '#fff', border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 14px 10px 38px', fontSize: '0.85rem', fontFamily: 'inherit', color: C.text, outline: 'none' }} />
      </div>
      <span style={{ fontSize: '0.78rem', color: C.muted }}>{count} {count === 1 ? singular : plural}</span>
      <button onClick={onNuevo} style={{ ...btn(C.orange), marginLeft: 'auto' }}>{nuevoLabel}</button>
    </div>
  );
}

function FormCard({ titulo, children, onCancel, onSave, saving }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.borderSoft}`, borderRadius: 12, boxShadow: C.shadow, padding: '18px 20px', marginBottom: 20 }}>
      <h3 style={{ fontSize: '0.92rem', color: C.burgundy, fontWeight: 600, marginBottom: 14 }}>{titulo}</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>{children}</div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
        <button onClick={onCancel} style={btnGhost()}>Cancelar</button>
        <button onClick={onSave} disabled={saving} style={btn(saving ? '#bbb' : C.orange)}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </div>
    </div>
  );
}

function Campo({ label, value, onChange, placeholder, full, textarea, type }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5, gridColumn: full ? '1 / -1' : 'auto' }}>
      <label style={lblStyle}>{label}</label>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={2} style={{ ...inputStyle, resize: 'vertical', minHeight: 48 }} />
      ) : (
        <input type={type || 'text'} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      )}
    </div>
  );
}
function CampoSelect({ label, value, onChange, options }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={lblStyle}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={inputStyle}>
        <option value="">— Seleccionar —</option>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}

function Tabla({ children }) {
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.borderSoft}`, borderRadius: 12, boxShadow: C.shadow, overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.83rem' }}>{children}</table>
    </div>
  );
}
function Th({ children, right }) {
  return <th style={{ textAlign: right ? 'right' : 'left', padding: '11px 14px', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: C.muted, borderBottom: `1px solid ${C.borderSoft}`, whiteSpace: 'nowrap', background: C.cream }}>{children}</th>;
}
function Td({ children, bold, mono, right }) {
  return <td style={{ padding: '11px 14px', borderBottom: `1px solid ${C.borderSoft}`, color: bold ? C.burgundy : C.text, fontWeight: bold ? 600 : 400, fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', textAlign: right ? 'right' : 'left', verticalAlign: 'top', whiteSpace: right ? 'nowrap' : 'normal' }}>{children}</td>;
}

function Cargando() { return <div style={{ padding: 40, color: C.muted, textAlign: 'center' }}>Cargando…</div>; }
function ErrorBox({ children }) {
  return <div style={{ background: '#fdecea', border: '1px solid #f5c6c2', color: '#a33', borderRadius: 10, padding: '12px 16px', marginBottom: 16, fontSize: '0.85rem' }}>{children}</div>;
}
function Vacio({ hayDatos, nuevoLabel, children }) {
  return (
    <div style={{ textAlign: 'center', color: C.muted, padding: '50px 20px', background: '#fff', border: `1px dashed ${C.border}`, borderRadius: 12 }}>
      {hayDatos ? `No hay ${children} que coincidan con la búsqueda.`
        : <>Todavía no hay {children} cargados.<br />Tocá <b style={{ color: C.orange }}>{nuevoLabel}</b> para cargar el primero.</>}
    </div>
  );
}

// ── Estilos ────────────────────────────────────────────────────────────────
const lblStyle = { fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: C.muted };
const inputStyle = { background: C.cream, border: `1px solid ${C.border}`, borderRadius: 8, padding: '9px 12px', fontSize: '0.84rem', fontFamily: 'inherit', color: C.text, outline: 'none' };
const trStyle = {};

function subTab(active) {
  return {
    background: active ? C.burgundy : '#fff', color: active ? '#fff' : C.sec,
    border: `1px solid ${active ? C.burgundy : C.border}`, borderRadius: 9,
    padding: '8px 16px', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
  };
}
function btn(bg) { return { background: bg, color: '#fff', border: 'none', borderRadius: 9, padding: '10px 18px', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }; }
function btnGhost() { return { background: 'none', border: `1px solid ${C.border}`, color: C.sec, borderRadius: 9, padding: '10px 18px', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }; }
function iconBtn(kind) { return { width: 30, height: 30, borderRadius: 8, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontSize: '0.85rem', color: kind === 'del' ? '#c0392b' : C.sec, marginLeft: 4 }; }
function miniBtn(kind) { return { width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontSize: '0.78rem', color: kind === 'teal' ? C.teal : C.sec }; }
