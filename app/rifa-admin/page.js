'use client';

// Panel admin de la Rifa de Motos (DENTRO de SOL, protegido por el login).
// Lee/escribe vía /api/rifa-admin/* (server + service role). Se gatea con el
// permiso 'rifa-admin' (mismo mecanismo que el resto de módulos de SOL).

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../lib/useAuth';

const C = {
  orange: '#ED6E2E', burgundy: '#5E2733', teal: '#225F74',
  cream: '#FDF4F4', text: '#1a1a1a', sec: '#666', muted: '#999',
  border: '#EAE0E0', green: '#2e8b57', red: '#c0392b', gold: '#C9962E',
  card: '#fff', shadow: '0 1px 4px rgba(94,39,51,0.06)',
};

const money = (n) => '₡' + (Number(n) || 0).toLocaleString('es-CR');
const fmtFecha = (s) => {
  if (!s) return '';
  try { return new Date(s).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
};

export default function RifaAdminPage() {
  const { loading: authLoading, puedeVer } = useAuth();
  const autorizado = puedeVer('rifa-admin');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('ranking');

  const cargar = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const r = await fetch('/api/rifa-admin', { cache: 'no-store' });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error al cargar');
      setData(j);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (autorizado) cargar(); }, [autorizado, cargar]);

  if (authLoading) return <Centro>Cargando…</Centro>;
  if (!autorizado) return <Centro>🔒 No tenés permiso para ver la Rifa de Motos.</Centro>;

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', color: C.text }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: C.burgundy, margin: 0 }}>🏍️ Rifa de Motos</h1>
        <a href="/rifa" target="_blank" rel="noreferrer" style={{
          fontSize: 13, color: C.orange, fontWeight: 600, textDecoration: 'none',
          border: `1px solid ${C.orange}`, borderRadius: 8, padding: '4px 10px',
        }}>Ver página pública ↗</a>
      </div>
      <p style={{ color: C.sec, margin: '0 0 18px', fontSize: 14 }}>
        Acciones por compra · sorteo ponderado · gestión de patrocinadores.
      </p>

      {error && <Banner tipo="error">{error}</Banner>}

      {data && (
        <>
          <KpiRow k={data.kpis} />
          <div style={{ display: 'flex', gap: 6, margin: '20px 0 16px', flexWrap: 'wrap' }}>
            {[
              ['ranking', `Participantes (${data.saldos.length})`],
              ['registros', `Registros (${data.registros.length})`],
              ['pendientes', `⏳ Pendientes (${data.kpis.pendientesEnCola || 0})`],
              ['sorteo', `🎰 Sorteo (${data.ganadores.length})`],
              ['patrocinadores', `Patrocinadores (${data.patrocinadores.length})`],
              ['config', 'Configuración'],
            ].map(([k, label]) => (
              <button key={k} onClick={() => setTab(k)} style={{
                padding: '8px 14px', borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${tab === k ? C.orange : C.border}`,
                background: tab === k ? C.orange : '#fff', color: tab === k ? '#fff' : C.sec,
              }}>{label}</button>
            ))}
          </div>

          {tab === 'ranking' && <Ranking saldos={data.saldos} />}
          {tab === 'registros' && <Registros registros={data.registros} />}
          {tab === 'pendientes' && <Pendientes lista={data.pendientes} onChange={cargar} />}
          {tab === 'sorteo' && <Sorteo kpis={data.kpis} ganadores={data.ganadores} onChange={cargar} />}
          {tab === 'patrocinadores' && <Patrocinadores lista={data.patrocinadores} onChange={cargar} />}
          {tab === 'config' && <Config rows={data.configRows} onChange={cargar} />}
        </>
      )}

      {loading && !data && <Centro>Cargando datos…</Centro>}
    </div>
  );
}

function KpiRow({ k }) {
  const items = [
    { label: 'Participantes', valor: k.totalParticipantes, icon: '👥' },
    { label: 'Acciones en juego', valor: (Number(k.accionesCirculacion) || 0).toLocaleString('es-CR'), icon: '🎟️' },
    { label: 'Elegibles (sin premio)', valor: `${k.elegibles} · ${(Number(k.accionesElegibles) || 0).toLocaleString('es-CR')} acc.`, icon: '🎯' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
      {items.map((it) => (
        <div key={it.label} style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 30 }}>{it.icon}</span>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800, color: C.burgundy, lineHeight: 1 }}>{it.valor}</div>
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
  const rows = filtro ? saldos.filter((s) => `${s.cedula} ${s.nombre || ''}`.toLowerCase().includes(filtro)) : saldos;
  return (
    <div style={cardStyle}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por cédula o nombre…" style={inputStyle} />
      <div style={{ overflowX: 'auto', marginTop: 12 }}>
        <table style={tableStyle}>
          <thead><tr><Th>#</Th><Th>Cédula</Th><Th>Nombre</Th><Th>Teléfono</Th><Th right>Acciones</Th><Th>Estado</Th></tr></thead>
          <tbody>
            {rows.map((s, i) => (
              <tr key={s.cedula} style={{ borderTop: `1px solid ${C.border}` }}>
                <Td>{i + 1}</Td>
                <Td mono>{s.cedula}</Td>
                <Td>{s.nombre || <span style={{ color: C.muted }}>—</span>}</Td>
                <Td>{s.telefono || <span style={{ color: C.muted }}>—</span>}</Td>
                <Td right><b style={{ color: C.burgundy }}>{Number(s.acciones) || 0}</b></Td>
                <Td>{s.ya_gano ? <span style={{ color: C.gold, fontWeight: 700 }}>🏆 Ganó</span> : <span style={{ color: C.green }}>Elegible</span>}</Td>
              </tr>
            ))}
            {rows.length === 0 && <tr><Td colSpan={6}><span style={{ color: C.muted }}>Sin resultados.</span></Td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Registros({ registros }) {
  return (
    <div style={cardStyle}>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead><tr><Th>Fecha</Th><Th>Cédula</Th><Th>Factura</Th><Th right>Monto</Th><Th>Bonos</Th><Th right>Acciones</Th></tr></thead>
          <tbody>
            {registros.map((r) => (
              <tr key={r.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <Td>{fmtFecha(r.fecha_registro)}</Td>
                <Td mono>{r.cedula}</Td>
                <Td mono>…{String(r.factura || '').slice(-6)}</Td>
                <Td right>{money(r.monto_real)}</Td>
                <Td>
                  <span style={{ fontSize: 12, color: C.muted }}>{Number(r.base_acciones) || 0} × {Number(r.multiplicador) || 1}</span>{' '}
                  {r.es_web && <Chip color={C.teal}>web ×3</Chip>}
                  {!r.es_web && r.tuvo_patrocinador && <Chip color={C.gold}>patroc ×2</Chip>}
                </Td>
                <Td right><b style={{ color: C.green }}>+{Number(r.acciones) || 0}</b></Td>
              </tr>
            ))}
            {registros.length === 0 && <tr><Td colSpan={6}><span style={{ color: C.muted }}>Sin registros.</span></Td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Pendientes ────────────────────────────────────────────────────────────────
function Pendientes({ lista, onChange }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function accion(metodo, body) {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/rifa-admin/pendientes', {
        method: metodo, headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      if (j.resultado) setMsg({ tipo: 'ok', txt: `Robot: ${j.resultado.acreditadas} acreditadas, ${j.resultado.en_espera} en espera, ${j.resultado.fallidas} fallidas.` });
      await onChange();
    } catch (e) { setMsg({ tipo: 'error', txt: e.message }); }
    finally { setBusy(false); }
  }

  const badge = (estado) => {
    const map = { pendiente: [C.gold, 'En cola'], procesada: [C.green, 'Acreditada'], fallida: [C.red, 'Fallida'] };
    const [color, txt] = map[estado] || [C.muted, estado];
    return <Chip color={color}>{txt}</Chip>;
  };

  return (
    <div style={cardStyle}>
      {msg && <Banner tipo={msg.tipo}>{msg.txt}</Banner>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
        <p style={{ fontSize: 13, color: C.sec, margin: 0 }}>
          Facturas que el cliente registró antes de que sincronizaran. El robot reintenta solo cada 30 min.
        </p>
        <button onClick={() => accion('POST')} disabled={busy} style={miniBtnOrange}>
          {busy ? 'Procesando…' : '⚡ Procesar ahora'}
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead><tr><Th>Fecha</Th><Th>Cédula</Th><Th>Factura</Th><Th right>Monto</Th><Th>Estado</Th><Th right>Intentos</Th><Th>Detalle</Th><Th></Th></tr></thead>
          <tbody>
            {lista.map((p) => (
              <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                <Td>{fmtFecha(p.fecha_creacion)}</Td>
                <Td mono>{p.cedula}</Td>
                <Td mono>…{p.ult_factura}</Td>
                <Td right>{money(p.monto_declarado)}</Td>
                <Td>{badge(p.estado)}</Td>
                <Td right>{p.intentos}</Td>
                <Td><span style={{ fontSize: 12, color: C.muted }}>{p.ultimo_error || '—'}</span></Td>
                <Td right>
                  {p.estado === 'fallida' && <button onClick={() => accion('PATCH', { id: p.id })} style={miniBtn}>Reintentar</button>}{' '}
                  <button onClick={() => { if (confirm('¿Eliminar este pendiente?')) accion('DELETE', { id: p.id }); }} style={miniBtn}>✕</button>
                </Td>
              </tr>
            ))}
            {lista.length === 0 && <tr><Td colSpan={8}><span style={{ color: C.muted }}>Sin pendientes.</span></Td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Sorteo ────────────────────────────────────────────────────────────────────
function Sorteo({ kpis, ganadores, onChange }) {
  const [f, setF] = useState({ premio: '', ronda: '', seed: '', nota: '' });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [ganador, setGanador] = useState(null);
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function sortear() {
    if (!f.premio.trim()) { setMsg({ tipo: 'error', txt: 'Escribí el premio que estás sorteando.' }); return; }
    if (!confirm(`¿Sortear "${f.premio}" entre ${kpis.elegibles} elegibles?`)) return;
    setBusy(true); setMsg(null); setGanador(null);
    try {
      const r = await fetch('/api/rifa-admin/sorteo', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ premio: f.premio.trim(), ronda: f.ronda, seed: f.seed.trim(), nota: f.nota.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      setGanador(j);
      setF((s) => ({ ...s, seed: '', nota: '' }));
      await onChange();
    } catch (e) { setMsg({ tipo: 'error', txt: e.message }); }
    finally { setBusy(false); }
  }

  async function deshacer(id) {
    if (!confirm('¿Deshacer este ganador? Vuelve a quedar elegible.')) return;
    try {
      const r = await fetch('/api/rifa-admin/sorteo', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      await onChange();
    } catch (e) { setMsg({ tipo: 'error', txt: e.message }); }
  }

  return (
    <div>
      {ganador && (
        <div style={{
          ...cardStyle, textAlign: 'center', background: C.burgundy, color: C.cream, border: 'none', marginBottom: 16,
        }}>
          <div style={{ fontSize: 46 }}>🏍️🎉</div>
          <p style={{ margin: '4px 0', fontSize: 14, opacity: 0.85 }}>Ganador de <b>{ganador.premio}</b></p>
          <div style={{ fontSize: 30, fontWeight: 800, color: '#fff' }}>{ganador.ganador.nombre || 'Sin nombre'}</div>
          <div style={{ fontSize: 15, opacity: 0.9, marginTop: 2 }}>Cédula {ganador.ganador.cedula} · {ganador.ganador.acciones} acciones</div>
          <div style={{ fontSize: 12, opacity: 0.7, marginTop: 8 }}>
            Entre {ganador.total_elegibles} elegibles · {ganador.total_acciones} acciones en tómbola
          </div>
        </div>
      )}

      <div style={{ ...cardStyle, maxWidth: 560 }}>
        {msg && <Banner tipo={msg.tipo}>{msg.txt}</Banner>}
        <p style={{ fontSize: 13, color: C.sec, margin: '0 0 12px' }}>
          Elige un ganador al azar, ponderado por acciones. Los que ya ganaron quedan excluidos.
        </p>
        <Field label="Premio que se sortea">
          <input value={f.premio} onChange={set('premio')} placeholder="Ej: Moto Nº1 (Honda 125)" style={inputStyle} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Ronda (opcional)">
            <input type="number" value={f.ronda} onChange={set('ronda')} placeholder="Ej: 1" style={inputStyle} />
          </Field>
          <Field label="Semilla verificable (opcional)">
            <input value={f.seed} onChange={set('seed')} placeholder="Ej: lotería 8842" style={inputStyle} />
          </Field>
        </div>
        <Field label="Nota (opcional)">
          <input value={f.nota} onChange={set('nota')} placeholder="Observación interna" style={inputStyle} />
        </Field>
        <p style={{ fontSize: 11.5, color: C.muted, margin: '2px 0 12px' }}>
          Semilla: si la dejás vacía, el azar es aleatorio. Si ponés un valor público (ej. el número de la Lotería del día),
          el resultado es reproducible y auditable.
        </p>
        <button onClick={sortear} disabled={busy} style={{
          width: '100%', padding: 14, borderRadius: 10, border: 'none',
          background: busy ? '#f0a878' : C.orange, color: '#fff', fontWeight: 800, fontSize: 16, cursor: busy ? 'wait' : 'pointer',
        }}>{busy ? 'Sorteando…' : '🎰 Sortear ganador'}</button>
      </div>

      <div style={{ ...cardStyle, marginTop: 16 }}>
        <h3 style={{ margin: '0 0 10px', fontSize: 15, color: C.burgundy, fontWeight: 700 }}>Ganadores</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={tableStyle}>
            <thead><tr><Th>Fecha</Th><Th>Premio</Th><Th>Ganador</Th><Th>Cédula</Th><Th>Semilla</Th><Th></Th></tr></thead>
            <tbody>
              {ganadores.map((g) => (
                <tr key={g.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <Td>{fmtFecha(g.fecha)}</Td>
                  <Td>{g.premio}{g.ronda ? ` (#${g.ronda})` : ''}</Td>
                  <Td>{g.nombre || '—'}</Td>
                  <Td mono>{g.cedula}</Td>
                  <Td>{g.seed ? <span style={{ fontSize: 12, color: C.muted }}>{g.seed}</span> : <span style={{ color: C.muted }}>—</span>}</Td>
                  <Td right><button onClick={() => deshacer(g.id)} style={miniBtn}>Deshacer</button></Td>
                </tr>
              ))}
              {ganadores.length === 0 && <tr><Td colSpan={6}><span style={{ color: C.muted }}>Todavía no hay ganadores.</span></Td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Patrocinadores ────────────────────────────────────────────────────────────
function Patrocinadores({ lista, onChange }) {
  const [busy, setBusy] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [msg, setMsg] = useState(null);

  async function patch(id, body) {
    setBusy(id); setMsg(null);
    try {
      const r = await fetch('/api/rifa-admin/patrocinadores', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      setMsg({ tipo: 'ok', txt: 'Guardado.' });
      await onChange();
    } catch (e) { setMsg({ tipo: 'error', txt: e.message }); }
    finally { setBusy(null); }
  }

  return (
    <div style={cardStyle}>
      {msg && <Banner tipo={msg.tipo}>{msg.txt}</Banner>}
      <p style={{ fontSize: 13, color: C.sec, margin: '0 0 12px' }}>
        El <b>logo</b> se sube a <code style={{ background: '#f3eeee', padding: '1px 5px', borderRadius: 4 }}>/public/rifa/logos/</code> y acá se pega la ruta (ej. <code style={{ background: '#f3eeee', padding: '1px 5px', borderRadius: 4 }}>/rifa/logos/arsa.png</code>). El orden y el tier controlan el carrusel del landing.
      </p>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead><tr><Th>Orden</Th><Th>Nombre</Th><Th>Tier</Th><Th right>Aporte</Th><Th>Logo (ruta)</Th><Th>Activo</Th></tr></thead>
          <tbody>
            {lista.map((p) => {
              const dLogo = drafts[`logo-${p.id}`];
              const logoVal = dLogo !== undefined ? dLogo : (p.logo_url || '');
              const logoCambiado = dLogo !== undefined && dLogo !== (p.logo_url || '');
              return (
                <tr key={p.id} style={{ borderTop: `1px solid ${C.border}` }}>
                  <Td>{p.orden}</Td>
                  <Td><b>{p.nombre}</b>{p.detecta_credix && <span style={{ fontSize: 11, color: C.teal }}> · Credix</span>}</Td>
                  <Td>{p.tier}</Td>
                  <Td right>{money(p.aporte_colones)}</Td>
                  <Td>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input value={logoVal} onChange={(e) => setDrafts((s) => ({ ...s, [`logo-${p.id}`]: e.target.value }))}
                        placeholder="/rifa/logos/…" style={{ ...inputStyle, width: 190, padding: '6px 8px', marginTop: 0 }} />
                      {logoCambiado && <button disabled={busy === p.id} onClick={() => patch(p.id, { logo_url: logoVal })} style={miniBtnOrange}>Guardar</button>}
                    </div>
                  </Td>
                  <Td>
                    <button disabled={busy === p.id} onClick={() => patch(p.id, { activo: !p.activo })} style={{
                      ...miniBtn, background: p.activo ? C.green : '#eee', color: p.activo ? '#fff' : C.sec, borderColor: p.activo ? C.green : C.border,
                    }}>{p.activo ? 'Activo' : 'Inactivo'}</button>
                  </Td>
                </tr>
              );
            })}
            {lista.length === 0 && <tr><Td colSpan={6}><span style={{ color: C.muted }}>Sin patrocinadores.</span></Td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Configuración ─────────────────────────────────────────────────────────────
const LABELS = {
  colones_por_accion: 'Colones por acción',
  bono_patrocinador_mult: 'Multiplicador patrocinador (×)',
  bono_web_mult: 'Multiplicador web (×)',
  vendedor_web: 'Vendedor web (nombre en NEO)',
  fecha_corte: 'Fecha de corte (ISO, vacío = sin corte)',
  activa: 'Rifa activa (true/false)',
  digitos_factura: 'Dígitos de factura para el match',
  tolerancia_monto_pct: 'Tolerancia de monto (%)',
};
const ORDEN_CFG = ['activa', 'colones_por_accion', 'bono_patrocinador_mult', 'bono_web_mult', 'vendedor_web', 'fecha_corte', 'digitos_factura', 'tolerancia_monto_pct'];

function Config({ rows, onChange }) {
  const [drafts, setDrafts] = useState({});
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const byKey = {}; rows.forEach((r) => { byKey[r.clave] = r; });

  async function guardar(clave, valor) {
    setBusy(clave); setMsg(null);
    try {
      const r = await fetch('/api/rifa-admin/config', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave, valor }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Error');
      setMsg({ tipo: 'ok', txt: 'Guardado.' });
      await onChange();
    } catch (e) { setMsg({ tipo: 'error', txt: e.message }); }
    finally { setBusy(null); }
  }

  return (
    <div style={{ ...cardStyle, maxWidth: 640 }}>
      {msg && <Banner tipo={msg.tipo}>{msg.txt}</Banner>}
      <p style={{ fontSize: 13, color: C.sec, margin: '0 0 14px' }}>
        Perillas de la rifa. Los cambios aplican a las facturas que se registren de ahora en adelante.
      </p>
      {ORDEN_CFG.filter((k) => byKey[k]).map((clave) => {
        const row = byKey[clave];
        const d = drafts[clave];
        const val = d !== undefined ? d : (row.valor ?? '');
        const cambiado = d !== undefined && d !== (row.valor ?? '');
        return (
          <div key={clave} style={{ marginBottom: 12 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.burgundy, marginBottom: 4 }}>{LABELS[clave] || clave}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={val} onChange={(e) => setDrafts((s) => ({ ...s, [clave]: e.target.value }))} style={{ ...inputStyle, marginTop: 0 }} />
              <button disabled={busy === clave || !cambiado} onClick={() => guardar(clave, val)} style={{
                ...miniBtnOrange, opacity: cambiado ? 1 : 0.4, padding: '0 16px', whiteSpace: 'nowrap',
              }}>Guardar</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Piezas UI ─────────────────────────────────────────────────────────────────
const cardStyle = { background: C.card, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, boxShadow: C.shadow };
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 };
const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 14, border: `1.5px solid ${C.border}`, borderRadius: 10, outline: 'none', marginTop: 4 };
const miniBtn = { fontSize: 12, fontWeight: 600, padding: '5px 10px', borderRadius: 7, border: `1px solid ${C.border}`, background: '#fff', color: C.sec, cursor: 'pointer' };
const miniBtnOrange = { ...miniBtn, background: C.orange, color: '#fff', borderColor: C.orange };

function Chip({ children, color }) {
  return <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: color, borderRadius: 6, padding: '2px 6px' }}>{children}</span>;
}
function Th({ children, right }) {
  return <th style={{ textAlign: right ? 'right' : 'left', padding: '8px 10px', fontSize: 12, color: C.muted, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 }}>{children}</th>;
}
function Td({ children, right, mono, colSpan }) {
  return <td colSpan={colSpan} style={{ textAlign: right ? 'right' : 'left', padding: '9px 10px', fontFamily: mono ? 'ui-monospace, monospace' : 'inherit' }}>{children}</td>;
}
function Field({ label, children }) {
  return (<div style={{ marginBottom: 12 }}><label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.burgundy, marginBottom: 2 }}>{label}</label>{children}</div>);
}
function Banner({ tipo, children }) {
  const ok = tipo === 'ok';
  return (<div style={{ padding: '10px 12px', borderRadius: 10, marginBottom: 12, fontSize: 13.5, fontWeight: 500, background: ok ? '#e7f4ec' : '#fdecec', color: ok ? C.green : '#b03a3a', border: `1px solid ${ok ? '#bfe3cd' : '#f5c6c6'}` }}>{children}</div>);
}
function Centro({ children }) {
  return <div style={{ padding: 60, textAlign: 'center', color: C.sec, fontSize: 15 }}>{children}</div>;
}
