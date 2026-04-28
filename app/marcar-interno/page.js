'use client';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'dj_internal_traffic';
const CLIENT_ID_KEY = 'dj_ga_client_id';

function genClientId() {
  // GA4 client_id formato: NNNNNNNNNN.NNNNNNNNNN
  const a = Math.floor(Math.random() * 1e10);
  const b = Math.floor(Date.now() / 1000);
  return `${a}.${b}`;
}

function persistFlag() {
  try {
    localStorage.setItem(STORAGE_KEY, 'true');
    // Cookie opcional con expiración a 2 años (sirve también para Nidux si comparte dominio).
    const exp = new Date();
    exp.setFullYear(exp.getFullYear() + 2);
    document.cookie = `${STORAGE_KEY}=true; expires=${exp.toUTCString()}; path=/; SameSite=Lax`;
  } catch { /* ignore */ }
}

function getOrCreateClientId() {
  try {
    let cid = localStorage.getItem(CLIENT_ID_KEY);
    if (!cid) {
      cid = genClientId();
      localStorage.setItem(CLIENT_ID_KEY, cid);
    }
    return cid;
  } catch {
    return genClientId();
  }
}

export default function MarcarInterno() {
  const [deviceLabel, setDeviceLabel] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState(null);
  const [alreadyMarked, setAlreadyMarked] = useState(false);

  useEffect(() => {
    try { setAlreadyMarked(localStorage.getItem(STORAGE_KEY) === 'true'); } catch {}
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const client_id = getOrCreateClientId();
      // 1) Avisar a GA4 vía Measurement Protocol (server-side).
      const r = await fetch('/api/metricas-web/mark-internal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id,
          device_label: deviceLabel.trim(),
          marked_by: name.trim(),
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(j?.error || 'Error contactando a GA4');
      }
      // 2) Persistir el flag local.
      persistFlag();
      // 3) Registrar el dispositivo en Supabase (best effort).
      await fetch('/api/metricas-web/internal-devices', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          device_label: deviceLabel.trim(),
          marked_by: name.trim(),
          client_id,
        }),
      }).catch(() => {});
      setDone(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  function abrirSitio() {
    window.location.href = 'https://depositojimenezcr.com/?traffic_type=internal';
  }

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex: 9999,
      background: 'linear-gradient(135deg, #5E2733 0%, #3a1820 100%)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
      fontFamily: 'system-ui, -apple-system, sans-serif',
      overflow: 'auto',
    }}>
      <div style={{
        background: '#fff',
        borderRadius: 20,
        padding: '36px 32px',
        maxWidth: 460,
        width: '100%',
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <svg width={64} height={54} viewBox="0 0 56 48" style={{ margin: '0 auto', display: 'block' }}>
            <rect x="0"  y="0"  width="16" height="9" rx="2" fill="#5E2733"/>
            <rect x="20" y="0"  width="24" height="9" rx="2" fill="#c8a84b"/>
            <rect x="0"  y="13" width="24" height="9" rx="2" fill="#c8a84b"/>
            <rect x="28" y="13" width="16" height="9" rx="2" fill="#c8a84b"/>
            <rect x="0"  y="26" width="10" height="9" rx="2" fill="#c8a84b"/>
            <rect x="14" y="26" width="30" height="9" rx="2" fill="#c8a84b"/>
          </svg>
          <div style={{ fontSize: 11, color: '#888', letterSpacing: '0.15em', marginTop: 8, fontWeight: 700 }}>DEPÓSITO JIMÉNEZ</div>
        </div>

        {done ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 56, marginBottom: 12 }}>✅</div>
            <h1 style={{ fontSize: '1.4rem', color: '#2e7d4f', margin: 0, fontWeight: 700 }}>Listo</h1>
            <p style={{ color: '#444', marginTop: 12, lineHeight: 1.5, fontSize: '0.95rem' }}>
              Este dispositivo ya está marcado como interno. Tus visitas al sitio no se van a contar como tráfico de cliente.
            </p>
            <p style={{ color: '#666', marginTop: 8, fontSize: '0.85rem' }}>
              Si en algún momento limpiás los datos del navegador o usás modo incógnito, vas a tener que volver a marcarlo.
            </p>
            <button onClick={abrirSitio} style={{
              marginTop: 20,
              background: 'linear-gradient(135deg, #c8a84b, #a08930)',
              color: '#fff',
              border: 'none',
              padding: '14px 24px',
              borderRadius: 12,
              fontSize: '1rem',
              fontWeight: 700,
              cursor: 'pointer',
              width: '100%',
            }}>
              Ir al sitio →
            </button>
          </div>
        ) : (
          <>
            <h1 style={{ fontSize: '1.35rem', color: '#5E2733', margin: 0, fontWeight: 700, textAlign: 'center', lineHeight: 1.3 }}>
              Marcar este dispositivo como interno
            </h1>
            <p style={{ color: '#555', marginTop: 14, fontSize: '0.92rem', lineHeight: 1.5 }}>
              Este paso es <strong>solo para empleados de Depósito Jiménez</strong>. Marca este navegador para que el sistema sepa
              que tu actividad es interna y no la confunda con la de los clientes.
            </p>
            {alreadyMarked && (
              <div style={{ background: '#fff8e1', border: '1px solid #f0d978', color: '#7a5d10', padding: '10px 14px', borderRadius: 10, fontSize: '0.85rem', marginTop: 12 }}>
                ⚠️ Este navegador ya estaba marcado. Si lo volvés a marcar, no pasa nada — solo se registra otra vez.
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ marginTop: 20 }}>
              <label style={{ display: 'block', marginBottom: 14 }}>
                <div style={{ fontSize: '0.85rem', color: '#444', marginBottom: 6, fontWeight: 600 }}>¿Qué dispositivo es?</div>
                <input
                  required
                  value={deviceLabel}
                  onChange={e => setDeviceLabel(e.target.value)}
                  placeholder="Ej: Compu de oficina de María"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid #ddd',
                    borderRadius: 10,
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </label>

              <label style={{ display: 'block', marginBottom: 18 }}>
                <div style={{ fontSize: '0.85rem', color: '#444', marginBottom: 6, fontWeight: 600 }}>¿Tu nombre?</div>
                <input
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Ej: María González"
                  style={{
                    width: '100%',
                    padding: '12px 14px',
                    border: '1px solid #ddd',
                    borderRadius: 10,
                    fontSize: '1rem',
                    boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
              </label>

              {error && (
                <div style={{ background: '#ffebee', border: '1px solid #ef9a9a', color: '#c62828', padding: '10px 14px', borderRadius: 10, fontSize: '0.85rem', marginBottom: 14 }}>
                  ⚠️ {error}
                </div>
              )}

              <button type="submit" disabled={submitting} style={{
                width: '100%',
                background: 'linear-gradient(135deg, #5E2733, #3a1820)',
                color: '#fff',
                border: 'none',
                padding: '14px 24px',
                borderRadius: 12,
                fontSize: '1rem',
                fontWeight: 700,
                cursor: submitting ? 'wait' : 'pointer',
                opacity: submitting ? 0.7 : 1,
                fontFamily: 'inherit',
              }}>
                {submitting ? '⏳ Marcando...' : 'Marcar este navegador como interno'}
              </button>
            </form>

            <p style={{ color: '#888', marginTop: 18, fontSize: '0.78rem', lineHeight: 1.4, textAlign: 'center' }}>
              No vas a notar ningún cambio en tu navegación. El marcado dura hasta 2 años en este navegador.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
