'use client';
import { useEffect, useState } from 'react';
import { S, RED, GREEN, SOURCE_OPTIONS } from './styles';

const SRC = Object.fromEntries(SOURCE_OPTIONS.map(s => [s.key, s]));

function fmtDate(s) {
  try {
    const d = new Date(s);
    return d.toLocaleString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return s; }
}

function th() { return { textAlign: 'left', padding: '10px 12px', fontSize: '0.78rem', fontWeight: 600, color: 'rgba(0,0,0,0.55)', textTransform: 'uppercase', letterSpacing: '0.04em' }; }
function td() { return { padding: '10px 12px', color: 'rgba(0,0,0,0.78)', fontSize: '0.86rem' }; }

export default function HistorialLinks() {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterSource, setFilterSource] = useState('');
  const [filterCampaign, setFilterCampaign] = useState('');
  const [search, setSearch] = useState('');
  const [campaigns, setCampaigns] = useState([]);
  const [copiedId, setCopiedId] = useState(null);

  useEffect(() => {
    fetch('/api/metricas-web/campaigns').then(r => r.json()).then(j => setCampaigns(j?.data || []));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams();
    if (filterSource) params.set('source', filterSource);
    if (filterCampaign) params.set('campaign', filterCampaign);
    if (search.trim()) params.set('search', search.trim());
    fetch(`/api/metricas-web/links?${params}`)
      .then(r => r.json())
      .then(j => { if (!cancelled) { setData(j?.data || []); setLoading(false); } })
      .catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [filterSource, filterCampaign, search]);

  async function copyLink(row) {
    try {
      await navigator.clipboard.writeText(row.final_url);
      setCopiedId(row.id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch { /* ignore */ }
  }

  return (
    <div style={S.card}>
      <div style={S.sectionTitle}>📚 Historial de links</div>
      <div style={S.sectionCap}>Últimos 50 links generados. Podés copiar cualquiera para reutilizar.</div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <input placeholder="Buscar por producto..." value={search} onChange={e => setSearch(e.target.value)} style={{ ...S.input, flex: '1 1 220px' }} />
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={{ ...S.input, maxWidth: 180 }}>
          <option value="">Todas las plataformas</option>
          {SOURCE_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
        </select>
        <select value={filterCampaign} onChange={e => setFilterCampaign(e.target.value)} style={{ ...S.input, maxWidth: 220 }}>
          <option value="">Todas las campañas</option>
          {campaigns.map(c => <option key={c.id} value={c.slug}>{c.name}</option>)}
        </select>
      </div>

      {error && <div style={{ color: RED }}>⚠️ {error}</div>}
      {loading ? (
        <div style={{ color: 'rgba(0,0,0,0.5)' }}>⏳ Cargando...</div>
      ) : data.length === 0 ? (
        <div style={{ color: 'rgba(0,0,0,0.5)' }}>Sin links registrados todavía.</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(0,0,0,0.04)' }}>
                <th style={th()}>Fecha</th>
                <th style={th()}>Producto</th>
                <th style={th()}>Plataforma</th>
                <th style={th()}>Tipo</th>
                <th style={th()}>Campaña</th>
                <th style={th()}>Pieza</th>
                <th style={th()}></th>
              </tr>
            </thead>
            <tbody>
              {data.map((r) => {
                const meta = SRC[r.utm_source];
                return (
                  <tr key={r.id} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                    <td style={td()}>{fmtDate(r.created_at)}</td>
                    <td style={td()}>{r.product_name || <span style={{ color: 'rgba(0,0,0,0.4)' }}>—</span>}</td>
                    <td style={td()}>
                      {meta ? <span><span style={{ marginRight: 4 }}>{meta.emoji}</span>{meta.label}</span> : r.utm_source}
                    </td>
                    <td style={td()}>{r.utm_medium}</td>
                    <td style={td()}>{r.utm_campaign}</td>
                    <td style={{ ...td(), fontFamily: 'monospace', fontSize: '0.78rem' }}>{r.utm_content}</td>
                    <td style={td()}>
                      <button onClick={() => copyLink(r)} style={{
                        background: copiedId === r.id ? GREEN : 'rgba(255,255,255,0.7)',
                        color: copiedId === r.id ? '#fff' : 'rgba(0,0,0,0.7)',
                        border: '1px solid rgba(0,0,0,0.1)',
                        borderRadius: 8, padding: '6px 12px',
                        fontSize: '0.78rem', cursor: 'pointer', fontFamily: 'inherit',
                      }}>
                        {copiedId === r.id ? '✓ Copiado' : 'Copiar'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
