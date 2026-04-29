'use client';
import { useEffect, useMemo, useState } from 'react';
import { S, GOLD, GREEN, RED, BLUE, SOURCE_OPTIONS } from './styles';

const ALLOWED_HOSTS = ['depositojimenezcr.com', 'www.depositojimenezcr.com'];

const ALL_MEDIUMS = {
  organico: { key: 'organico', label: 'Orgánico',          emoji: '🌱', short: 'Org' },
  pagado:   { key: 'pagado',   label: 'Pagado',            emoji: '💰', short: 'Pag' },
  bio:      { key: 'bio',      label: 'Link en bio',       emoji: '🔗', short: 'Bio' },
  historia: { key: 'historia', label: 'Historia / Story',  emoji: '✨', short: 'Story' },
};

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

function buildFinalUrl(baseUrl, source, medium, campaign, content) {
  try {
    const u = new URL(baseUrl);
    u.searchParams.set('utm_source', source);
    u.searchParams.set('utm_medium', medium);
    u.searchParams.set('utm_campaign', campaign);
    u.searchParams.set('utm_content', content);
    return u.toString();
  } catch { return ''; }
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

const fadeIn = { animation: 'mwFadeIn 0.35s ease' };

export default function GeneradorLinks({ user }) {
  const [url, setUrl] = useState('');
  const [sources, setSources] = useState([]); // multi
  const [pubType, setPubType] = useState('organico_pagado'); // organico | pagado | organico_pagado
  const [extras, setExtras] = useState({ bio: false, historia: false });
  const [campaigns, setCampaigns] = useState([]);
  const [campaignSlug, setCampaignSlug] = useState('');
  const [content, setContent] = useState('');
  const [showNewCampaign, setShowNewCampaign] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignDesc, setNewCampaignDesc] = useState('');
  const [creating, setCreating] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null); // { items: [{source, medium, longUrl, shortUrl, slug, ...}], errors: [] }

  const productName = useMemo(() => url ? extractProductFromUrl(url) : null, [url]);
  const urlValid = url ? isAllowedUrl(url) : false;

  // Cargar campañas.
  useEffect(() => {
    fetch('/api/metricas-web/campaigns').then(r => r.json()).then(j => setCampaigns(j?.data || []));
  }, []);

  const campaignMeta = campaigns.find(c => c.slug === campaignSlug);

  // Mediums efectivos según pubType + extras.
  const effectiveMediums = useMemo(() => {
    const m = [];
    if (pubType === 'organico' || pubType === 'organico_pagado') m.push('organico');
    if (pubType === 'pagado' || pubType === 'organico_pagado') m.push('pagado');
    if (extras.bio) m.push('bio');
    if (extras.historia) m.push('historia');
    return m;
  }, [pubType, extras]);

  // Sugerencia automática de utm_content.
  const suggestion = useMemo(() => {
    if (!productName) return '';
    const prod = normalizeSlug(productName).split('_').slice(0, 3).join('_');
    return prod;
  }, [productName]);

  const contentNormalized = normalizeSlug(content);

  const step1Done = urlValid && !!productName;
  const step2Done = step1Done && sources.length > 0;
  const step3Done = step2Done && effectiveMediums.length > 0;
  const step4Done = step3Done && !!campaignSlug;
  const step5Done = step4Done && !!contentNormalized;

  function toggleSource(key) {
    setSources(prev => prev.includes(key) ? prev.filter(s => s !== key) : [...prev, key]);
  }
  function selectAllSources() {
    setSources(SOURCE_OPTIONS.map(s => s.key));
  }
  function clearSources() {
    setSources([]);
  }

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

  async function handleGenerate() {
    if (!step5Done) return;
    setGenerating(true);
    setResult(null);

    // Matriz: source × medium.
    const items = [];
    for (const source of sources) {
      for (const medium of effectiveMediums) {
        const longUrl = buildFinalUrl(url, source, medium, campaignSlug, contentNormalized);
        items.push({ source, medium, longUrl, shortUrl: null, slug: null, error: null });
      }
    }

    // Acortar todos en paralelo.
    const promises = items.map(async (item) => {
      try {
        // Crear short link.
        const r = await fetch('/api/metricas-web/shorten', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            target_url: item.longUrl,
            utm_source: item.source,
            utm_medium: item.medium,
            utm_campaign: campaignSlug,
            utm_content: contentNormalized,
            product_name: productName || null,
            created_by: user?.email || null,
          }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j?.error || 'error acortando');
        item.shortUrl = j.short_url;
        item.slug = j.slug;
        // Guardar en historial UTMs (mismo flujo viejo).
        await fetch('/api/metricas-web/links', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            base_url: url,
            utm_source: item.source,
            utm_medium: item.medium,
            utm_campaign: campaignSlug,
            utm_content: contentNormalized,
            final_url: item.longUrl,
            created_by: user?.email || null,
            product_name: productName || null,
          }),
        }).catch(() => {});
      } catch (e) {
        item.error = e.message;
      }
    });
    await Promise.all(promises);

    setResult({ items, generatedAt: new Date().toISOString() });
    setGenerating(false);
  }

  function reset() {
    setUrl(''); setSources([]); setPubType('organico_pagado'); setExtras({ bio: false, historia: false });
    setCampaignSlug(''); setContent(''); setResult(null);
  }

  return (
    <div>
      <style>{`@keyframes mwFadeIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: none; } }`}</style>

      <div style={S.card}>
        <div style={S.sectionTitle}>🪄 Generador de Links</div>
        <div style={S.sectionCap}>Armá links con UTMs para varias redes y tipos a la vez. Cada link queda acortado para pegar fácil en posts.</div>

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

        {/* Paso 2 — multi-red */}
        {step1Done && (
          <div style={{ ...S.cardInner, marginBottom: 16, ...fadeIn }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
              <StepHeader n={2} title="¿Dónde vas a publicar?" done={step2Done} active={!step2Done} />
              <div style={{ display: 'flex', gap: 8, fontSize: '0.78rem', color: 'rgba(0,0,0,0.55)' }}>
                <span>Seleccionadas: <strong>{sources.length}</strong></span>
                <span style={{ cursor: 'pointer', color: BLUE, textDecoration: 'underline' }} onClick={sources.length === SOURCE_OPTIONS.length ? clearSources : selectAllSources}>
                  {sources.length === SOURCE_OPTIONS.length ? 'Deseleccionar todas' : 'Seleccionar todas'}
                </span>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
              {SOURCE_OPTIONS.map(s => {
                const active = sources.includes(s.key);
                return (
                  <button key={s.key} onClick={() => toggleSource(s.key)} style={{
                    position: 'relative',
                    background: active ? s.color : 'rgba(255,255,255,0.7)',
                    color: active ? '#fff' : 'rgba(0,0,0,0.7)',
                    border: active ? `2px solid ${s.color}` : '1px solid rgba(0,0,0,0.1)',
                    borderRadius: 12,
                    padding: '14px 8px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    fontFamily: 'inherit',
                    transition: 'all 0.15s',
                    boxShadow: active ? `0 4px 16px ${s.color}55` : 'none',
                  }}>
                    {active && (
                      <span style={{ position: 'absolute', top: 4, right: 6, background: GREEN, color: '#fff', borderRadius: '50%', width: 18, height: 18, fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>✓</span>
                    )}
                    <div style={{ fontSize: '1.4rem', marginBottom: 4 }}>{s.emoji}</div>
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Paso 3 — pubType + extras */}
        {step2Done && (
          <div style={{ ...S.cardInner, marginBottom: 16, ...fadeIn }}>
            <StepHeader n={3} title="¿Qué tipo de publicación necesitás?" done={step3Done} active={!step3Done} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <PubTypeRadio
                value="organico"
                current={pubType}
                onChange={setPubType}
                label="Solo orgánico"
                desc="Para posts y reels normales, sin pauta planeada"
              />
              <PubTypeRadio
                value="pagado"
                current={pubType}
                onChange={setPubType}
                label="Solo pagado"
                desc="Para anuncios directos en Meta Ads o TikTok Ads"
              />
              <PubTypeRadio
                value="organico_pagado"
                current={pubType}
                onChange={setPubType}
                label="Orgánico + pagado"
                desc="Lo más común. Usás el orgánico ya, y guardás el pagado por si después le metés pauta."
              />
            </div>

            <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(0,0,0,0.06)' }}>
              <div style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.6)', marginBottom: 8, fontWeight: 600 }}>Extras opcionales:</div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', color: 'rgba(0,0,0,0.7)', cursor: 'pointer', marginBottom: 6 }}>
                <input type="checkbox" checked={extras.bio} onChange={e => setExtras(s => ({ ...s, bio: e.target.checked }))} />
                🔗 También quiero versión para <strong>Link en Bio</strong>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.88rem', color: 'rgba(0,0,0,0.7)', cursor: 'pointer' }}>
                <input type="checkbox" checked={extras.historia} onChange={e => setExtras(s => ({ ...s, historia: e.target.checked }))} />
                ✨ También quiero versión para <strong>Historia / Story</strong>
              </label>
            </div>

            <div style={{ marginTop: 12, fontSize: '0.78rem', color: 'rgba(0,0,0,0.5)' }}>
              Vas a generar <strong>{sources.length} red{sources.length !== 1 ? 'es' : ''} × {effectiveMediums.length} tipo{effectiveMediums.length !== 1 ? 's' : ''} = {sources.length * effectiveMediums.length} link{sources.length * effectiveMediums.length !== 1 ? 's' : ''}</strong>.
            </div>
          </div>
        )}

        {/* Paso 4 — campaña */}
        {step3Done && (
          <div style={{ ...S.cardInner, marginBottom: 16, ...fadeIn }}>
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

        {/* Paso 5 — content */}
        {step4Done && (
          <div style={{ ...S.cardInner, marginBottom: 16, ...fadeIn }}>
            <StepHeader n={5} title="Describí esta pieza" done={step5Done} active={!step5Done} />
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

        {/* Botón generar */}
        {step5Done && !result && (
          <button onClick={handleGenerate} disabled={generating} style={{
            background: `linear-gradient(135deg, ${GOLD}, #a08930)`,
            color: '#fff', border: 'none', borderRadius: 12, padding: '14px 22px',
            fontSize: '1.05rem', fontWeight: 700, cursor: 'pointer', width: '100%',
            boxShadow: '0 6px 20px rgba(200,168,75,0.35)',
            fontFamily: 'inherit', opacity: generating ? 0.7 : 1,
          }}>
            {generating ? '⏳ Generando y acortando...' : `🚀 Generar ${sources.length * effectiveMediums.length} link${sources.length * effectiveMediums.length !== 1 ? 's' : ''}`}
          </button>
        )}

        {/* Paso 6 — resultado */}
        {result && (
          <ResultsView
            result={result}
            sources={sources}
            mediums={effectiveMediums}
            onReset={reset}
          />
        )}
      </div>
    </div>
  );
}

function PubTypeRadio({ value, current, onChange, label, desc }) {
  const selected = current === value;
  return (
    <label style={{
      display: 'flex', alignItems: 'flex-start', gap: 12,
      padding: '12px 14px',
      border: selected ? `2px solid ${GOLD}` : '1px solid rgba(0,0,0,0.1)',
      borderRadius: 12,
      background: selected ? 'rgba(200,168,75,0.08)' : 'rgba(255,255,255,0.5)',
      cursor: 'pointer',
      transition: 'all 0.15s',
    }}>
      <input
        type="radio"
        checked={selected}
        onChange={() => onChange(value)}
        style={{ marginTop: 3, accentColor: GOLD, width: 16, height: 16 }}
      />
      <div>
        <div style={{ fontWeight: 600, color: 'rgba(0,0,0,0.85)', fontSize: '0.95rem' }}>{label}</div>
        <div style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.55)', marginTop: 2, lineHeight: 1.4 }}>{desc}</div>
      </div>
    </label>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Resultados (Paso 6 redesign)
// ──────────────────────────────────────────────────────────────────────────
function ResultsView({ result, sources, mediums, onReset }) {
  const [view, setView] = useState('por-red'); // por-red | por-tipo
  const [bulkCopied, setBulkCopied] = useState(null); // 'organicos' | 'pagados' | 'todos'

  const items = result.items.filter(i => !i.error);
  const errors = result.items.filter(i => i.error);

  const sourceMeta = (key) => SOURCE_OPTIONS.find(s => s.key === key);
  const mediumMeta = (key) => ALL_MEDIUMS[key];

  async function copyText(txt, tag) {
    try {
      await navigator.clipboard.writeText(txt);
      setBulkCopied(tag);
      setTimeout(() => setBulkCopied(null), 2000);
    } catch (e) { alert('No se pudo copiar: ' + e.message); }
  }

  function bulkOf(mediumKey) {
    const lines = items
      .filter(i => i.medium === mediumKey)
      .map(i => `${sourceMeta(i.source)?.label || i.source}: ${i.shortUrl || i.longUrl}`);
    return lines.join('\n');
  }

  function bulkAll() {
    const lines = [];
    for (const m of mediums) {
      const meta = mediumMeta(m);
      lines.push(`— ${meta?.label || m} —`);
      for (const i of items.filter(x => x.medium === m)) {
        lines.push(`${sourceMeta(i.source)?.label || i.source}: ${i.shortUrl || i.longUrl}`);
      }
      lines.push('');
    }
    return lines.join('\n').trim();
  }

  return (
    <div style={{ ...S.cardInner, background: 'rgba(46,125,79,0.06)', border: '1px solid rgba(46,125,79,0.3)', ...fadeIn }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: '1.15rem', fontWeight: 800, color: GREEN, marginBottom: 2 }}>
            🎉 ¡Listo! Generé {items.length} link{items.length !== 1 ? 's' : ''} para vos
          </div>
          <div style={{ fontSize: '0.82rem', color: 'rgba(0,0,0,0.55)' }}>
            {sources.length} red{sources.length !== 1 ? 'es' : ''} × {mediums.length} tipo{mediums.length !== 1 ? 's' : ''} = {sources.length * mediums.length} links.
            {mediums.includes('organico') && mediums.includes('pagado') && ' Usá los orgánicos ya, y los pagados cuando vayas a pautar.'}
          </div>
        </div>
        <button onClick={onReset} style={S.btnGhost}>↻ Generar otros</button>
      </div>

      {errors.length > 0 && (
        <div style={{ background: 'rgba(192,64,64,0.1)', border: '1px solid rgba(192,64,64,0.3)', color: RED, padding: '8px 12px', borderRadius: 10, fontSize: '0.85rem', marginBottom: 12 }}>
          ⚠️ {errors.length} link{errors.length !== 1 ? 's' : ''} no se pudieron acortar. Te dejo los largos abajo igual.
        </div>
      )}

      {/* Botones de acción masiva */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        {mediums.includes('organico') && (
          <button onClick={() => copyText(bulkOf('organico'), 'organicos')} style={{
            ...S.btnPrimary,
            background: bulkCopied === 'organicos' ? `linear-gradient(135deg, ${GREEN}, #1f5e3a)` : `linear-gradient(135deg, ${GREEN}, #1f5e3a)`,
            fontSize: '0.85rem', padding: '9px 14px',
          }}>
            {bulkCopied === 'organicos' ? '✓ Copiado' : '📋 Copiar TODOS los orgánicos'}
          </button>
        )}
        {mediums.includes('pagado') && (
          <button onClick={() => copyText(bulkOf('pagado'), 'pagados')} style={{
            ...S.btnPrimary,
            background: bulkCopied === 'pagados' ? `linear-gradient(135deg, ${GREEN}, #1f5e3a)` : `linear-gradient(135deg, #c8882b, #a06a1f)`,
            fontSize: '0.85rem', padding: '9px 14px',
          }}>
            {bulkCopied === 'pagados' ? '✓ Copiado' : '📋 Copiar TODOS los pagados'}
          </button>
        )}
        <button onClick={() => copyText(bulkAll(), 'todos')} style={{ ...S.btnGhost, fontSize: '0.85rem' }}>
          {bulkCopied === 'todos' ? '✓ Copiado' : '📋 Copiar lista completa'}
        </button>
      </div>

      {/* Tabs vista */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, paddingBottom: 6, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        <button onClick={() => setView('por-red')} style={S.pillTab(view === 'por-red')}>📱 Por red social</button>
        <button onClick={() => setView('por-tipo')} style={S.pillTab(view === 'por-tipo')}>🎯 Por tipo</button>
      </div>

      {view === 'por-red'
        ? <ViewBySource items={items} sources={sources} sourceMeta={sourceMeta} mediumMeta={mediumMeta} />
        : <ViewByMedium items={items} mediums={mediums} sourceMeta={sourceMeta} mediumMeta={mediumMeta} />
      }
    </div>
  );
}

function ViewBySource({ items, sources, sourceMeta, mediumMeta }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {sources.map(src => {
        const meta = sourceMeta(src);
        const rowsForSource = items.filter(i => i.source === src);
        if (rowsForSource.length === 0) return null;
        return (
          <CollapsibleCard key={src} title={`${meta?.emoji || '📊'} ${meta?.label || src}`} accent={meta?.color || '#666'} count={rowsForSource.length}>
            {rowsForSource.map((it, idx) => (
              <LinkRow key={idx} item={it} mediumMeta={mediumMeta} />
            ))}
          </CollapsibleCard>
        );
      })}
    </div>
  );
}

function ViewByMedium({ items, mediums, sourceMeta, mediumMeta }) {
  const labels = {
    organico: { title: '🌱 Para usar YA — Orgánicos', color: GREEN },
    pagado:   { title: '💰 Para cuando pauteés — Pagados', color: '#c8882b' },
    bio:      { title: '🔗 Link en Bio', color: BLUE },
    historia: { title: '✨ Historia / Story', color: '#9b87f5' },
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {mediums.map(m => {
        const rows = items.filter(i => i.medium === m);
        if (rows.length === 0) return null;
        const meta = labels[m] || { title: m, color: '#666' };
        return (
          <CollapsibleCard key={m} title={meta.title} accent={meta.color} count={rows.length}>
            {rows.map((it, idx) => {
              const sm = sourceMeta(it.source);
              return (
                <LinkRow
                  key={idx}
                  item={it}
                  mediumMeta={mediumMeta}
                  customLabel={`${sm?.emoji || '📊'} ${sm?.label || it.source}`}
                />
              );
            })}
          </CollapsibleCard>
        );
      })}
    </div>
  );
}

function CollapsibleCard({ title, accent, count, children }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ background: '#fff', border: `1px solid rgba(0,0,0,0.08)`, borderLeft: `4px solid ${accent}`, borderRadius: 12, overflow: 'hidden' }}>
      <div onClick={() => setOpen(o => !o)} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'rgba(0,0,0,0.8)' }}>{title}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '0.78rem', color: 'rgba(0,0,0,0.5)', background: 'rgba(0,0,0,0.05)', padding: '2px 8px', borderRadius: 10 }}>{count}</span>
          <span style={{ fontSize: '0.7rem', color: 'rgba(0,0,0,0.5)' }}>{open ? '▾' : '▸'}</span>
        </div>
      </div>
      {open && <div style={{ padding: '0 14px 14px' }}>{children}</div>}
    </div>
  );
}

function LinkRow({ item, mediumMeta, customLabel }) {
  const [copied, setCopied] = useState(false);
  const [showLong, setShowLong] = useState(false);
  const meta = mediumMeta(item.medium);
  const label = customLabel || meta?.label || item.medium;
  const link = item.shortUrl || item.longUrl;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e) { alert('Error: ' + e.message); }
  }

  return (
    <div style={{ borderTop: '1px solid rgba(0,0,0,0.05)', padding: '10px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: '1 1 auto' }}>
          {!customLabel && meta && (
            <span style={{ background: 'rgba(0,0,0,0.06)', color: 'rgba(0,0,0,0.7)', padding: '3px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
              {meta.emoji} {meta.label}
            </span>
          )}
          {customLabel && (
            <span style={{ fontSize: '0.85rem', color: 'rgba(0,0,0,0.7)', fontWeight: 600 }}>{customLabel}</span>
          )}
          <code style={{ fontSize: '0.85rem', fontFamily: 'monospace', background: 'rgba(0,0,0,0.04)', padding: '4px 10px', borderRadius: 6, color: 'rgba(0,0,0,0.78)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
            {link}
          </code>
        </div>
        <button onClick={copy} style={{
          background: copied ? GREEN : 'rgba(255,255,255,0.7)',
          color: copied ? '#fff' : 'rgba(0,0,0,0.7)',
          border: '1px solid rgba(0,0,0,0.1)',
          borderRadius: 8, padding: '7px 14px',
          fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          whiteSpace: 'nowrap',
        }}>
          {copied ? '✓ Copiado' : '📋 Copiar'}
        </button>
      </div>
      {item.shortUrl && (
        <div style={{ marginTop: 4 }}>
          <span onClick={() => setShowLong(s => !s)} style={{ fontSize: '0.72rem', color: BLUE, cursor: 'pointer', textDecoration: 'underline' }}>
            {showLong ? 'Ocultar link largo' : 'Ver link largo'}
          </span>
          {showLong && (
            <div style={{ marginTop: 4, fontSize: '0.72rem', color: 'rgba(0,0,0,0.5)', wordBreak: 'break-all', fontFamily: 'monospace' }}>
              {item.longUrl}
            </div>
          )}
        </div>
      )}
      {item.error && (
        <div style={{ color: RED, fontSize: '0.78rem', marginTop: 4 }}>⚠️ {item.error}</div>
      )}
    </div>
  );
}
