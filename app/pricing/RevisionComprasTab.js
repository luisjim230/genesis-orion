'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { fmtCRC, fmtPct, fmtNum } from '../../lib/pricing';

// ────────────────────────────────────────────────────────────
// Revisión de Compras
// ────────────────────────────────────────────────────────────
// Sobre las compras del día, cruza por codigo_interno contra la lista
// VIVA (neo_lista_items) y recalcula la utilidad de HOY (no la congelada
// al comprar). Sugiere el precio para mantener la meta y, con el piso
// duro de la empresa, marca lo que se vende bajo costo o bajo el 20%.
//
// NEO es dueño de los precios: esta pantalla SOLO lee y sugiere. El
// precio se cambia a mano en NEO; el siguiente sync recalcula y
// auto-resuelve las alertas corregidas (anti-ruido).
//
// El cálculo vive en el RPC recalcular_revision_compras() (server-side),
// que también se dispara solo tras cada sync (ver migración).
// ────────────────────────────────────────────────────────────

const ACENTO = '#ED6E2E'; // naranja de marca, solo en botón de acción

// Formatea una fecha ('2026-05-20' o '2026-05-26 00:00:00') a DD/MM/YYYY
function fmtFecha(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// markup (sobre costo) → margen (sobre venta)
function markupAMargen(mk) {
  const m = Number(mk);
  if (!isFinite(m)) return null;
  return (m / (1 + m / 100));
}

// Clasificación visual de una fila de "Compras del día".
// El estado real lo decide el RPC; acá solo elegimos etiqueta/color/orden.
function clasificar(r, piso, umbral) {
  const mk = Number(r.markup_actual_pct);
  const meta = r.markup_meta_pct != null ? Number(r.markup_meta_pct) : null;
  const faded = r.estado === 'marcado';
  let c;
  if (!isFinite(mk))          c = { key: 'ok', sev: 8, emoji: '⚪', label: 'Sin datos vivos', color: '#9ca3af' };
  else if (mk < 0)            c = { key: 'perdida', sev: 0, emoji: '🔴', label: 'Pérdida — vendiendo bajo costo', color: '#dc2626' };
  else if (mk < piso)         c = { key: 'bajo_piso', sev: 1, emoji: '🔴', label: `Bajo el piso de ${piso}%`, color: '#dc2626' };
  else if (r.estado === 'inflada' || (faded && meta != null && mk > meta + 5))
                              c = { key: 'inflada', sev: 3, emoji: '🟢', label: 'Utilidad inflada — podés bajar y competir', color: '#16a34a' };
  else if (meta != null && mk < meta - umbral)
                              c = { key: 'cayo', sev: 2, emoji: '🟠', label: 'Cayó bajo tu meta', color: '#f97316' };
  else                        c = { key: 'ok', sev: 6, emoji: '⚪', label: 'Sin cambios / OK', color: '#9ca3af' };
  if (faded) return { ...c, sev: c.sev + 10, faded: true, label: 'Marcado — pendiente de aplicar en NEO', emoji: '✅', color: '#6b7280' };
  return c;
}

export default function RevisionComprasTab() {
  const [vista, setVista] = useState('dia'); // 'dia' | 'barrido'

  // Umbrales (settings persistidos)
  const [umbral, setUmbral] = useState(10);
  const [umbralSup, setUmbralSup] = useState(15);
  const [piso, setPiso] = useState(20);
  const [fechaDesde, setFechaDesde] = useState('2026-06-01');
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  const [diaRows, setDiaRows] = useState([]);
  const [barridoRows, setBarridoRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [copiado, setCopiado] = useState(null);
  const [recalcInfo, setRecalcInfo] = useState(null);

  // 1) Cargar settings
  useEffect(() => {
    supabase.from('pricing_revision_settings').select('*').eq('id', 1).maybeSingle()
      .then(({ data }) => {
        if (data) {
          setUmbral(Number(data.umbral_pp ?? 10));
          setUmbralSup(Number(data.umbral_superior_pp ?? 15));
          setPiso(Number(data.piso_pp ?? 20));
          if (data.fecha_desde) setFechaDesde(String(data.fecha_desde).slice(0, 10));
        }
        setSettingsLoaded(true);
      });
  }, []);

  // 2) Cargar "Compras del día". Mostramos PRIMERO lo que ya está calculado
  //    (rápido y a prueba de fallos) y luego, si corresponde, recalculamos en
  //    segundo plano y refrescamos. Así un fallo o demora del recálculo nunca
  //    deja la lista vacía.
  const cargarDia = useCallback(async (recalcular = true) => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.rpc('pricing_revision_compras_dia');
      if (error) throw error;
      setDiaRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
    // Recalcular en segundo plano (respaldo §7.3) y refrescar sin bloquear la vista
    if (recalcular) {
      try {
        const { data: rc } = await supabase.rpc('recalcular_revision_compras');
        setRecalcInfo(rc || null);
        const { data } = await supabase.rpc('pricing_revision_compras_dia');
        if (Array.isArray(data)) setDiaRows(data);
      } catch { /* el recálculo también corre solo tras cada sync; no bloquea */ }
    }
  }, []);

  const cargarBarrido = useCallback(async (pisoVal) => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase.rpc('pricing_barrido_catalogo', { p_piso: pisoVal });
      if (error) throw error;
      setBarridoRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!settingsLoaded) return;
    if (vista === 'dia') cargarDia(true);
    else cargarBarrido(piso);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsLoaded, vista]);

  // Guardar umbrales y re-correr el cálculo con los nuevos valores
  const aplicarUmbrales = async () => {
    setLoading(true); setError(null);
    try {
      await supabase.from('pricing_revision_settings').upsert({
        id: 1, umbral_pp: umbral, umbral_superior_pp: umbralSup, piso_pp: piso,
        fecha_desde: fechaDesde || '2026-06-01',
        actualizado_en: new Date().toISOString(),
      }, { onConflict: 'id' });
      if (vista === 'dia') await cargarDia(true);
      else await cargarBarrido(piso);
    } catch (e) {
      setError(e.message || String(e));
      setLoading(false);
    }
  };

  // ── Acciones por fila ──────────────────────────────────────
  const copiarPrecio = async (r, marcar = true) => {
    const precio = Math.round(Number(r.precio_sugerido || 0));
    try { await navigator.clipboard.writeText(String(precio)); } catch { /* clipboard no disponible */ }
    setCopiado(r.codigo_interno);
    setTimeout(() => setCopiado(c => (c === r.codigo_interno ? null : c)), 1800);
    if (marcar && vista === 'dia') {
      await supabase.from('pricing_revision_compras')
        .update({ estado: 'marcado', actualizado_en: new Date().toISOString() })
        .eq('codigo_interno', r.codigo_interno);
      setDiaRows(rows => rows.map(x => x.codigo_interno === r.codigo_interno ? { ...x, estado: 'marcado' } : x));
    }
  };

  // "Ya lo revisé": dismiss durable. Sale de la lista y no vuelve salvo que
  // se vuelva crítico (pérdida / bajo el piso). El sync respeta este 'resuelto'.
  const marcarRevisado = async (r) => {
    await supabase.from('pricing_revision_compras')
      .update({ estado: 'resuelto', resuelto_en: new Date().toISOString(), actualizado_en: new Date().toISOString() })
      .eq('codigo_interno', r.codigo_interno);
    setDiaRows(rows => rows.filter(x => x.codigo_interno !== r.codigo_interno));
  };

  const ocultar = async (r) => {
    await supabase.from('items_ocultos_compras').upsert({
      codigo: r.codigo_interno,
      proveedor: r.proveedor || '',
      oculto_por: 'pricing',
      fecha_oculto: new Date().toISOString(),
      motivo: 'Revisión de compras',
    }, { onConflict: 'codigo,proveedor' });
    if (vista === 'dia') setDiaRows(rows => rows.filter(x => x.codigo_interno !== r.codigo_interno));
    else setBarridoRows(rows => rows.filter(x => x.codigo_interno !== r.codigo_interno));
  };

  // ── Compras del día: filtrado + clasificación + orden ──────
  const diaClasificado = useMemo(() => {
    const q = search.trim().toLowerCase();
    return diaRows
      .map(r => ({ ...r, _cat: clasificar(r, piso, umbral) }))
      .filter(r => {
        if (!q) return true;
        return (r.codigo_interno + ' ' + (r.item || '') + ' ' + (r.proveedor || '')).toLowerCase().includes(q);
      })
      .sort((a, b) => a._cat.sev - b._cat.sev || Number(a.markup_actual_pct) - Number(b.markup_actual_pct));
  }, [diaRows, piso, umbral, search]);

  const kpis = useMemo(() => {
    let perdida = 0, bajoPiso = 0, cayo = 0, inflada = 0;
    diaRows.forEach(r => {
      if (r.estado === 'marcado') return; // ya en proceso, no cuenta como pendiente
      const c = clasificar(r, piso, umbral);
      if (c.key === 'perdida') perdida++;
      else if (c.key === 'bajo_piso') bajoPiso++;
      else if (c.key === 'cayo') cayo++;
      else if (c.key === 'inflada') inflada++;
    });
    return { enRevision: diaRows.length, perdida, bajoPiso, cayo, inflada };
  }, [diaRows, piso, umbral]);

  const urgentes = kpis.perdida + kpis.bajoPiso;

  // ── Barrido: filtrado + categorías ─────────────────────────
  const barridoFiltrado = useMemo(() => {
    const q = search.trim().toLowerCase();
    return barridoRows.filter(r => {
      if (!q) return true;
      return (r.codigo_interno + ' ' + (r.item || '') + ' ' + (r.proveedor || '')).toLowerCase().includes(q);
    });
  }, [barridoRows, search]);

  const barridoKpis = useMemo(() => {
    let perdida = 0, bajoPiso = 0, borde = 0;
    barridoRows.forEach(r => {
      const mk = Number(r.markup_pct);
      if (mk < 0) perdida++;
      else if (mk < piso) bajoPiso++;
      else borde++;
    });
    return { perdida, bajoPiso, borde, total: barridoRows.length };
  }, [barridoRows, piso]);

  return (
    <div>
      {/* Sub-tabs de vista */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        {[{ id: 'dia', label: '🛒 Compras del día' }, { id: 'barrido', label: '🧹 Barrido del catálogo' }].map(v => (
          <button key={v.id} onClick={() => setVista(v.id)} style={{
            padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            border: '1px solid ' + (vista === v.id ? '#5E2733' : 'rgba(94,39,51,0.2)'),
            background: vista === v.id ? '#5E2733' : 'white',
            color: vista === v.id ? 'white' : '#5E2733',
          }}>{v.label}</button>
        ))}
      </div>

      {/* Controles de umbral */}
      <div style={{
        background: 'rgba(255,255,255,0.6)', backdropFilter: 'blur(20px)',
        border: '1px solid rgba(94,39,51,0.1)', borderRadius: 12, padding: '12px 16px',
        marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'flex-end',
      }}>
        <Control label="Avisame si la utilidad cae más de (pp)" value={umbral} onChange={setUmbral} />
        <Control label="Avisame si se infla más de (pp)" value={umbralSup} onChange={setUmbralSup} />
        <Control label="Piso mínimo de la empresa (% markup)" value={piso} onChange={setPiso} />
        {vista === 'dia' && (
          <label style={{ fontSize: 11, color: '#5E2733', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
            Mostrar compras desde
            <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 13 }} />
          </label>
        )}
        <button onClick={aplicarUmbrales} disabled={loading} style={{
          padding: '8px 16px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none',
          background: loading ? '#9ca3af' : '#c8a84b', color: 'white', cursor: loading ? 'wait' : 'pointer',
        }}>{loading ? 'Calculando…' : 'Aplicar'}</button>
        <input type="text" placeholder="Buscar SKU, ítem, proveedor…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ marginLeft: 'auto', padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 12, minWidth: 240 }} />
      </div>

      <div style={{
        background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 10, padding: 10,
        marginBottom: 14, fontSize: 12, color: '#3730a3',
      }}>
        💡 <b>Markup</b> = utilidad sobre el costo · <b>Margen</b> = utilidad sobre la venta (ej.: 40% markup ≈ 28,6% margen).
        Todo se calcula <b>sin IVA</b> y con el precio/costo <b>vivo de hoy</b>. NEO sigue siendo el dueño del precio: acá solo se sugiere.
      </div>

      {error && <div style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>⚠️ {error}</div>}

      {vista === 'dia' ? (
        <>
          {/* KPIs del día */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            <KpiCard label="En revisión activa" value={fmtNum(kpis.enRevision)} color="#5E2733" />
            <KpiCard label="🔴 Pérdida" value={fmtNum(kpis.perdida)} color="#dc2626" />
            <KpiCard label={`🔴 Bajo el piso ${piso}%`} value={fmtNum(kpis.bajoPiso)} color="#dc2626" />
            <KpiCard label="🟠 Cayó utilidad" value={fmtNum(kpis.cayo)} color="#f97316" />
            <KpiCard label="🟢 Utilidad inflada" value={fmtNum(kpis.inflada)} color="#16a34a" />
          </div>

          {urgentes > 0 && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: 12, marginBottom: 14, fontSize: 13, color: '#991b1b', fontWeight: 600 }}>
              🚨 {fmtNum(urgentes)} producto(s) se está(n) vendiendo por debajo del costo o del piso de {piso}%. Revisalo de primero.
            </div>
          )}

          <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>
            Mostrando compras desde el {fmtFecha(fechaDesde) || fechaDesde} · {fmtNum(diaRows.length)} ítems en revisión activa
            {recalcInfo?.ultima_carga ? ` · último sync: ${String(recalcInfo.ultima_carga).slice(0, 10)}` : ''}
          </div>

          {loading && diaRows.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center', color: '#6b7280' }}>Recalculando utilidad de hoy…</div>
          ) : diaClasificado.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>
              ✅ Nada que revisar: las compras del día están dentro de tu meta y del piso.
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              {diaClasificado.map(r => (
                <TarjetaDia key={r.codigo_interno} r={r} piso={piso}
                  copiado={copiado === r.codigo_interno}
                  onCopiar={() => copiarPrecio(r)} onRevisar={() => marcarRevisado(r)} onOcultar={() => ocultar(r)} />
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          {/* KPIs del barrido */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 14 }}>
            <KpiCard label="🔴 Con pérdida" value={fmtNum(barridoKpis.perdida)} color="#dc2626" />
            <KpiCard label={`🔴 Bajo el piso ${piso}%`} value={fmtNum(barridoKpis.bajoPiso)} color="#dc2626" />
            <KpiCard label={`🟡 Al borde (${piso}–${piso + 10}%)`} value={fmtNum(barridoKpis.borde)} color="#ca8a04" />
            <KpiCard label="Total en el barrido" value={fmtNum(barridoKpis.total)} color="#5E2733" />
          </div>

          <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 10, padding: 10, marginBottom: 14, fontSize: 12, color: '#92400e' }}>
            🧹 Recorre <b>todo el catálogo activo</b> (no solo lo comprado hoy) y lista lo que está por debajo del piso de {piso}% de markup.
            Cuando subís el precio en NEO, el próximo sync lo saca solo. Los ítems ocultos no se muestran.
          </div>

          {loading && barridoRows.length === 0 ? (
            <div style={{ padding: 50, textAlign: 'center', color: '#6b7280' }}>Barriendo el catálogo…</div>
          ) : barridoFiltrado.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#16a34a', fontWeight: 600 }}>✅ Nada bajo el piso. Todo el catálogo activo está sano.</div>
          ) : (
            <div style={{ overflow: 'auto', maxHeight: '60vh', border: '1px solid #e5e7eb', borderRadius: 10, background: 'white' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, background: '#5E2733', zIndex: 2 }}>
                  <tr>
                    {['', 'SKU', 'Ítem', 'Categoría', 'Existencias', 'Costo', 'Precio', 'Markup', 'Margen', `Sugerido (piso ${piso}%)`, ''].map((h, i) => (
                      <th key={i} style={{ padding: '8px 10px', color: 'white', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {barridoFiltrado.slice(0, 1000).map(r => {
                    const mk = Number(r.markup_pct);
                    const sev = mk < 0 ? { e: '🔴', c: '#dc2626' } : mk < piso ? { e: '🔴', c: '#dc2626' } : { e: '🟡', c: '#ca8a04' };
                    return (
                      <tr key={r.codigo_interno} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ ...cell, textAlign: 'center' }}>{sev.e}</td>
                        <td style={cellMono}>{r.codigo_interno}</td>
                        <td style={cell} title={r.item}>{(r.item || '').slice(0, 50)}</td>
                        <td style={{ ...cell, color: '#6b7280', fontSize: 11 }}>{r.categoria}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{fmtNum(r.existencias, 0)}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{fmtCRC(r.costo_vivo)}</td>
                        <td style={{ ...cell, textAlign: 'right' }}>{fmtCRC(r.precio_vivo)}</td>
                        <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: sev.c }}>{fmtPct(r.markup_pct)}</td>
                        <td style={{ ...cell, textAlign: 'right', color: '#6b7280' }}>{fmtPct(r.margen_pct)}</td>
                        <td style={{ ...cell, textAlign: 'right', fontWeight: 700, color: '#16a34a' }}>{fmtCRC(r.precio_sugerido)}</td>
                        <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                          <button onClick={() => copiarPrecio(r, false)} style={btnAccion}>{copiado === r.codigo_interno ? '✓ Copiado' : 'Copiar'}</button>
                          <button onClick={() => ocultar(r)} style={btnSec}>Ocultar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {barridoFiltrado.length > 1000 && (
                <div style={{ padding: 8, textAlign: 'center', fontSize: 11, color: '#9ca3af', background: '#f9fafb' }}>
                  Mostrando 1000 de {fmtNum(barridoFiltrado.length)} SKUs
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Tarjeta de "Compras del día" ──────────────────────────────
function TarjetaDia({ r, piso, copiado, onCopiar, onRevisar, onOcultar }) {
  const cat = r._cat;
  const metaMk = r.markup_meta_pct != null ? Number(r.markup_meta_pct) : null;
  const metaMg = markupAMargen(metaMk);
  const mkAhora = Number(r.markup_actual_pct);
  const mgAhora = Number(r.margen_actual_pct);
  const ca = Number(r.costo_anterior);
  const cn = Number(r.costo_compra);
  const cambioCosto = (isFinite(ca) && ca > 0 && isFinite(cn)) ? ((cn - ca) / ca * 100) : null;
  const subio = cambioCosto != null && cambioCosto > 0;

  // Texto de sugerencia según categoría
  let sugerencia = null;
  if (r.precio_sugerido != null) {
    if (cat.key === 'inflada') {
      const z = metaMk != null ? fmtPct(metaMk) : 'tu meta';
      sugerencia = <>Podés <b>bajar</b> a <b>{fmtCRC(r.precio_sugerido)}</b> y seguís ganando {z} de markup — más competitivo.</>;
    } else if (cat.key === 'perdida' || cat.key === 'bajo_piso' || cat.key === 'cayo') {
      const z = metaMk != null ? fmtPct(Math.max(metaMk, piso)) : `${piso}%`;
      sugerencia = <>Para volver a {z} de utilidad: <b>subí el precio a {fmtCRC(r.precio_sugerido)}</b>.</>;
    }
  }

  return (
    <div style={{
      background: 'white', border: `1px solid ${cat.color}33`, borderLeft: `4px solid ${cat.color}`,
      borderRadius: 12, padding: '12px 16px', opacity: cat.faded ? 0.6 : 1,
      boxShadow: '0 1px 4px rgba(94,39,51,0.05)',
    }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 280px', minWidth: 240 }}>
          <div style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, color: 'white', background: cat.color, borderRadius: 999, padding: '2px 10px', marginBottom: 6 }}>
            {cat.emoji} {cat.label}
          </div>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#1f2937' }}>{r.item || r.codigo_interno}</div>
          <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
            <span style={{ fontFamily: "'JetBrains Mono','Menlo',monospace" }}>{r.codigo_interno}</span>
            {r.proveedor ? ` · ${r.proveedor}` : ''}{r.categoria ? ` · ${r.categoria}` : ''}
            {r.cantidad != null ? ` · compró ${fmtNum(r.cantidad, 0)}` : ''}
          </div>
          {(fmtFecha(r.fecha_compra) || fmtFecha(r.ultima_compra)) && (
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 3, fontWeight: 600 }}>
              🗓️ Última compra: {fmtFecha(r.fecha_compra) || fmtFecha(r.ultima_compra)}
              {fmtFecha(r.ultima_compra) && fmtFecha(r.ultima_compra) !== fmtFecha(r.fecha_compra)
                ? <span style={{ color: '#9ca3af', fontWeight: 400 }}> · en catálogo: {fmtFecha(r.ultima_compra)}</span>
                : null}
            </div>
          )}
        </div>

        {/* Stats */}
        <div style={{ flex: '1 1 320px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px,1fr))', gap: 8 }}>
          <Stat label="Costo">
            <span>{fmtCRC(ca)}</span>
            <span style={{ color: '#9ca3af' }}> → </span>
            <span style={{ fontWeight: 700 }}>{fmtCRC(cn)}</span>
            {cambioCosto != null && (
              <span style={{ color: subio ? '#dc2626' : '#16a34a', fontWeight: 700, marginLeft: 4 }}>
                {subio ? '▲' : '▼'}{fmtPct(Math.abs(cambioCosto))}
              </span>
            )}
          </Stat>
          <Stat label="Precio de venta (vivo)">
            <span style={{ fontWeight: 700 }}>{fmtCRC(r.precio_vivo)}</span>
          </Stat>
          <Stat label="Utilidad">
            <div style={{ fontSize: 11, color: '#6b7280' }}>
              antes {metaMk != null ? fmtPct(metaMk) : '—'} mk · {metaMg != null ? fmtPct(metaMg) : '—'} mg
            </div>
            <div style={{ fontSize: 12, fontWeight: 700, color: cat.color }}>
              ahora {isFinite(mkAhora) ? fmtPct(mkAhora) : '—'} mk · {isFinite(mgAhora) ? fmtPct(mgAhora) : '—'} mg
            </div>
          </Stat>
        </div>
      </div>

      {sugerencia && (
        <div style={{ marginTop: 10, padding: '8px 12px', background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 8, fontSize: 12.5, color: '#374151', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 1, minWidth: 200 }}>{sugerencia}</span>
          <button onClick={onCopiar} style={btnAccion}>{copiado ? '✓ Copiado' : '📋 Copiar precio'}</button>
          <button onClick={onRevisar} style={btnSec}>Ya lo revisé</button>
          <button onClick={onOcultar} style={btnSec}>Ocultar</button>
        </div>
      )}
      {!sugerencia && (
        <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onRevisar} style={btnSec}>Ya lo revisé</button>
          <button onClick={onOcultar} style={btnSec}>Ocultar</button>
        </div>
      )}
    </div>
  );
}

function Control({ label, value, onChange }) {
  return (
    <label style={{ fontSize: 11, color: '#5E2733', fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label}
      <input type="number" value={value} step={1} min={0}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        style={{ padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 8, width: 90, fontSize: 13 }} />
    </label>
  );
}

function Stat({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 12.5, color: '#1f2937', marginTop: 2 }}>{children}</div>
    </div>
  );
}

function KpiCard({ label, value, color }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.7)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.6)', borderRadius: 12, padding: '12px 14px', boxShadow: '0 2px 8px rgba(94,39,51,0.06)' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color, marginTop: 4 }}>{value}</div>
    </div>
  );
}

const cell = { padding: '6px 10px', color: '#1f2937', whiteSpace: 'nowrap' };
const cellMono = { ...cell, fontFamily: "'JetBrains Mono','Menlo',monospace" };
const btnAccion = {
  padding: '6px 12px', fontSize: 12, fontWeight: 700, border: 'none', borderRadius: 8,
  background: ACENTO, color: 'white', cursor: 'pointer', marginRight: 6,
};
const btnSec = {
  padding: '6px 12px', fontSize: 12, fontWeight: 600, border: '1px solid #d1d5db', borderRadius: 8,
  background: 'white', color: '#374151', cursor: 'pointer', marginRight: 6,
};
