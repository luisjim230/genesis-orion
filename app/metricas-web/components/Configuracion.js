'use client';
import { useEffect, useState } from 'react';
import { S, GOLD, GREEN, RED, BLUE } from './styles';

function th() { return { textAlign: 'left', padding: '10px 12px', fontSize: '0.78rem', fontWeight: 600, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em' }; }
function td() { return { padding: '10px 12px', color: 'rgba(0,0,0,0.78)', fontSize: '0.86rem' }; }

function fmtDate(s) {
  try { return new Date(s).toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

// Snippet que va en el header del sitio Nidux ANTES del tag de GA4. Estrategia
// dual para máxima robustez:
//   1) gtag('set'): aplica traffic_type=internal a TODOS los eventos siguientes.
//      Funciona si Nidux usa gtag.js (la mayoría de instalaciones GA4 estándar).
//   2) URL parameter: empuja ?traffic_type=internal a la URL. Permite que GA4
//      detecte el flag con una "Internal Traffic Rule" basada en page_location.
// Si el navegador NO está marcado como interno, el snippet no hace nada.
const NIDUX_SNIPPET = `<!-- Detector de tráfico interno Depósito Jiménez (SOL) -->
<script>
(function(){
  try {
    var isInternal = false;
    try {
      isInternal = localStorage.getItem('dj_internal_traffic') === 'true';
      if (!isInternal) {
        isInternal = /(?:^|; )dj_internal_traffic=true/.test(document.cookie);
      }
    } catch(e) {}
    if (!isInternal) return;

    // 1) gtag('set'): aplica el flag a todos los eventos GA4 siguientes.
    window.dataLayer = window.dataLayer || [];
    function gtag(){ dataLayer.push(arguments); }
    gtag('set', 'user_properties', { traffic_type: 'internal' });
    gtag('set', { traffic_type: 'internal' });

    // 2) Backup: forzar ?traffic_type=internal en la URL para que GA4 lo
    //    detecte vía Internal Traffic Rule (Admin > Data Streams > Configure
    //    tag settings > Define internal traffic).
    var url = new URL(window.location.href);
    if (url.searchParams.get('traffic_type') !== 'internal') {
      url.searchParams.set('traffic_type', 'internal');
      history.replaceState(null, '', url.toString());
    }
  } catch(e) {}
})();
</script>`;

export default function Configuracion() {
  const [statusGA4, setStatusGA4] = useState({ loading: true });
  const [campaigns, setCampaigns] = useState([]);
  const [devices, setDevices] = useState([]);
  const [clearing, setClearing] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  async function loadAll() {
    // Status GA4: pegamos al endpoint con un metric_type ligero.
    setStatusGA4({ loading: true });
    try {
      const r = await fetch('/api/metricas-web/ga4?metric_type=summary&date_range=today&traffic_filter=all');
      const j = await r.json();
      setStatusGA4({ loading: false, ok: r.ok, error: r.ok ? null : j?.error, fetched_at: new Date().toISOString() });
    } catch (e) {
      setStatusGA4({ loading: false, ok: false, error: e.message });
    }

    const cR = await fetch('/api/metricas-web/campaigns?include_archived=1').then(r => r.json()).catch(() => ({}));
    setCampaigns(cR?.data || []);

    const dR = await fetch('/api/metricas-web/internal-devices?include_revoked=1').then(r => r.json()).catch(() => ({}));
    setDevices(dR?.data || []);
  }

  useEffect(() => { loadAll(); }, []);

  async function toggleArchive(c) {
    await fetch(`/api/metricas-web/campaigns/${c.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ archived: !c.archived }),
    });
    loadAll();
  }

  async function toggleRevoke(d) {
    await fetch(`/api/metricas-web/internal-devices`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: d.id, revoked: !d.revoked }),
    });
    loadAll();
  }

  async function clearCache() {
    if (!confirm('¿Borrar todo el caché de GA4? Próximas consultas van a ir directo a GA4 (puede ser más lento).')) return;
    setClearing(true);
    try {
      const r = await fetch('/api/metricas-web/cache-clear', { method: 'POST' });
      if (!r.ok) throw new Error((await r.json())?.error || 'error');
      alert('Caché borrado.');
    } catch (e) { alert('Error: ' + e.message); }
    finally { setClearing(false); }
  }

  async function copyMarkLink() {
    const url = `${window.location.origin}/marcar-interno`;
    await navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  }

  async function copySnippet() {
    await navigator.clipboard.writeText(NIDUX_SNIPPET);
    setCopiedSnippet(true);
    setTimeout(() => setCopiedSnippet(false), 1800);
  }

  return (
    <div>
      <div style={S.card}>
        <div style={S.sectionTitle}>🔌 Conexión con Google Analytics 4</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          {statusGA4.loading ? (
            <span style={{ color: 'rgba(0,0,0,0.5)' }}>⏳ Verificando...</span>
          ) : statusGA4.ok ? (
            <span style={{ color: GREEN, fontWeight: 600 }}>● Conectado · último fetch {fmtDate(statusGA4.fetched_at)}</span>
          ) : (
            <span style={{ color: RED, fontWeight: 600 }}>● Sin conexión: {statusGA4.error}</span>
          )}
          <button onClick={loadAll} style={S.btnGhost}>↻ Re-verificar</button>
        </div>
        <div style={{ marginTop: 14, fontSize: '0.85rem', color: 'rgba(0,0,0,0.55)' }}>
          <div>Property ID: <code style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 4 }}>{process.env.NEXT_PUBLIC_GA4_PROPERTY_ID || '(en variable de entorno)'}</code></div>
          <div style={{ marginTop: 4 }}>Measurement ID: <code style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 4 }}>G-237EPSVR3Z</code></div>
        </div>
        <div style={{ marginTop: 16 }}>
          <button onClick={clearCache} disabled={clearing} style={S.btnGhost}>
            {clearing ? '⏳ Borrando...' : '🗑️ Forzar refresh de caché'}
          </button>
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={S.sectionTitle}>🔗 Link mágico para empleados</div>
            <div style={S.sectionCap}>Compartilo con cada empleado: cuando lo abren desde su Mac/celular, su navegador queda marcado como interno.</div>
          </div>
          <button onClick={copyMarkLink} style={{ ...S.btnPrimary, background: copiedLink ? `linear-gradient(135deg, ${GREEN}, #1f5e3a)` : S.btnPrimary.background }}>
            {copiedLink ? '✓ Copiado' : '📋 Copiar link'}
          </button>
        </div>
        <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: '0.85rem', background: 'rgba(0,0,0,0.04)', padding: 10, borderRadius: 8, color: 'rgba(0,0,0,0.7)' }}>
          {typeof window !== 'undefined' ? `${window.location.origin}/marcar-interno` : '/marcar-interno'}
        </div>
      </div>

      <div style={S.card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={S.sectionTitle}>🧩 Snippet para Nidux (depositojimenezcr.com)</div>
            <div style={S.sectionCap}>
              Sin esto, Nidux no manda <code style={{ background: 'rgba(0,0,0,0.06)', padding: '0 4px', borderRadius: 3 }}>traffic_type=internal</code> a GA4 y la tab Equipo WhatsApp queda vacía.
              Pegá este código en el panel admin de Nidux <strong>antes</strong> del tag de Google Analytics.
            </div>
          </div>
          <button onClick={copySnippet} style={{ ...S.btnPrimary, background: copiedSnippet ? `linear-gradient(135deg, ${GREEN}, #1f5e3a)` : S.btnPrimary.background }}>
            {copiedSnippet ? '✓ Copiado' : '📋 Copiar snippet'}
          </button>
        </div>
        <div style={{ marginTop: 10, fontFamily: 'monospace', fontSize: '0.78rem', background: 'rgba(0,0,0,0.04)', padding: 12, borderRadius: 8, color: 'rgba(0,0,0,0.75)', whiteSpace: 'pre-wrap', overflowX: 'auto', maxHeight: 280, overflowY: 'auto' }}>
          {NIDUX_SNIPPET}
        </div>
        <div style={{ marginTop: 12, fontSize: '0.82rem', color: 'rgba(0,0,0,0.6)', lineHeight: 1.6 }}>
          <strong>Pasos en Nidux:</strong>
          <ol style={{ marginTop: 6, marginBottom: 4, paddingLeft: 22 }}>
            <li>Entrar al admin de Nidux → <em>Configuración</em> → <em>Scripts personalizados / Header</em>.</li>
            <li>Pegar el snippet de arriba <strong>antes</strong> del tag <code style={{ background: 'rgba(0,0,0,0.06)', padding: '0 4px', borderRadius: 3 }}>gtag/js?id=G-237EPSVR3Z</code>.</li>
            <li>Guardar y publicar.</li>
            <li>Volver a esta tab al rato — el banner de la tab <strong>Equipo WhatsApp</strong> tiene que pasar de rojo a verde.</li>
          </ol>
          <strong>Backup en GA4 (recomendado por si Nidux no respeta el script):</strong> Admin → Data Streams →
          el stream del sitio → Configure tag settings → <em>Define internal traffic</em> → crear regla:
          <em> Match: traffic_type contains internal</em>. Eso hace que GA4 detecte el flag aunque Nidux ignore el snippet.
        </div>
      </div>

      <div style={S.card}>
        <div style={S.sectionTitle}>📣 Campañas ({campaigns.length})</div>
        <div style={S.sectionCap}>Archivar no las borra: solo deja de mostrarlas en el dropdown del generador.</div>
        {campaigns.length === 0 ? (
          <div style={{ color: 'rgba(0,0,0,0.5)' }}>Sin campañas registradas.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.04)' }}>
                  <th style={th()}>Nombre</th>
                  <th style={th()}>Slug</th>
                  <th style={th()}>Creada</th>
                  <th style={th()}>Estado</th>
                  <th style={th()}></th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', opacity: c.archived ? 0.5 : 1 }}>
                    <td style={{ ...td(), fontWeight: 600 }}>{c.name}</td>
                    <td style={{ ...td(), fontFamily: 'monospace' }}>{c.slug}</td>
                    <td style={td()}>{fmtDate(c.created_at)}</td>
                    <td style={td()}>{c.archived ? 'Archivada' : 'Activa'}</td>
                    <td style={td()}>
                      <button onClick={() => toggleArchive(c)} style={S.btnGhost}>
                        {c.archived ? 'Desarchivar' : 'Archivar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={S.card}>
        <div style={S.sectionTitle}>📱 Dispositivos marcados como internos ({devices.filter(d => !d.revoked).length} activos)</div>
        <div style={S.sectionCap}>Si un equipo dejó de ser interno, revocá la marca acá. (Esto NO desactiva el flag local; el empleado tendría que limpiar su localStorage.)</div>
        {devices.length === 0 ? (
          <div style={{ color: 'rgba(0,0,0,0.5)' }}>Nadie marcó su dispositivo todavía.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'rgba(0,0,0,0.04)' }}>
                  <th style={th()}>Dispositivo</th>
                  <th style={th()}>Marcado por</th>
                  <th style={th()}>Fecha</th>
                  <th style={th()}>Estado</th>
                  <th style={th()}></th>
                </tr>
              </thead>
              <tbody>
                {devices.map(d => (
                  <tr key={d.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', opacity: d.revoked ? 0.5 : 1 }}>
                    <td style={{ ...td(), fontWeight: 600 }}>{d.device_label || <span style={{ color: 'rgba(0,0,0,0.4)' }}>(sin etiqueta)</span>}</td>
                    <td style={td()}>{d.marked_by || '—'}</td>
                    <td style={td()}>{fmtDate(d.marked_at)}</td>
                    <td style={td()}>{d.revoked ? 'Revocado' : 'Activo'}</td>
                    <td style={td()}>
                      <button onClick={() => toggleRevoke(d)} style={S.btnGhost}>
                        {d.revoked ? 'Restaurar' : 'Revocar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
