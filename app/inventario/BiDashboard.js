'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const card = { background:'rgba(255,255,255,0.55)', backdropFilter:'blur(24px) saturate(1.8)', WebkitBackdropFilter:'blur(24px) saturate(1.8)', border:'1px solid rgba(255,255,255,0.6)', borderRadius:20, padding:'20px', marginBottom:'16px', boxShadow:'0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' };
const inner = { background:'rgba(255,255,255,0.4)', backdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.5)', borderRadius:14, padding:'14px 18px' };
const GOLD = '#c8a84b';
const FONT = 'Rubik, sans-serif';
const T1 = { color:'rgba(0,0,0,0.85)', fontFamily:FONT, fontWeight:600 };
const T2 = { color:'rgba(0,0,0,0.5)', fontFamily:FONT, fontSize:12 };
const T3 = { color:'rgba(0,0,0,0.7)', fontFamily:FONT, fontSize:13 };

const fmtCRC = n => '₡' + Number(n||0).toLocaleString('es-CR', { maximumFractionDigits:0 });
const fmtPct = n => Number(n||0).toFixed(1) + '%';
const fmtQty = n => Number(n||0).toLocaleString('es-CR', { maximumFractionDigits:0 });

const marginColor = p => p > 30 ? '#22c55e' : p > 15 ? GOLD : p > 5 ? '#f97316' : '#ef4444';

const thStyle = { ...T2, fontWeight:600, padding:'8px 10px', textAlign:'left', background:'rgba(255,255,255,0.5)', backdropFilter:'blur(8px)', position:'sticky', top:0 };
const thR = { ...thStyle, textAlign:'right' };
const tdStyle = { ...T3, padding:'6px 10px', borderBottom:'1px solid rgba(0,0,0,0.04)' };
const tdR = { ...tdStyle, textAlign:'right', fontVariantNumeric:'tabular-nums' };
const trBg = i => ({ background: i % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.02)' });

export default function BiDashboard() {
  const [dias, setDias] = useState(90);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({});
  const [topRevenue, setTopRevenue] = useState([]);
  const [topQty, setTopQty] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [vendedores, setVendedores] = useState([]);
  const [margins, setMargins] = useState([]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.rpc('bi_kpis_resumen', { dias }),
      supabase.rpc('bi_top_productos_revenue', { dias }),
      supabase.rpc('bi_top_productos_qty', { dias }),
      supabase.rpc('bi_revenue_por_categoria', { dias }),
      supabase.rpc('bi_revenue_por_vendedor', { dias }),
      supabase.rpc('bi_margin_analysis', { dias }),
    ]).then(([rKpi, rRev, rQty, rCat, rVen, rMar]) => {
      if (cancelled) return;
      const k = Array.isArray(rKpi.data) ? rKpi.data[0] : rKpi.data;
      setKpis(k || {});
      setTopRevenue(rRev.data || []);
      setTopQty(rQty.data || []);
      setCategorias(rCat.data || []);
      setVendedores(rVen.data || []);
      setMargins(rMar.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [dias]);

  const noData = !loading && (!kpis.total_revenue || kpis.total_revenue === 0);

  const pill = d => ({
    padding:'6px 18px', borderRadius:20, border:'none', cursor:'pointer', fontFamily:FONT,
    fontSize:13, fontWeight:600, transition:'all 0.2s',
    background: dias === d ? GOLD : 'rgba(255,255,255,0.5)',
    color: dias === d ? '#fff' : 'rgba(0,0,0,0.6)',
    backdropFilter:'blur(8px)',
  });

  if (loading) return (
    <div style={{ display:'flex', justifyContent:'center', padding:60, fontFamily:FONT, color:'rgba(0,0,0,0.4)' }}>
      Cargando BI Dashboard...
    </div>
  );

  if (noData) return (
    <div style={{ ...card, textAlign:'center', padding:40 }}>
      <p style={{ ...T1, fontSize:16, marginBottom:8 }}>Sin datos</p>
      <p style={T3}>No hay datos de facturación. Subí el reporte &quot;Lista de ítems facturados&quot; en Reportes.</p>
    </div>
  );

  const maxCatRev = Math.max(...categorias.map(c => c.total_revenue || 0), 1);
  const bestMargins = margins.filter(m => m.margin_pct != null).sort((a,b) => b.margin_pct - a.margin_pct).slice(0,10);
  const worstMargins = margins.filter(m => m.margin_pct != null).sort((a,b) => a.margin_pct - b.margin_pct).slice(0,10);

  return (
    <div style={{ fontFamily:FONT }}>
      {/* Period Filter */}
      <div style={{ display:'flex', gap:8, marginBottom:20 }}>
        {[30,60,90].map(d => (
          <button key={d} style={pill(d)} onClick={() => setDias(d)}>{d}d</button>
        ))}
      </div>

      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(180px, 1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Revenue Total', value: fmtCRC(kpis.total_revenue) },
          { label:'Margen Global %', value: fmtPct(kpis.margin_global_pct) },
          { label:'Capital Muerto', value: fmtCRC(kpis.capital_muerto) },
          { label:'Capital Sobrestock', value: fmtCRC(kpis.capital_sobrestock) },
        ].map(k => (
          <div key={k.label} style={inner}>
            <div style={T2}>{k.label}</div>
            <div style={{ ...T1, fontSize:20, marginTop:4 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Top Revenue + Top Qty */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
        <div style={card}>
          <div style={{ ...T1, fontSize:14, marginBottom:10 }}>Top 20 Revenue</div>
          <div style={{ maxHeight:420, overflowY:'auto', borderRadius:10, border:'1px solid rgba(0,0,0,0.05)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr><th style={thStyle}>#</th><th style={thStyle}>Producto</th><th style={thR}>Revenue</th></tr></thead>
              <tbody>
                {topRevenue.map((p,i) => (
                  <tr key={i} style={trBg(i)}>
                    <td style={tdStyle}>{i+1}</td>
                    <td style={{ ...tdStyle, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.item || p.nombre || p.descripcion}</td>
                    <td style={tdR}>{fmtCRC(p.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={card}>
          <div style={{ ...T1, fontSize:14, marginBottom:10 }}>Top 20 Cantidad</div>
          <div style={{ maxHeight:420, overflowY:'auto', borderRadius:10, border:'1px solid rgba(0,0,0,0.05)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr><th style={thStyle}>#</th><th style={thStyle}>Producto</th><th style={thR}>Qty</th></tr></thead>
              <tbody>
                {topQty.map((p,i) => (
                  <tr key={i} style={trBg(i)}>
                    <td style={tdStyle}>{i+1}</td>
                    <td style={{ ...tdStyle, maxWidth:180, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.item || p.nombre || p.descripcion}</td>
                    <td style={tdR}>{fmtQty(p.total_qty)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Revenue por Categoría - Bar Chart */}
      <div style={{ ...card, marginBottom:16 }}>
        <div style={{ ...T1, fontSize:14, marginBottom:12 }}>Revenue por Categoría</div>
        {categorias.map((c,i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <div style={{ ...T3, width:140, flexShrink:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:12 }}>{c.categoria || 'Sin categoría'}</div>
            <div style={{ flex:1, background:'rgba(0,0,0,0.04)', borderRadius:6, height:22, overflow:'hidden' }}>
              <div style={{ width:`${((c.total_revenue||0)/maxCatRev)*100}%`, height:'100%', background:`linear-gradient(90deg, ${GOLD}, #dfc06a)`, borderRadius:6, transition:'width 0.4s' }} />
            </div>
            <div style={{ ...T3, width:100, textAlign:'right', fontSize:12, fontVariantNumeric:'tabular-nums' }}>{fmtCRC(c.total_revenue)}</div>
          </div>
        ))}
      </div>

      {/* Vendedores + Margin Analysis */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
        <div style={card}>
          <div style={{ ...T1, fontSize:14, marginBottom:10 }}>Revenue por Vendedor</div>
          <div style={{ maxHeight:400, overflowY:'auto', borderRadius:10, border:'1px solid rgba(0,0,0,0.05)' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead><tr><th style={thStyle}>#</th><th style={thStyle}>Vendedor</th><th style={thR}>Revenue</th></tr></thead>
              <tbody>
                {vendedores.map((v,i) => (
                  <tr key={i} style={trBg(i)}>
                    <td style={tdStyle}>{i+1}</td>
                    <td style={{ ...tdStyle, maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{v.vendedor}</td>
                    <td style={tdR}>{fmtCRC(v.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={card}>
          <div style={{ ...T1, fontSize:14, marginBottom:10 }}>Margin Analysis</div>
          <div style={{ maxHeight:400, overflowY:'auto' }}>
            <div style={{ ...T2, fontWeight:600, marginBottom:6, color:'#22c55e' }}>Mejores Márgenes</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:14 }}>
              <thead><tr><th style={thStyle}>Producto</th><th style={thR}>Margen</th><th style={thR}>Revenue</th></tr></thead>
              <tbody>
                {bestMargins.map((m,i) => (
                  <tr key={i} style={trBg(i)}>
                    <td style={{ ...tdStyle, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.item || m.nombre}</td>
                    <td style={{ ...tdR, color:marginColor(m.margin_pct), fontWeight:600 }}>{fmtPct(m.margin_pct)}</td>
                    <td style={tdR}>{fmtCRC(m.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ ...T2, fontWeight:600, marginBottom:6, color:'#ef4444' }}>Peores Márgenes</div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead><tr><th style={thStyle}>Producto</th><th style={thR}>Margen</th><th style={thR}>Revenue</th></tr></thead>
              <tbody>
                {worstMargins.map((m,i) => (
                  <tr key={i} style={trBg(i)}>
                    <td style={{ ...tdStyle, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{m.item || m.nombre}</td>
                    <td style={{ ...tdR, color:marginColor(m.margin_pct), fontWeight:600 }}>{fmtPct(m.margin_pct)}</td>
                    <td style={tdR}>{fmtCRC(m.total_revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
