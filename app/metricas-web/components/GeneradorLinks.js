'use client';
import { useEffect, useMemo, useState } from 'react';
import { S, GOLD, GREEN, RED, BLUE, SOURCE_OPTIONS, MEDIUM_OPTIONS } from './styles';

const ALLOWED_HOSTS = ['depositojimenezcr.com', 'www.depositojimenezcr.com'];

function normalizeSlug(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s_-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

function extractProductFromUrl(url) {
  try {
    const u = new URL(url);
    if (!ALLOWED_HOSTS.includes(u.host)) return null;
    const m = u.pathname.match(/\/products\/[^\/]+\/([^\/?#]+)/i);
    if (m) return m[1].replace(/-/g, ' ').replace(/_/g, ' ').trim();
    return u.pathname.split('/').filter(Boolean).pop() || null;
  } catch {
    return null;
  }
}

function isAllowedUrl(url) {
  try {
    const u = new URL(url);
    return ALLOWED_HOSTS.includes(u.host);
  } catch { return false; }
}

function StepHeader({ n, title, done, active }) {
  const color = done ? GREEN : (active ? GOLD : 'rgba(0,0,0,0.3)');
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <div style={{ width: 28, height: 28, borderRadius: '50%', background: color, color: '#fff', fontSize: '0.85rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {done ? '✓' : n}
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: 'rgba(0,0,0,0.78)' }}>{title}</div>
    </div>
  );
}

function fadeIn() {
  return { animation: 'mwFadeIn 0.35s ease' };
}

export default function GeneradorLinks({ user }) {
  const [url, setUrl] = useState('');
  const [source, setSource] = useState('');
  const [medium, setMedium] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [campaignSlug, setCampaignSlug] = useState('');
  const [content, setContent] = useState('');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDesc, setNewCampaignDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);

  const productName = useMemo(() => url ? extractProductFromUrl(url) : null, [url]);
  const urlValid = url ? isAllowedUrl(url) : false;

  // Cargar campañas.
  useEffect(() => {
    fetch('/api/metricas-web/campaigns').then(r => r.json()).then(j => setCampaigns(j?.data || []));
  }, []);

  const sourceMeta = SOURCE_OPTIONS.find(s => s.key === source);
  const mediumMeta = MEDIUM_OPTIONS.find(m => m.key === medium);
  const campaignMeta = campaigns.find(c => c.slug === campaignSlug);

  // Sugerencia automática de utm_content.
  const suggestion = useMemo(() => {
    if (!productName || !sourceMeta || !mediumMeta) return '';
    const prod = normalizeSlug(productName).split('_').slice(0, 3).join('_');
    return `${prod}_${sourceMeta.key}_${mediumMeta.key}`.slice(0, 60);
  }, [productName, sourceMeta, mediumMeta]);

  const contentNormalized = normalizeSlug(content);

  // Construir URL final.
  const finalUrl = useMemo(() => {
    if (!urlValid || !source || !medium || !campaignSlug || !contentNormalized) return '';
    try {
      const u = new URL(url);
      u.searchParams.set('utm_source', source);
      u.searchParams.set('utm_medium', medium);
      u.searchParams.set('utm_campaign', campaignSlug);
      u.searchParams.set('utm_content', contentNormalized);
      return u.toString();
    } catch { return ''; }
  }, [url, urlValid, source, medium, campaignSlug, contentNormalized]);

  async function handleCreateCampaign() {
    if (!newCampaignName.trim()) return;
    setCreating(true);
    try {
      const r = await fetch('/api/metricas-web/campaigns', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: newCampaignName.trim(),
          description: newCampaignDesc.trim() || null,
          created_by: user?.email || null,
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || 'error creando campaña');
      setCampaigns([j.data, ...campaigns]);
      setCampaignSlug(j.data.slug);
      setShowNewCampaign(false);
      setNewCampaignName(''); setNewCampaignDesc('');
    } catch (e) {
      alert('Error: ' + e.message);
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!finalUrl) return;
    try {
      await navigator.clipboard.writeText(finalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
      // Guardar en historial.
      setSaving(true);
      await fetch('/api/metricas-web/links', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          base_url: url,
          utm_source: source,
          utm_medium: medium,
          utm_campaign: campaignSlug,
          utm_content: contentNormalized,
          final_url: finalUrl,
          created_by: user?.email || null,
          product_name: productName || null,
        }),
      });
    } catch (e) {
      alert('No se pudo copiar: ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  function reset() {
    setUrl(''); setSource(''); setMedium(''); setCampaignSlug(''); setContent('');
    setCopied(false);
  }

  const step1Done = urlValid && productName;
  const step2Done = step1Done && !!source;
  const step3Done = step2Done && !!medium;
  const step4Done = step3Done && !!campaignSlug;
  const step5Done = step4Done && !!contentNormalized;

  return (
    <div>
      <style>{`@keyframes mwFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`}</style>

      <div style={S.card}>
        <div style={S.sectionTitle}>🪄 Generador de Links</div>
        <div style={S.sectionCap}>Armá links con UTMs paso a paso. Imposible equivocarse.</div>

        {/* Paso 1 */}
        <div style={{ ...S.cardInner, marginBottom: 16 }}>
          <StepHeader n={1} title="Pegá el link del producto" done={step1Done} active={!step1Done} />
          <input
            type="url"
            placeholder="Ej: https://depositojimenezcr.com/products/5410/azulejo-oporto-verde"
            value={url}
            onChange={e => setUrl(e.target.value)}
            style={{ ...S.input, fontSize: '1rem' }}
          />
          {url && !urlValid && (
            <div style={{ color: RED, fontSize: '0.85rem', marginTop: 8 }}>⚠️ El link debe ser de depositojimenezcr.com</div>
          )}
          {urlValid && productName && (
            <div style={{ color: GREEN, fontSize: '0.88rem', marginTop: 8, fontWeight: 600 }}>✓ Producto detectado: <span style={{ color: 'rgba(0,0,0,0.78)' }}>{productName}</span></div>
          )}
        </div>

        {/* Paso 2 */}
        {step1Done && (
          <div style={{ ...S.cardInner, marginBottom: 16, ...fadeIn() }}>
            <StepHeader n={2} title="¿Dónde vas a publicar este link?" done={step2Done} active={!step2Done} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {SOURCE_OPTIONS.map(s => {
                const active = source === s.key;
                return (
                  <button key={s.key} onClick={() => setSource(s.key)} style={{
                    background: active ? s.color : 'rgba(255,255,255,0.7)',
                    color: active ? '#fff' : 'rgba(0,0,0,0.7)',
                    border: active ? `2px solid ${s.color}` : '1px solid rgba(0,0,0,0.1)',
                    borderRadius: 12,
                    padding: '14px 8px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    opacity: source && !active ? 0.5 : 1,
                    transition: 'all 0.15s',
                    boxShadow: active ? `0 4px 16px ${s.color}55` : 'none',
                  }}>
                    <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{s.emoji}</div>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Paso 3 */}
        {step2Done && (
          <div style={{ ...S.cardInner, marginBottom: 16, ...fadeIn() }}>
            <StepHeader n={3} title="¿Qué tipo de publicación es?" done={step3Done} active={!step3Done} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 8 }}>
              {MEDIUM_OPTIONS.map(m => {
                const active = medium === m.key;
                return (
                  <button key={m.key} onClick={() => setMedium(m.key)} style={{
                    background: active ? `linear-gradient(135deg, ${GOLD}, #a08930)` : 'rgba(255,255,255,0.7)',
                    color: active ? '#fff' : 'rgba(0,0,0,0.75)',
                    border: active ? `2px solid ${GOLD}` : '1px solid rgba(0,0,0,0.1)',
                    borderRadius: 12,
                    padding: '14px 12px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    opacity: medium && !active ? 0.5 : 1,
                    transition: 'all 0.15s',
                  }}>
                    <span style={{ marginRight: 6 }}>{m.emoji}</span>{m.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Paso 4 */}
        {step3Done && (
          <div style={{ ...S.cardInner, marginBottom: 16, ...fadeIn() }}>
            <StepHeader n={4} title="¿A qué campaña pertenece?" done={step4Done} active={!step4Done} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <select value={campaignSlug} onChange={e => {
                if (e.target.value === '__new__') setShowNewCampaign(true);
                else setCampaignSlug(e.target.value);
              }} style={{ ...S.input, flex: 1, minWidth: 220 }}>
                <option value="">— Elegí una campaña —</option>
                {campaigns.map(c => (
                  <option key={c.id} value={c.slug}>{c.name}</option>
                ))}
                <option value="__new__">+ Crear campaña nueva</option>
              </select>
            </div>
            {showNewCampaign && (
              <div style={{ marginTop: 12, padding: 14, background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(200,168,75,0.4)', borderRadius: 12 }}>
                <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'rgba(0,0,0,0.78)', marginBottom: 8 }}>Nueva campaña</div>
                <input placeholder="Nombre (ej: Black Friday 2026)" value={newCampaignName} onChange={e => setNewCampaignName(e.target.value)} style={{ ...S.input, marginBottom: 8 }} />
                <input placeholder="Descripción (opcional)" value={newCampaignDesc} onChange={e => setNewCampaignDesc(e.target.value)} style={S.input} />
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button onClick={handleCreateCampaign} disabled={creating || !newCampaignName.trim()} style={S.btnPrimary}>
                    {creating ? '⏳ Creando...' : 'Crear y usar'}
                  </button>
                  <button onClick={() => { setShowNewCampaign(false); setNewCampaignName(''); setNewCampaignDesc(''); }} style={S.btnGhost}>Cancelar</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Paso 5 */}
        {step4Done && (
          <div style={{ ...S.cardInner, marginBottom: 16, ...fadeIn() }}>
            <StepHeader n={5} title="Describí esta pieza específica" done={step5Done} active={!step5Done} />
            <input
              placeholder={`Ej: ${suggestion || 'reel_demo_baño'}`}
              value={content}
              onChange={e => setContent(e.target.value)}
              style={S.input}
            />
            {contentNormalized && (
              <div style={{ marginTop: 6, fontSize: '0.78rem', color: 'rgba(0,0,0,0.45)' }}>
                Se va a guardar como: <code style={{ background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: 4, color: 'rgba(0,0,0,0.7)' }}>{contentNormalized}</code>
              </div>
            )}
            {suggestion && content !== suggestion && (
              <div style={{ marginTop: 8 }}>
                <button onClick={() => setContent(suggestion)} style={{ ...S.btnGhost, fontSize: '0.82rem', padding: '6px 12px' }}>
                  💡 Usar sugerencia: <code style={{ marginLeft: 4 }}>{suggestion}</code>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Paso 6 */}
        {step5Done && finalUrl && (
          <div style={{ ...S.cardInner, marginBottom: 16, background: 'rgba(46,125,79,0.08)', border: '1px solid rgba(46,125,79,0.3)', ...fadeIn() }}>
            <StepHeader n={6} title="Tu link está listo 🎉" done={true} active={false} />
            <div style={{ background: '#fff', border: '1px solid rgba(0,0,0,0.08)', borderRadius: 10, padding: 14, fontFamily: 'monospace', fontSize: '0.85rem', wordBreak: 'break-all', color: 'rgba(0,0,0,0.78)', marginBottom: 14 }}>
              {finalUrl}
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <button onClick={handleCopy} disabled={saving} style={{
                background: copied ? GREEN : `linear-gradient(135deg, ${GREEN}, #1f5e3a)`,
                color: '#fff', border: 'none', borderRadius: 12, padding: '14px 22px',
                fontSize: '1.05rem', fontWeight: 700, cursor: 'pointer', flex: '1 1 220px',
                boxShadow: '0 6px 20px rgba(46,125,79,0.35)',
                fontFamily: 'inherit',
              }}>
                {copied ? '✓ ¡Copiado!' : (saving ? '⏳ Guardando...' : '📋 COPIAR LINK')}
              </button>
              <button onClick={reset} style={S.btnGhost}>↻ Generar otro link</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
