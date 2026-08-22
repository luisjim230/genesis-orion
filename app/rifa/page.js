'use client';

// ────────────────────────────────────────────────────────────────────────────
// Gran Rifa de Motos — página PÚBLICA (sin login).
// Se sirve en /rifa (todos los dominios). El middleware la excluye del guard de
// sesión de SOL y la marca como pública (x-club-public) para renderizarla sin el
// chrome de SOL. Consume solo RPC públicas con la anon key:
//   - rifa_consultar_acciones(p_cedula)
//   - rifa_registrar_factura(p_cedula, p_nombre, p_telefono, p_ult_factura, p_monto)
//   - rifa_patrocinadores_publicos()
// ────────────────────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const C = {
  orange: '#ED6E2E',
  burgundy: '#5E2733',
  teal: '#225F74',
  cream: '#FDF4F4',
  creamDark: '#F5EAEA',
  ink: '#3a2429',
  muted: '#8a6f74',
  green: '#2e8b57',
  greenBg: '#e7f4ec',
  gold: '#C9962E',
  border: '#EAD9DB',
};

const COLONES_POR_ACCION = 25000; // informativo (la fuente real es rifa_config)

const fontDisplay = "var(--font-bungee), system-ui, sans-serif";
const fontBody = "var(--font-rubik), system-ui, sans-serif";
const money = (n) => '₡' + (Number(n) || 0).toLocaleString('es-CR');

export default function RifaPage() {
  const [tab, setTab] = useState('acciones');

  return (
    <div style={{
      minHeight: '100vh',
      background: `radial-gradient(1200px 600px at 50% -10%, ${C.creamDark} 0%, ${C.cream} 45%)`,
      fontFamily: fontBody,
      color: C.ink,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      padding: '0 16px 40px',
    }}>
      <div style={{ width: '100%', maxWidth: 460 }}>
        <Header />

        <div style={{
          display: 'flex', gap: 6, background: '#fff', padding: 6, borderRadius: 16,
          border: `1px solid ${C.border}`, boxShadow: '0 4px 18px rgba(94,39,51,0.08)',
          margin: '18px 0', position: 'sticky', top: 8, zIndex: 5,
        }}>
          <TabBtn active={tab === 'acciones'} onClick={() => setTab('acciones')}>Mis acciones</TabBtn>
          <TabBtn active={tab === 'factura'} onClick={() => setTab('factura')}>Registrar factura</TabBtn>
        </div>

        {tab === 'acciones' ? <ConsultaTab /> : <RegistrarTab />}

        <ComoFunciona />
        <Patrocinadores />
        <Footer />
      </div>
    </div>
  );
}

function Header() {
  return (
    <div style={{ textAlign: 'center', paddingTop: 32 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        background: C.burgundy, color: C.cream,
        fontSize: 12, letterSpacing: 1, textTransform: 'uppercase',
        padding: '6px 14px', borderRadius: 999, fontWeight: 600,
      }}>
        <span>🏍️</span> Depósito Jiménez
      </div>
      <h1 style={{
        fontFamily: fontDisplay, fontSize: 34, lineHeight: 1.05, margin: '16px 0 6px',
        color: C.burgundy, textTransform: 'uppercase',
      }}>
        Gran Rifa<br /><span style={{ color: C.orange }}>de Motos</span>
      </h1>
      <p style={{ margin: 0, color: C.muted, fontSize: 15 }}>
        Comprá, registrá tu factura y sumá acciones. Cada acción es una oportunidad de ganarte una moto. 🎟️
      </p>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, border: 'none', cursor: 'pointer',
      padding: '11px 8px', borderRadius: 11, fontSize: 14, fontWeight: 600, fontFamily: fontBody,
      background: active ? C.orange : 'transparent', color: active ? '#fff' : C.muted,
      transition: 'all .15s ease',
    }}>
      {children}
    </button>
  );
}

// ── Pestaña: Mis acciones ────────────────────────────────────────────────────
function ConsultaTab() {
  const [cedula, setCedula] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [res, setRes] = useState(null);

  async function consultar(e) {
    e?.preventDefault();
    const ced = cedula.trim();
    if (!ced) { setError('Escribí tu cédula.'); return; }
    setLoading(true); setError(null); setRes(null);
    try {
      const { data, error } = await supabase.rpc('rifa_consultar_acciones', { p_cedula: ced });
      if (error) throw error;
      setRes(data);
    } catch {
      setError('No pudimos consultar. Probá de nuevo en un momento.');
    } finally {
      setLoading(false);
    }
  }

  const acciones = res?.encontrado ? Number(res.acciones) || 0 : 0;
  const pendientes = res ? Number(res.pendientes) || 0 : 0;

  return (
    <div>
      <Card>
        <form onSubmit={consultar}>
          <Label>Cédula</Label>
          <Input value={cedula} onChange={(e) => setCedula(e.target.value)} placeholder="Ej: 1-2345-6789" inputMode="numeric" />
          <Boton loading={loading} type="submit">Ver mis acciones</Boton>
        </form>
        {error && <ErrorMsg>{error}</ErrorMsg>}
      </Card>

      {res && !res.encontrado && pendientes === 0 && (
        <Card>
          <div style={{ textAlign: 'center', padding: '6px 0' }}>
            <div style={{ fontSize: 40 }}>🔍</div>
            <p style={{ fontWeight: 600, margin: '8px 0 4px', color: C.burgundy }}>No encontramos esa cédula</p>
            <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>
              Registrá tu primera compra en la pestaña <b>Registrar factura</b> y empezá a sumar acciones.
            </p>
          </div>
        </Card>
      )}

      {res?.encontrado && <AccionesCard nombre={res.nombre} acciones={acciones} yaGano={res.ya_gano} />}

      {pendientes > 0 && <EnProceso n={pendientes} />}
    </div>
  );
}

function EnProceso({ n }) {
  return (
    <Card style={{ background: '#fff7ee', borderColor: '#f4d3ac' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ fontSize: 28 }}>⏳</span>
        <div>
          <p style={{ margin: 0, fontWeight: 700, color: C.orange, fontSize: 15 }}>
            {n} {n === 1 ? 'factura en proceso' : 'facturas en proceso'}
          </p>
          <p style={{ margin: '2px 0 0', color: C.muted, fontSize: 13 }}>
            Se acreditan solas apenas tu factura entre al sistema (puede tardar hasta ~2 horas). No tenés que hacer nada.
          </p>
        </div>
      </div>
    </Card>
  );
}

function AccionesCard({ nombre, acciones, yaGano }) {
  return (
    <Card style={{ background: C.burgundy, color: C.cream, border: 'none' }}>
      <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>¡Hola, {nombre || 'participante'}! 👋</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0 2px' }}>
        <span style={{ fontFamily: fontDisplay, fontSize: 52, lineHeight: 1, color: '#fff' }}>{acciones}</span>
        <span style={{ fontSize: 16, opacity: 0.85 }}>{acciones === 1 ? 'acción' : 'acciones'} 🎟️</span>
      </div>
      {yaGano ? (
        <div style={{
          marginTop: 14, padding: '10px 12px', borderRadius: 12,
          background: 'rgba(255,255,255,0.15)', fontSize: 14, fontWeight: 600,
        }}>
          🏆 ¡Ya saliste ganador en un sorteo! Pasá por el depósito para coordinar tu premio.
        </div>
      ) : (
        <p style={{ margin: '14px 0 0', fontSize: 13.5, opacity: 0.92 }}>
          Cada acción entra en la tómbola. Cuantas más acciones, más chances. ¡Registrá más facturas para sumar!
        </p>
      )}
    </Card>
  );
}

// ── Pestaña: Registrar factura ───────────────────────────────────────────────
function RegistrarTab() {
  const [f, setF] = useState({ cedula: '', nombre: '', telefono: '', factura: '', monto: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function registrar(e) {
    e.preventDefault();
    setError(null); setOk(null);
    if (!f.cedula.trim()) { setError('La cédula es obligatoria.'); return; }
    if (!f.factura.trim()) { setError('Escribí los últimos 5 dígitos de la factura.'); return; }
    if (!f.monto || Number(f.monto) <= 0) { setError('Escribí el monto de la factura.'); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('rifa_registrar_factura', {
        p_cedula: f.cedula.trim(),
        p_nombre: f.nombre.trim(),
        p_telefono: f.telefono.trim(),
        p_ult_factura: f.factura.trim(),
        p_monto: Number(f.monto),
      });
      if (error) throw error;
      if (data?.ok) setOk(data);
      else setError(data?.error || 'No pudimos registrar la factura.');
    } catch {
      setError('No pudimos registrar. Revisá los datos y probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Card>
        <div style={{
          background: C.cream, border: `1px solid ${C.border}`, borderRadius: 12,
          padding: '10px 12px', marginBottom: 14, fontSize: 12.5, color: C.muted,
        }}>
          ⏱️ Tu factura puede tardar hasta <b>1 hora</b> en aparecer en el sistema. Si no la encontramos, esperá un rato y probá de nuevo.
        </div>
        <form onSubmit={registrar}>
          <div style={{ background: C.cream, border: `1.5px solid ${C.orange}`, borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <Label style={{ color: C.orange }}>Cédula</Label>
            <Input value={f.cedula} onChange={set('cedula')} placeholder="1-2345-6789" inputMode="numeric" />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: C.muted }}>Las acciones se acreditan a esta cédula.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <Label>Nombre <Solo /></Label>
              <Input value={f.nombre} onChange={set('nombre')} placeholder="Tu nombre" />
            </div>
            <div>
              <Label>Teléfono <Solo /></Label>
              <Input value={f.telefono} onChange={set('telefono')} placeholder="8888-8888" inputMode="tel" />
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <Label>Últimos 5 dígitos de la factura</Label>
            <Input value={f.factura} onChange={set('factura')} placeholder="Ej: 04812" inputMode="numeric" maxLength={5} />
          </div>

          <div style={{ marginTop: 12 }}>
            <Label>Monto total de la factura</Label>
            <Input value={f.monto} onChange={set('monto')} placeholder="Ej: 45000" inputMode="decimal" />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: C.muted }}>Un aproximado sirve.</p>
          </div>

          <Boton loading={loading} type="submit" style={{ marginTop: 16 }}>Sumar mis acciones</Boton>
        </form>
        {error && <ErrorMsg>{error}</ErrorMsg>}
      </Card>

      {ok && ok.pendiente && (
        <Card style={{ borderColor: '#f4d3ac', background: '#fff7ee' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>⏳</div>
            <p style={{ margin: '6px 0 4px', fontWeight: 700, color: C.orange, fontSize: 18 }}>
              ¡Recibimos tu factura!
            </p>
            <p style={{ margin: 0, color: C.ink, fontSize: 14, lineHeight: 1.5 }}>
              {ok.mensaje || 'Tus acciones se acreditan solas en un rato. No tenés que hacer nada más.'}
            </p>
          </div>
        </Card>
      )}

      {ok && !ok.pendiente && (
        <Card style={{ borderColor: '#bfe3cd', background: C.greenBg }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>🎉</div>
            <p style={{ margin: '6px 0 2px', fontWeight: 700, color: C.green, fontSize: 20 }}>
              ¡Sumaste {ok.acciones_ganadas} {ok.acciones_ganadas === 1 ? 'acción' : 'acciones'}! 🎟️
            </p>
            <p style={{ margin: 0, color: C.ink, fontSize: 14 }}>
              Tu nuevo total es <b>{ok.saldo}</b> {ok.saldo === 1 ? 'acción' : 'acciones'}.
            </p>
          </div>
          <BonoBadges ok={ok} />
        </Card>
      )}
    </div>
  );
}

function BonoBadges({ ok }) {
  const base = Number(ok.base) || 0;
  const mult = Number(ok.multiplicador) || 1;
  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <Linea icon="🧾" texto={`Base por monto: ${base} ${base === 1 ? 'acción' : 'acciones'}`} />
      {ok.es_web && <Linea icon="🌐" texto="×3 por compra en la web" destacado />}
      {!ok.es_web && ok.patrocinador && <Linea icon="🤝" texto="×2 por producto patrocinador o pago Credix" destacado />}
      {mult === 1 && <Linea icon="✅" texto="Sin bono aplicado en esta factura" />}
    </div>
  );
}

function Linea({ icon, texto, destacado }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10,
      background: destacado ? '#fff' : 'transparent',
      border: `1px solid ${destacado ? '#bfe3cd' : 'transparent'}`,
    }}>
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: destacado ? C.green : C.muted }}>{texto}</span>
    </div>
  );
}

// ── Cómo funciona ────────────────────────────────────────────────────────────
function ComoFunciona() {
  const reglas = [
    { icon: '🎟️', t: '1 acción', d: `por cada ${money(COLONES_POR_ACCION)} de compra` },
    { icon: '🤝', t: '×2 acciones', d: 'si tu factura lleva producto patrocinador o pagás con Credix' },
    { icon: '🌐', t: '×3 acciones', d: 'si comprás por la página web' },
  ];
  return (
    <Card>
      <h3 style={{ margin: '0 0 12px', fontSize: 16, color: C.burgundy, fontWeight: 700 }}>¿Cómo sumo acciones?</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {reglas.map((r) => (
          <div key={r.t} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, flexShrink: 0, borderRadius: 12, background: C.cream,
              border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22,
            }}>{r.icon}</div>
            <div>
              <div style={{ fontSize: 14.5, fontWeight: 700, color: C.orange }}>{r.t}</div>
              <div style={{ fontSize: 13, color: C.muted }}>{r.d}</div>
            </div>
          </div>
        ))}
      </div>
      <p style={{ margin: '12px 0 0', fontSize: 12, color: C.muted }}>
        Los bonos no se suman entre sí: aplica el mayor. El sorteo se hace en vivo y cada ganador sale una sola vez.
      </p>
    </Card>
  );
}

// ── Patrocinadores (carrusel) ────────────────────────────────────────────────
const TIER_COLOR = {
  Diamante: '#7FBFD6', Oro: '#C9962E', Plata: '#9AA3AD', Bronce: '#B07A4B', Colaborador: '#8a6f74',
};

function Patrocinadores() {
  const [lista, setLista] = useState([]);

  useEffect(() => {
    let vivo = true;
    supabase.rpc('rifa_patrocinadores_publicos').then(({ data }) => {
      if (vivo && Array.isArray(data)) setLista(data);
    });
    return () => { vivo = false; };
  }, []);

  if (lista.length === 0) return null;
  const loop = [...lista, ...lista]; // duplicado para scroll continuo

  return (
    <div style={{ marginTop: 8 }}>
      <style>{`
        @keyframes rifaMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .rifa-track { display: flex; width: max-content; animation: rifaMarquee 26s linear infinite; }
        .rifa-track:hover { animation-play-state: paused; }
      `}</style>
      <h3 style={{ textAlign: 'center', margin: '18px 0 4px', fontSize: 15, color: C.burgundy, fontWeight: 700 }}>
        Gracias a nuestros patrocinadores 🙌
      </h3>
      <p style={{ textAlign: 'center', margin: '0 0 12px', fontSize: 12.5, color: C.muted }}>
        Ellos hacen posible esta rifa
      </p>
      <div style={{ overflow: 'hidden', maskImage: 'linear-gradient(90deg, transparent, #000 8%, #000 92%, transparent)' }}>
        <div className="rifa-track">
          {loop.map((p, i) => <LogoChip key={i} p={p} />)}
        </div>
      </div>
    </div>
  );
}

function LogoChip({ p }) {
  const [imgErr, setImgErr] = useState(false);
  const color = TIER_COLOR[p.tier] || C.muted;
  const mostrarLogo = p.logo_url && !imgErr;
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
      minWidth: 118, height: 84, margin: '0 6px', padding: '10px 14px',
      background: '#fff', border: `1px solid ${C.border}`, borderRadius: 14, boxShadow: '0 2px 10px rgba(94,39,51,0.05)',
    }}>
      {mostrarLogo ? (
        <img src={p.logo_url} alt={p.nombre} onError={() => setImgErr(true)} style={{ maxHeight: 44, maxWidth: 100, objectFit: 'contain' }} />
      ) : (
        <span style={{ fontFamily: fontDisplay, fontSize: 15, color: C.burgundy, textAlign: 'center', lineHeight: 1.1 }}>{p.nombre}</span>
      )}
      <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color }}>{p.tier}</span>
    </div>
  );
}

// ── Piezas UI ────────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: '#fff', border: `1px solid ${C.border}`, borderRadius: 18, padding: 18,
      boxShadow: '0 4px 18px rgba(94,39,51,0.06)', marginBottom: 14, ...style,
    }}>{children}</div>
  );
}
function Label({ children, style }) {
  return <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.burgundy, marginBottom: 6, ...style }}>{children}</label>;
}
function Solo() {
  return <span style={{ fontWeight: 500, color: C.muted, fontSize: 11 }}>(solo la primera vez)</span>;
}
function Input(props) {
  return (
    <input {...props} style={{
      width: '100%', boxSizing: 'border-box', padding: '12px 14px', fontSize: 16,
      border: `1.5px solid ${C.border}`, borderRadius: 12, outline: 'none', fontFamily: fontBody, color: C.ink, background: '#fff',
    }}
      onFocus={(e) => { e.target.style.borderColor = C.orange; }}
      onBlur={(e) => { e.target.style.borderColor = C.border; }} />
  );
}
function Boton({ children, loading, style, ...props }) {
  return (
    <button {...props} disabled={loading || props.disabled} style={{
      width: '100%', marginTop: 14, padding: '14px', fontSize: 16, fontWeight: 700, fontFamily: fontBody,
      color: '#fff', border: 'none', borderRadius: 12, cursor: loading ? 'wait' : 'pointer',
      background: loading ? '#f0a878' : C.orange, boxShadow: '0 6px 16px rgba(237,110,46,0.32)', transition: 'background .15s ease', ...style,
    }}>{loading ? 'Cargando…' : children}</button>
  );
}
function ErrorMsg({ children }) {
  return (
    <div style={{
      marginTop: 12, padding: '10px 12px', borderRadius: 10, background: '#fdecec',
      border: '1px solid #f5c6c6', color: '#b03a3a', fontSize: 13.5, fontWeight: 500,
    }}>{children}</div>
  );
}
function Footer() {
  return (
    <div style={{
      textAlign: 'center', marginTop: 26, paddingTop: 18, borderTop: `1px solid ${C.border}`,
      color: C.muted, fontSize: 12.5, lineHeight: 1.6,
    }}>
      <b style={{ color: C.burgundy }}>Depósito Jiménez</b> · Ipís, Goicoechea<br />
      WhatsApp 2294-1212<br />
      <span style={{ opacity: 0.85 }}>Aplican términos y condiciones de la rifa.</span>
    </div>
  );
}
