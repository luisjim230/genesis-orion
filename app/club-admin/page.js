'use client';

// Panel admin del Club del Enchapador (DENTRO de SOL, protegido por el login).
// Lee/escribe vía /api/club-admin/* (server + service role). Se gatea con el
// permiso 'club-admin' (mismo mecanismo que el resto de módulos de SOL).

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../lib/useAuth';

const C = {
  orange: '#ED6E2E', burgundy: '#5E2733', teal: '#225F74',
  cream: '#FDF4F4', text: '#1a1a1a', sec: '#666', muted: '#999',
  border: '#EAE0E0', green: '#2e8b57', red: '#c0392b',
  card: '#fff', shadow: '0 1px 4px rgba(94,39,51,0.06)',
};

const money = (n) => '₡' + (Number(n) || 0).toLocaleString('es-CR');
const fmtFecha = (s) => {
  if (!s) return '';
  try {
    return new Date(s).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
};

export default function ClubAdminPage() {
  const { loading: authLoading, puedeVer } = useAuth();
  const autorizado = puedeVer('club-admin');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('ranking');

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/club-admin', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al cargar');
      setData(j);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (autorizado) cargar(); }, [autorizado, cargar]);

  if (authLoading) return <Centro>Cargando…</Centro>;
  if (!autorizado) return <Centro>🔒 No tenés permiso para ver el Club del Enchapador.</Centro>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.burgundy, margin: 0 }}>🧱 Club del Enchapador</h1>
        <a href="/club" target="_blank" rel="noreferrer" style={{
          fontSize: 13, color: C.orange, fontWeight: 600, textDecoration: 'none',
          border: `1px solid ${C.orange}`, borderRadius: 8, padding: '4px 10px',
        }}>Ver página pública ↗</a>
      </div>
      <p style={{ color: C.sec, margin: '0 0 18px', fontSize: 14 }}>
        Fidelización de contratistas · puntos por mortero Impersa.
      </p>

      {error && <Banner tipo="error">{error}</Banner>}

      {data && (
        <>
          <KpiRow k={data.kpis} />

          <div style={{ display: 'flex', gap: 6, margin: '20px 0 16px', flexWrap: 'wrap' }}>
            {[
              ['ranking', `Miembros (${data.saldos.length})`],
              ['registros', `Registros (${data.registros.length})`],
              ['productos', `Productos (${data.productos.length})`],
              ['canje', 'Registrar canje'],
            ].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                padding: '8px 14px', borderRadius: 9, fontSize: 13.5, fontWeight: 600,
                cursor: 'pointer', border: `1px solid ${tab === k ? C.orange : C.border}`,
                background: tab === k ? C.orange : '#fff', color: tab === k ? '#fff' : C.sec,
              }}>{label}</button>
            ))}
          </div>

          {tab === 'ranking' && <Ranking saldos={data.saldos} />}
          {tab === 'registros' && <Registros registros={data.registros} />}
          {tab === 'productos' && <Productos productos={data.productos} onChange={cargar} />}
          {tab === 'canje' && <Canje saldos={data.saldos} onDone={cargar} />}
        </>
      )}

      {loading && !data && <Centro>Cargando datos…</Centro>}
    </div>
  );
}

function KpiRow({ k }) {
  const items = [
    { label: 'Miembros', valor: k.totalMiembros, icon: '👥' },
    { label: 'Puntos en circulación', valor: (Number(k.puntosCirculacion) || 0).toLocaleString('es-CR'), icon: '⭐' },
    { label: 'Facturas este mes', valor: k.facturasMes, icon: '🧾' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
      {items.map((it) => (
        <div key={it.label} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 30 }}>{it.icon}</span>
          <div>
            <div style={{ fontSize: 26, fontWeight: 800, color: C.burgundy, lineHeight: 1 }}>{it.valor}</div>
            <div style={{ fontSize: 12.5, color: C.muted }}>{it.label}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function Ranking({ saldos }) {
  const [q, setQ] = useState('');
  const filtro = q.trim().toLowerCase();
  const rows = filtro
    ? saldos.filter((s) => `${s.cedula} ${s.nombre || ''}`.toLowerCase().includes(filtro))
    : saldos;

  return (
    <div style={cardStyle}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cédula o nombre…" style={inputStyle} />
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              <Th>#</Th><Th>Cédula</Th><Th>Nombre</Th><Th>Teléfono</Th><Th right>Puntos</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.cedula} style={{ borderTop: `1px solid ${C.border}` }}>
                <Td>{i + 1}</Td>
                <Td mono>{s.cedula}</Td>
                <Td>{s.nombre || <span style={{ color: C.muted }}>—</span>}</Td>
                <Td>{s.telefono || <span style={{ color: C.muted }}>—</span>}</Td>
                <Td right><b style={{ color: C.burgundy }}>{Number(s.puntos) || 0}</b></Td>
              </tr>
            ))}
            {rows.length === 0 && <tr><Td colSpan={5}><span style={{ color: C.muted }}>Sin resultados.</span></Td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Registros({ registros }) {
  const [abierto, setAbierto] = useState(null);
  return (
    <div style={cardStyle}>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr><Th>Fecha</Th><Th>Cédula</Th><Th>Factura</Th><Th right>Monto</Th><Th right>Puntos</Th><Th></Th></tr>
          </thead>
          <tbody>
            {registros.map((r) => (
              <FragmentRow key={r.id} r={r} abierto={abierto === r.id} onToggle={() => setAbierto(abierto === r.id ? null : r.id)} />
            ))}
            {registros.length === 0 && <tr><Td colSpan={6}><span style={{ color: C.muted }}>Sin registros.</span></Td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FragmentRow({ r, abierto, onToggle }) {
  const detalle = Array.isArray(r.detalle) ? r.detalle : [];
  return (
    <>
      <tr style={{ borderTop: `1px solid ${C.border}` }}>
        <Td>{fmtFecha(r.fecha_registro)}</Td>
        <Td mono>{r.cedula}</Td>
        <Td mono>{r.factura}</Td>
        <Td right>{money(r.monto_real ?? r.monto_declarado)}</Td>
        <Td right><b style={{ color: C.green }}>+{Number(r.puntos) || 0}</b></Td>
        <Td right>
          {detalle.length > 0 && (
            <button onClick={onToggle} style={miniBtn}>{abierto ? 'Ocultar' : 'Detalle'}</button>
          )}
        </Td>
      </tr>
      {abierto && detalle.length > 0 && (
        <tr>
          <td colSpan={6} style={{ padding: '4px 12px 12px', background: '#faf6f6' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {detalle.map((d, i) => (
                <span key={i} style={{
                  fontSize: 12.5, padding: '4px 10px', borderRadius: 8,
                  background: d.suma ? '#e7f4ec' : '#efe9e9',
                  color: d.suma ? C.green : C.muted, fontWeight: 600,
                }}>
                  {d.producto || 'Producto'} ×{d.cantidad ?? 0} {d.suma ? `(+${d.puntos ?? 0})` : '(no suma)'}
                </span>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function Productos({ productos, onChange }) {
  const [busy, setBusy] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [msg, setMsg] = useState(null);

  async function patch(codigo, body) {
    setBusy(codigo); setMsg(null);
    try {
      const r = await fetch('/api/club-admin/productos', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_interno: codigo, ...body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      setMsg({ tipo: 'ok', txt: 'Guardado.' });
      await onChange();
    } catch (e) {
      setMsg({ tipo: 'error', txt: e.message });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={cardStyle}>
      {msg && <Banner tipo={msg.tipo}>{msg.txt}</Banner>}
      <p style={{ fontSize: 13, color: C.sec, margin: '0 0 12px' }}>
        Códigos nuevos de Impersa: consultá <code style={{ background: '#f3eeee', padding: '1px 5px', borderRadius: 4 }}>neo_lista_items</code> (proveedor Impersa).
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr><Th>Código</Th><Th>Descripción</Th><Th>Puntos/unidad</Th><Th>Activo</Th></tr>
          </thead>
          <tbody>
            {productos.map((p) => {
              const draft = drafts[p.codigo_interno];
              const val = draft !== undefined ? draft : p.puntos_por_unidad;
              const cambiado = draft !== undefined && Number(draft) !== Number(p.puntos_por_unidad);
              return (
                <tr key={p.codigo_interno} style={{ borderTop: `1px solid ${C.border}` }}>
                  <Td mono>{p.codigo_interno}</Td>
                  <Td>{p.descripcion}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="number" min="0" step="1" value={val}
                        onChange={(e) => setDrafts((s) => ({ ...s, [p.codigo_interno]: e.target.value }))}
                        style={{ ...inputStyle, width: 80, padding: '6px 8px', marginTop: 0 }}
                      />
                      {cambiado && (
                        <button disabled={busy === p.codigo_interno} onClick={() => patch(p.codigo_interno, { puntos_por_unidad: val })} style={miniBtnOrange}>
                          Guardar
                        </button>
                      )}
                    </div>
                  </Td>
                  <Td>
                    <button
                      disabled={busy === p.codigo_interno}
                      onClick={() => patch(p.codigo_interno, { activo: !p.activo })}
                      style={{
                        ...miniBtn,
                        background: p.activo ? C.green : '#eee',
                        color: p.activo ? '#fff' : C.sec,
                        borderColor: p.activo ? C.green : C.border,
                      }}
                    >
                      {p.activo ? 'Activo' : 'Inactivo'}
                    </button>
                  </Td>
                </tr>
              );
            })}
            {productos.length === 0 && <tr><Td colSpan={4}><span style={{ color: C.muted }}>Sin productos.</span></Td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Canje({ saldos, onDone }) {
  const [f, setF] = useState({ cedula: '', premio: '', puntos: '', nota: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const miembro = saldos.find((s) => s.cedula === f.cedula.trim());

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/club-admin/canje', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cedula: f.cedula.trim(), premio: f.premio.trim(), puntos: Number(f.puntos), nota: f.nota.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      setMsg({ tipo: 'ok', txt: `Canje registrado. Saldo restante: ${j.saldo_restante} puntos.` });
      setF({ cedula: '', premio: '', puntos: '', nota: '' });
      await onDone();
    } catch (e) {
      setMsg({ tipo: 'error', txt: e.message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ ...cardStyle, maxWidth: 520 }}>
      {msg && <Banner tipo={msg.tipo}>{msg.txt}</Banner>}
      <form onSubmit={submit}>
        <Field label="Cédula del miembro">
          <input value={f.cedula} onChange={set('cedula')} placeholder="1-2345-6789" style={inputStyle} list="cedulas-club" />
          <datalist id="cedulas-club">
            {saldos.map((s) => <option key={s.cedula} value={s.cedula}>{s.nombre} ({s.puntos} pts)</option>)}
          </datalist>
          {f.cedula.trim() && (
            <p style={{ margin: '6px 0 0', fontSize: 12.5, color: miembro ? C.green : C.red }}>
              {miembro ? `${miembro.nombre || 'Miembro'} · saldo actual: ${miembro.puntos} puntos` : 'No existe un miembro con esa cédula.'}
            </p>
          )}
        </Field>
        <Field label="Premio">
          <input value={f.premio} onChange={set('premio')} placeholder="Ej: Rodilleras profesionales" style={inputStyle} />
        </Field>
        <Field label="Puntos a descontar">
          <input type="number" min="1" value={f.puntos} onChange={set('puntos')} placeholder="Ej: 25" style={inputStyle} />
        </Field>
        <Field label="Nota (opcional)">
          <input value={f.nota} onChange={set('nota')} placeholder="Observación interna" style={inputStyle} />
        </Field>
        <button type="submit" disabled={busy} style={{
          width: '100%', marginTop: 8, padding: 13, borderRadius: 10, border: 'none',
          background: busy ? '#f0a878' : C.orange, color: '#fff', fontWeight: 700, fontSize: 15,
          cursor: busy ? 'wait' : 'pointer',
        }}>
          {busy ? 'Registrando…' : 'Registrar canje'}
        </button>
      </form>
    </div>
  );
}

// ── Piezas UI ────────────────────────────────────────────────────────────────
const cardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, boxShadow: C.shadow };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 14, border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', marginTop: 4 };
const miniBtn = { fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', color: C.sec, cursor: 'pointer' };
const miniBtnOrange = { ...miniBtn, background: C.orange, color: '#fff', borderColor: C.orange };

function Th({ children, right }) {
  return <th style={{ textAlign: right ? 'right' : 'left', padding: '8px 10px', fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</th>;
}
function Td({ children, right, mono, colSpan }) {
  return <td colSpan={colSpan} style={{ textAlign: right ? 'right' : 'left', padding: '9px 10px', fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }}>{children}</td>;
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.burgundy, marginBottom: 2 }}>{label}</label>
      {children}
    </div>
  );
}
function Banner({ tipo, children }) {
  const ok = tipo === 'ok';
  return (
    <div style={{
      padding: '10px 12px', borderRadius: 10, marginBottom: 12, fontSize: 13.5, fontWeight: 500,
      background: ok ? '#e7f4ec' : '#fdecec', color: ok ? C.green : '#b03a3a',
      border: `1px solid ${ok ? '#bfe3cd' : '#f5c6c6'}`,
    }}>{children}</div>
  );
}
function Centro({ children }) {
  return <div style={{ padding: 60, textAlign: 'center', color: C.sec, fontSize: 15 }}>{children}</div>;
}
