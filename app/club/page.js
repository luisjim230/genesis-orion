'use client';

// ────────────────────────────────────────────────────────────────────────────
// Club del Enchapador — página PÚBLICA (sin login).
// Se sirve en /club (todos los dominios) y en la raíz del subdominio
// club.depositojimenez.com (rewrite en el middleware). El middleware la excluye
// del guard de sesión de SOL, así que un visitante sin cuenta la ve completa.
// Consume únicamente las dos RPC públicas con la anon key:
//   - club_consultar_puntos(p_cedula)
//   - club_registrar_factura(p_cedula, p_nombre, p_telefono, p_ult_factura, p_monto)
// ────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
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
  grayBg: '#efe9e9',
  border: '#EAD9DB',
};

// Catálogo de premios (hardcodeado por ahora; luego se mueve a base).
// `foto`: ruta a una imagen real en /public/club/premios/. Si es null (o la
// imagen falla), la tarjeta muestra el emoji como respaldo. Para poner la foto
// real de un producto, dejá un archivo con ese nombre en esa carpeta.
const PREMIOS = [
  { emoji: '🧤', nombre: 'Kit guantes + crucetas + esponjas', puntos: 10, foto: null },
  { emoji: '🦵', nombre: 'Rodilleras profesionales', puntos: 25, foto: null },
  { emoji: '🔧', nombre: 'Kit sistema de nivelación (clips + cuñas + pinza)', puntos: 40, foto: null },
  { emoji: '📏', nombre: 'Juego de llanetas 6/10/12 mm', puntos: 50, foto: '/club/premios/llanetas.jpg' },
  { emoji: '📐', nombre: 'Nivel láser autonivelante', puntos: 120, foto: '/club/premios/laser.jpg' },
  { emoji: '🪚', nombre: 'Cortadora manual profesional 1.2 m', puntos: 180, foto: null },
  { emoji: '⚡', nombre: 'Cortadora eléctrica de banco con agua', puntos: 300, foto: '/club/premios/cortadora-electrica.jpg' },
];

const fontDisplay = "var(--font-bungee), system-ui, sans-serif";
const fontBody = "var(--font-rubik), system-ui, sans-serif";

export default function ClubPage() {
  const [tab, setTab] = useState('puntos');

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

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: 6,
          background: '#fff',
          padding: 6,
          borderRadius: 16,
          border: `1px solid ${C.border}`,
          boxShadow: '0 4px 18px rgba(94,39,51,0.08)',
          margin: '18px 0',
          position: 'sticky',
          top: 8,
          zIndex: 5,
        }}>
          <TabBtn active={tab === 'puntos'} onClick={() => setTab('puntos')}>Mis puntos</TabBtn>
          <TabBtn active={tab === 'factura'} onClick={() => setTab('factura')}>Registrar factura</TabBtn>
        </div>

        {tab === 'puntos' ? <ConsultaTab /> : <RegistrarTab />}

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
        <span>🧱</span> Depósito Jiménez × Impersa
      </div>
      <h1 style={{
        fontFamily: fontDisplay,
        fontSize: 34, lineHeight: 1.05, margin: '16px 0 6px',
        color: C.burgundy, textTransform: 'uppercase',
      }}>
        Club del<br /><span style={{ color: C.orange }}>Enchapador</span>
      </h1>
      <p style={{ margin: 0, color: C.muted, fontSize: 15 }}>
        Sumá puntos por cada saco de mortero Impersa y canjealos por herramientas.
      </p>
    </div>
  );
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, border: 'none', cursor: 'pointer',
      padding: '11px 8px', borderRadius: 11, fontSize: 14, fontWeight: 600,
      fontFamily: fontBody,
      background: active ? C.orange : 'transparent',
      color: active ? '#fff' : C.muted,
      transition: 'all .15s ease',
    }}>
      {children}
    </button>
  );
}

// ── Pestaña: Mis puntos ──────────────────────────────────────────────────────
function ConsultaTab() {
  const [cedula, setCedula] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [res, setRes] = useState(null); // { encontrado, nombre, puntos } | { encontrado:false }

  async function consultar(e) {
    e?.preventDefault();
    const ced = cedula.trim();
    if (!ced) { setError('Escribí tu cédula.'); return; }
    setLoading(true); setError(null); setRes(null);
    try {
      const { data, error } = await supabase.rpc('club_consultar_puntos', { p_cedula: ced });
      if (error) throw error;
      setRes(data);
    } catch (err) {
      setError('No pudimos consultar. Probá de nuevo en un momento.');
    } finally {
      setLoading(false);
    }
  }

  const puntos = res?.encontrado ? Number(res.puntos) || 0 : 0;

  return (
    <div>
      <Card>
        <form onSubmit={consultar}>
          <Label>Cédula</Label>
          <Input
            value={cedula}
            onChange={(e) => setCedula(e.target.value)}
            placeholder="Ej: 1-2345-6789"
            inputMode="numeric"
          />
          <Boton loading={loading} type="submit">Ver mis puntos</Boton>
        </form>
        {error && <ErrorMsg>{error}</ErrorMsg>}
      </Card>

      {res && !res.encontrado && (
        <Card>
          <div style={{ textAlign: 'center', padding: '6px 0' }}>
            <div style={{ fontSize: 40 }}>🔍</div>
            <p style={{ fontWeight: 600, margin: '8px 0 4px', color: C.burgundy }}>
              No encontramos esa cédula
            </p>
            <p style={{ margin: 0, color: C.muted, fontSize: 14 }}>
              Registrá tu primera compra en la pestaña <b>Registrar factura</b> y empezá a sumar.
            </p>
          </div>
        </Card>
      )}

      {res?.encontrado && (
        <SaldoCard nombre={res.nombre} puntos={puntos} />
      )}

      <CatalogoPremios saldo={res?.encontrado ? puntos : null} />
    </div>
  );
}

function SaldoCard({ nombre, puntos }) {
  // Próximo premio para la barra de progreso.
  const siguiente = PREMIOS.find((p) => p.puntos > puntos);
  const anterior = [...PREMIOS].reverse().find((p) => p.puntos <= puntos);
  const base = anterior ? anterior.puntos : 0;
  const meta = siguiente ? siguiente.puntos : puntos;
  const pct = siguiente ? Math.max(4, Math.min(100, ((puntos - base) / (meta - base)) * 100)) : 100;

  return (
    <Card style={{ background: C.burgundy, color: C.cream, border: 'none' }}>
      <p style={{ margin: 0, fontSize: 14, opacity: 0.85 }}>¡Hola, {nombre || 'enchapador'}! 👋</p>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0 2px' }}>
        <span style={{ fontFamily: fontDisplay, fontSize: 52, lineHeight: 1, color: '#fff' }}>{puntos}</span>
        <span style={{ fontSize: 16, opacity: 0.85 }}>puntos</span>
      </div>

      {siguiente ? (
        <>
          <div style={{ height: 12, background: 'rgba(255,255,255,0.18)', borderRadius: 999, overflow: 'hidden', marginTop: 14 }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: `linear-gradient(90deg, ${C.orange}, #ffb27a)`,
              borderRadius: 999, transition: 'width .5s ease',
            }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
            <PremioFoto premio={siguiente} alcanzado={false} size={56} />
            <p style={{ margin: 0, fontSize: 13.5, opacity: 0.95 }}>
              Te faltan <b style={{ color: '#ffd0ac' }}>{siguiente.puntos - puntos}</b> puntos para{' '}
              <b>{siguiente.nombre}</b>
            </p>
          </div>
        </>
      ) : (
        <p style={{ margin: '14px 0 0', fontSize: 14, opacity: 0.92 }}>
          🏆 ¡Alcanzaste el premio máximo! Pasá por el depósito a canjear.
        </p>
      )}
    </Card>
  );
}

// Foto del premio con respaldo al emoji (si no hay foto o si la imagen falla).
function PremioFoto({ premio, alcanzado, size = 72 }) {
  const [err, setErr] = useState(false);
  const mostrarFoto = premio.foto && !err;
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      borderRadius: 12, overflow: 'hidden',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: alcanzado ? '#dcefe3' : '#f7eef0',
      border: `1px solid ${alcanzado ? '#bfe3cd' : C.border}`,
    }}>
      {mostrarFoto ? (
        <img
          src={premio.foto}
          alt={premio.nombre}
          onError={() => setErr(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span style={{ fontSize: size * 0.42 }}>{premio.emoji}</span>
      )}
    </div>
  );
}

function CatalogoPremios({ saldo }) {
  return (
    <Card>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, color: C.burgundy, fontWeight: 700 }}>Catálogo de premios</h3>
      <p style={{ margin: '0 0 14px', fontSize: 13, color: C.muted }}>
        {saldo === null ? 'Consultá tu cédula para ver cuáles ya alcanzaste.' : 'En verde, los que ya podés canjear.'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {PREMIOS.map((p) => {
          const alcanzado = saldo !== null && saldo >= p.puntos;
          return (
            <div key={p.nombre} style={{
              display: 'flex', alignItems: 'center', gap: 12,
              padding: 10, borderRadius: 14,
              background: alcanzado ? C.greenBg : '#fff',
              border: `1px solid ${alcanzado ? '#bfe3cd' : C.border}`,
            }}>
              <PremioFoto premio={p} alcanzado={alcanzado} size={72} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: C.ink, lineHeight: 1.25 }}>{p.nombre}</div>
                <div style={{ fontSize: 12.5, color: alcanzado ? C.green : C.muted, fontWeight: 600, marginTop: 2 }}>
                  {p.puntos} puntos {alcanzado ? '· ¡ya lo tenés! ✅' : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ── Pestaña: Registrar factura ───────────────────────────────────────────────
function RegistrarTab() {
  const [f, setF] = useState({ cedula: '', nombre: '', telefono: '', factura: '', monto: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ok, setOk] = useState(null); // { puntos_ganados, saldo, detalle }

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  async function registrar(e) {
    e.preventDefault();
    setError(null); setOk(null);
    if (!f.cedula.trim()) { setError('La cédula es obligatoria.'); return; }
    if (!f.factura.trim()) { setError('Escribí los últimos 5 dígitos de la factura.'); return; }
    if (!f.monto || Number(f.monto) <= 0) { setError('Escribí el monto de la factura.'); return; }

    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('club_registrar_factura', {
        p_cedula: f.cedula.trim(),
        p_nombre: f.nombre.trim(),
        p_telefono: f.telefono.trim(),
        p_ult_factura: f.factura.trim(),
        p_monto: Number(f.monto),
      });
      if (error) throw error;
      if (data?.ok) {
        setOk(data);
      } else {
        setError(data?.error || 'No pudimos registrar la factura.');
        if (data?.detalle) setOk({ soloDetalle: true, detalle: data.detalle });
      }
    } catch (err) {
      setError('No pudimos registrar. Revisá los datos y probá de nuevo.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <Card>
        <form onSubmit={registrar}>
          <div style={{
            background: C.cream, border: `1.5px solid ${C.orange}`,
            borderRadius: 12, padding: 12, marginBottom: 14,
          }}>
            <Label style={{ color: C.orange }}>Cédula</Label>
            <Input value={f.cedula} onChange={set('cedula')} placeholder="1-2345-6789" inputMode="numeric" />
            <p style={{ margin: '6px 0 0', fontSize: 12, color: C.muted }}>
              Los puntos se acreditan a esta cédula.
            </p>
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

          <Boton loading={loading} type="submit" style={{ marginTop: 16 }}>Sumar mis puntos</Boton>
        </form>
        {error && <ErrorMsg>{error}</ErrorMsg>}
      </Card>

      {ok && !ok.soloDetalle && (
        <Card style={{ borderColor: '#bfe3cd', background: C.greenBg }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40 }}>🎉</div>
            <p style={{ margin: '6px 0 2px', fontWeight: 700, color: C.green, fontSize: 18 }}>
              ¡Sumaste {ok.puntos_ganados} {ok.puntos_ganados === 1 ? 'punto' : 'puntos'}!
            </p>
            <p style={{ margin: 0, color: C.ink, fontSize: 14 }}>
              Tu nuevo saldo es <b>{ok.saldo}</b> puntos.
            </p>
          </div>
          <Desglose detalle={ok.detalle} />
        </Card>
      )}

      {ok?.soloDetalle && (
        <Card>
          <p style={{ margin: '0 0 8px', fontWeight: 600, color: C.burgundy, fontSize: 14 }}>
            Detalle de la factura
          </p>
          <Desglose detalle={ok.detalle} />
        </Card>
      )}
    </div>
  );
}

function Desglose({ detalle }) {
  if (!Array.isArray(detalle) || detalle.length === 0) return null;
  return (
    <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
      {detalle.map((d, i) => {
        const suma = !!d.suma;
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '8px 10px', borderRadius: 10,
            background: suma ? '#fff' : C.grayBg,
            border: `1px solid ${suma ? '#bfe3cd' : 'transparent'}`,
          }}>
            <span style={{ fontSize: 16 }}>{suma ? '✅' : '➖'}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: suma ? C.ink : C.muted, lineHeight: 1.2 }}>
                {d.producto || 'Producto'}
              </div>
              <div style={{ fontSize: 12, color: C.muted }}>
                Cantidad: {d.cantidad ?? 0}
              </div>
            </div>
            <span style={{
              fontSize: 13, fontWeight: 700,
              color: suma ? C.green : C.muted,
            }}>
              {suma ? `+${d.puntos ?? 0}` : '—'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Piezas UI ────────────────────────────────────────────────────────────────
function Card({ children, style }) {
  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${C.border}`,
      borderRadius: 18,
      padding: 18,
      boxShadow: '0 4px 18px rgba(94,39,51,0.06)',
      marginBottom: 14,
      ...style,
    }}>
      {children}
    </div>
  );
}

function Label({ children, style }) {
  return (
    <label style={{
      display: 'block', fontSize: 13, fontWeight: 600,
      color: C.burgundy, marginBottom: 6, ...style,
    }}>
      {children}
    </label>
  );
}

function Solo() {
  return (
    <span style={{ fontWeight: 500, color: C.muted, fontSize: 11 }}>(solo la primera vez)</span>
  );
}

function Input(props) {
  return (
    <input
      {...props}
      style={{
        width: '100%', boxSizing: 'border-box',
        padding: '12px 14px', fontSize: 16,
        border: `1.5px solid ${C.border}`, borderRadius: 12,
        outline: 'none', fontFamily: fontBody, color: C.ink,
        background: '#fff',
      }}
      onFocus={(e) => { e.target.style.borderColor = C.orange; }}
      onBlur={(e) => { e.target.style.borderColor = C.border; }}
    />
  );
}

function Boton({ children, loading, style, ...props }) {
  return (
    <button
      {...props}
      disabled={loading || props.disabled}
      style={{
        width: '100%', marginTop: 14,
        padding: '14px', fontSize: 16, fontWeight: 700,
        fontFamily: fontBody, color: '#fff', border: 'none',
        borderRadius: 12, cursor: loading ? 'wait' : 'pointer',
        background: loading ? '#f0a878' : C.orange,
        boxShadow: '0 6px 16px rgba(237,110,46,0.32)',
        transition: 'background .15s ease',
        ...style,
      }}
    >
      {loading ? 'Cargando…' : children}
    </button>
  );
}

function ErrorMsg({ children }) {
  return (
    <div style={{
      marginTop: 12, padding: '10px 12px', borderRadius: 10,
      background: '#fdecec', border: '1px solid #f5c6c6',
      color: '#b03a3a', fontSize: 13.5, fontWeight: 500,
    }}>
      {children}
    </div>
  );
}

function Footer() {
  return (
    <div style={{
      textAlign: 'center', marginTop: 26, paddingTop: 18,
      borderTop: `1px solid ${C.border}`,
      color: C.muted, fontSize: 12.5, lineHeight: 1.6,
    }}>
      <b style={{ color: C.burgundy }}>Depósito Jiménez</b> · Ipís, Goicoechea<br />
      WhatsApp 2294-1212<br />
      <span style={{ opacity: 0.85 }}>Programa en alianza con Impersa</span>
    </div>
  );
}
