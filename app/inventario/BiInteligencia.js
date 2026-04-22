'use client'
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const fmtCRC = (n) => '₡' + (Number(n) || 0).toLocaleString('es-CR', { maximumFractionDigits: 0 })
const fmtN = (n) => (Number(n) || 0).toLocaleString('es-CR', { maximumFractionDigits: 0 })
const fmtPct = (n) => { const v = Number(n) || 0; return (v >= 0 ? '+' : '') + v.toFixed(1) + '%' }

const FONT = 'Rubik, sans-serif'
const card = { background:'rgba(255,255,255,0.55)', backdropFilter:'blur(24px) saturate(1.8)', WebkitBackdropFilter:'blur(24px) saturate(1.8)', border:'1px solid rgba(255,255,255,0.6)', borderRadius:20, padding:'20px', marginBottom:'16px', boxShadow:'0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' }
const inner = { background:'rgba(255,255,255,0.4)', backdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.5)', borderRadius:14, padding:'14px 18px' }
const COL = { title:'rgba(0,0,0,0.85)', label:'rgba(0,0,0,0.5)', body:'rgba(0,0,0,0.7)' }
const GOLD = '#c8a84b', RED = '#dc2626', GREEN = '#15803d', ORANGE = '#ea580c'

const TABS = [
  { key:'muertos', icon:'💀', label:'Inventario Muerto' },
  { key:'overstock', icon:'📦', label:'Sobrestock' },
  { key:'liquidar', icon:'🔻', label:'Liquidar' },
  { key:'reforzar', icon:'🔺', label:'Reforzar' },
  { key:'trends', icon:'📊', label:'Tendencias' },
]

function KPI({ label, value, color }) {
  return (
    <div style={{ ...inner, flex:'1 1 0', minWidth:140, textAlign:'center' }}>
      <div style={{ fontSize:12, color:COL.label, fontFamily:FONT, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:20, fontWeight:700, color: color || COL.title, fontFamily:FONT }}>{value}</div>
    </div>
  )
}

function Table({ columns, rows }) {
  if (!rows || rows.length === 0) return (
    <div style={{ textAlign:'center', padding:40, color:COL.label, fontFamily:FONT }}>No hay datos disponibles para esta vista.</div>
  )
  return (
    <div style={{ overflowX:'auto', borderRadius:14, border:'1px solid rgba(255,255,255,0.5)' }}>
      <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:FONT, fontSize:13 }}>
        <thead>
          <tr>{columns.map((c, i) => (
            <th key={i} style={{ padding:'10px 12px', textAlign: c.align || 'left', color:COL.label, fontWeight:600, fontSize:11, textTransform:'uppercase', borderBottom:'1px solid rgba(0,0,0,0.08)', background:'rgba(255,255,255,0.3)', whiteSpace:'nowrap' }}>{c.label}</th>
          ))}</tr>
        </thead>
        <tbody>{rows.map((r, ri) => (
          <tr key={ri} style={{ borderBottom:'1px solid rgba(0,0,0,0.04)' }}>
            {columns.map((c, ci) => (
              <td key={ci} style={{ padding:'8px 12px', textAlign: c.align || 'left', color: c.color ? c.color(r) : COL.body, fontWeight: c.bold ? 700 : 400, whiteSpace:'nowrap', maxWidth: c.maxW || 'none', overflow:'hidden', textOverflow:'ellipsis' }}>
                {c.render ? c.render(r) : (r[c.key] ?? '—')}
              </td>
            ))}
          </tr>
        ))}</tbody>
      </table>
    </div>
  )
}

function Badge({ text, color }) {
  return <span style={{ display:'inline-block', padding:'2px 10px', borderRadius:20, fontSize:11, fontWeight:600, color:'#fff', background: color }}>{text}</span>
}

function cobColor(m) { const v = Number(m) || 0; return v > 12 ? RED : v >= 6 ? ORANGE : GOLD }
function tendColor(t) { return t === 'bajando' ? RED : t === 'subiendo' ? GREEN : '#888' }

// Umbral de días en inventario antes de clasificar un producto como problema
// (muerto / sobrestock / liquidar). Productos con menos de N días desde la
// última entrada de stock se consideran "nuevos" y quedan fuera de alertas.
const DIAS_MIN_INVENTARIO = 30

// Mapa {codigo → { ultima_venta, ultima_compra }} desde neo_lista_items.
// Esta tabla es el reporte "Lista de ítems" de NEO: trae un renglón por
// producto con las fechas resumen oficiales, evitando tener que agregar
// 180 días de transacciones facturadas para calcular "última venta".
async function cargarResumenItems() {
  let offset = 0
  const BATCH = 1000
  const map = {}
  while (true) {
    const { data, error } = await supabase
      .from('neo_lista_items')
      .select('codigo_interno,ultima_compra,ultima_venta')
      .range(offset, offset + BATCH - 1)
    if (error || !data || !data.length) break
    data.forEach(r => {
      const cod = (r.codigo_interno || '').toString().trim()
      if (!cod) return
      map[cod] = { ultima_compra: r.ultima_compra || null, ultima_venta: r.ultima_venta || null }
    })
    if (data.length < BATCH) break
    offset += BATCH
  }
  return map
}

// Aplica el filtro de 30 días contra la última compra de neo_lista_items.
// Devuelve true si el producto ya lleva suficiente tiempo en inventario como
// para ser evaluado (o si no hay registro de compra → se asume viejo).
function yaEvaluable(codigo, resumenMap) {
  const cod = (codigo || '').toString().trim()
  const f = resumenMap[cod]?.ultima_compra
  if (!f) return true
  const dias = Math.floor((Date.now() - new Date(f).getTime()) / 86400000)
  return dias >= DIAS_MIN_INVENTARIO
}

// Sobreescribe la fecha ultima_venta del RPC con la del reporte oficial de
// NEO cuando está disponible. Los RPCs bi_* calculan ultima_venta agregando
// neo_items_facturados que sólo trae el mes actual, y quedan desactualizados
// para productos con baja rotación.
function enriquecerFechas(rows, resumenMap) {
  return rows.map(row => {
    const info = resumenMap[(row.codigo || '').toString().trim()]
    if (!info) return row
    return {
      ...row,
      ultima_venta: info.ultima_venta || row.ultima_venta || null,
      ultima_compra: info.ultima_compra || row.ultima_compra || null,
    }
  })
}

export default function BiInteligencia() {
  const [activeTab, setActiveTab] = useState('muertos')
  const [loading, setLoading] = useState(true)
  const [deadStock, setDeadStock] = useState([])
  const [overstock, setOverstock] = useState([])
  const [liquidar, setLiquidar] = useState([])
  const [reforzar, setReforzar] = useState([])
  const [trends, setTrends] = useState([])

  useEffect(() => {
    async function load() {
      setLoading(true)
      const [rpcs, resumenMap] = await Promise.all([
        Promise.allSettled([
          supabase.rpc('bi_dead_stock'),
          supabase.rpc('bi_overstock_alerts'),
          supabase.rpc('bi_liquidar_candidates'),
          supabase.rpc('bi_reforzar_candidates'),
          supabase.rpc('bi_trend_analysis'),
        ]).then(results => results.map(res => res.status === 'fulfilled' ? res.value : { data: [], error: res.reason })),
        cargarResumenItems(),
      ])
      const [d, o, l, r, t] = rpcs
      const dead = enriquecerFechas(Array.isArray(d.data) ? d.data : [], resumenMap)
      const over = enriquecerFechas(Array.isArray(o.data) ? o.data : [], resumenMap)
      const liq  = enriquecerFechas(Array.isArray(l.data) ? l.data : [], resumenMap)
      const ref  = enriquecerFechas(Array.isArray(r.data) ? r.data : [], resumenMap)
      const trd  = Array.isArray(t.data) ? t.data : []
      const deadFilt = dead.filter(row => yaEvaluable(row.codigo, resumenMap))
      const overFilt = over.filter(row => yaEvaluable(row.codigo, resumenMap))
      const liqFilt  = liq.filter(row => yaEvaluable(row.codigo, resumenMap))
      console.log('BI Inteligencia RPCs:', {
        dead: dead.length, dead_filtrado: deadFilt.length, dead_err: d.error,
        over: over.length, over_filtrado: overFilt.length,
        liq: liq.length, liq_filtrado: liqFilt.length,
        ref: ref.length, trends: trd.length, trends_err: t.error,
      })
      setDeadStock(deadFilt)
      setOverstock(overFilt)
      setLiquidar(liqFilt)
      setReforzar(ref)
      setTrends(trd)
      setLoading(false)
    }
    load()
  }, [])

  const trunc = (s, n = 40) => { const v = s || ''; return v.length > n ? v.slice(0, n) + '...' : v }

  // KPI computations
  const deadKpis = () => {
    const total = deadStock.reduce((s, r) => s + (Number(r.capital_atado) || 0), 0)
    const max = deadStock.reduce((m, r) => Math.max(m, Number(r.capital_atado) || 0), 0)
    return [
      { label:'Total Capital Atado', value: fmtCRC(total), color: RED },
      { label:'# Productos Muertos', value: fmtN(deadStock.length) },
      { label:'Mayor Capital Atado', value: fmtCRC(max), color: ORANGE },
    ]
  }
  const overKpis = () => {
    const total = overstock.reduce((s, r) => s + (Number(r.capital_atado) || 0), 0)
    const avgM = overstock.length ? overstock.reduce((s, r) => s + (Number(r.meses_cobertura) || 0), 0) / overstock.length : 0
    return [
      { label:'Capital Atado Total', value: fmtCRC(total), color: RED },
      { label:'# Productos Sobrestock', value: fmtN(overstock.length) },
      { label:'Prom. Meses Cobertura', value: avgM.toFixed(1), color: ORANGE },
    ]
  }
  const liqKpis = () => {
    const total = liquidar.reduce((s, r) => s + (Number(r.capital_atado) || 0), 0)
    return [
      { label:'Capital en Riesgo Total', value: fmtCRC(total), color: RED },
      { label:'# Productos a Evaluar', value: fmtN(liquidar.length) },
    ]
  }
  const refKpis = () => {
    const avgC = reforzar.length ? reforzar.reduce((s, r) => s + (Number(r.meses_cobertura) || 0), 0) / reforzar.length : 0
    return [
      { label:'# Productos a Reforzar', value: fmtN(reforzar.length), color: GREEN },
      { label:'Promedio Cobertura', value: avgC.toFixed(1) + ' meses' },
    ]
  }
  const trendKpis = () => {
    const sub = trends.filter(r => r.tendencia === 'subiendo').length
    const baj = trends.filter(r => r.tendencia === 'bajando').length
    const est = trends.filter(r => r.tendencia === 'estable').length
    return [
      { label:'# Subiendo', value: fmtN(sub), color: GREEN },
      { label:'# Bajando', value: fmtN(baj), color: RED },
      { label:'# Estable', value: fmtN(est) },
    ]
  }

  // Column defs
  const deadCols = [
    { key:'codigo', label:'Codigo' },
    { key:'nombre', label:'Nombre', render: r => trunc(r.nombre), maxW:260 },
    { key:'categoria', label:'Categoria' },
    { key:'existencias', label:'Existencias', align:'right' },
    { key:'ultimo_costo', label:'Costo Unit', align:'right', render: r => fmtCRC(r.ultimo_costo) },
    { key:'capital_atado', label:'Capital Atado', align:'right', render: r => fmtCRC(r.capital_atado), color: () => RED, bold:true },
    { key:'ultima_venta', label:'Última Venta', render: r => r.ultima_venta || 'Nunca' },
  ]
  const overCols = [
    { key:'codigo', label:'Codigo' },
    { key:'nombre', label:'Nombre', render: r => trunc(r.nombre), maxW:240 },
    { key:'existencias', label:'Existencias', align:'right' },
    { key:'venta_mensual', label:'Prom.Mensual', align:'right', render: r => fmtN(r.venta_mensual) },
    { key:'meses_cobertura', label:'Meses Cobertura', align:'right', render: r => <span style={{ color: cobColor(r.meses_cobertura), fontWeight:600 }}>{Number(r.meses_cobertura || 0).toFixed(1)}</span> },
    { key:'capital_atado', label:'Capital Atado', align:'right', render: r => fmtCRC(r.capital_atado), color: () => RED, bold:true },
  ]
  const liqCols = [
    { key:'codigo', label:'Codigo' },
    { key:'nombre', label:'Nombre', render: r => trunc(r.nombre), maxW:240 },
    { key:'existencias', label:'Existencias', align:'right' },
    { key:'venta_mensual', label:'Prom.Mensual', align:'right', render: r => fmtN(r.venta_mensual) },
    { key:'meses_cobertura', label:'Meses Cobertura', align:'right', render: r => Number(r.meses_cobertura || 0).toFixed(1) },
    { key:'margen_pct', label:'Margen %', align:'right', render: r => fmtPct(r.margen_pct) },
    { key:'capital_atado', label:'Capital Atado', align:'right', render: r => fmtCRC(r.capital_atado), color: () => RED, bold:true },
  ]
  const refCols = [
    { key:'codigo', label:'Codigo' },
    { key:'nombre', label:'Nombre', render: r => trunc(r.nombre), maxW:240 },
    { key:'existencias', label:'Existencias', align:'right' },
    { key:'venta_mensual', label:'Prom.Mensual', align:'right', render: r => fmtN(r.venta_mensual) },
    { key:'meses_cobertura', label:'Cobertura Meses', align:'right', render: r => Number(r.meses_cobertura || 0).toFixed(1) },
    { key:'capital_potencial', label:'Potencial Ventas 3m', align:'right', render: r => fmtCRC(r.capital_potencial) },
  ]
  const trendCols = [
    { key:'codigo', label:'Codigo' },
    { key:'nombre', label:'Nombre', render: r => trunc(r.nombre), maxW:240 },
    { key:'venta_periodo2', label:'Ventas Actual (30d)', align:'right', render: r => fmtN(r.venta_periodo2) },
    { key:'venta_periodo1', label:'Ventas Anterior (30d)', align:'right', render: r => fmtN(r.venta_periodo1) },
    { key:'cambio_pct', label:'Cambio %', align:'right', render: r => <span style={{ color: Number(r.cambio_pct) >= 0 ? GREEN : RED, fontWeight:600 }}>{fmtPct(r.cambio_pct)}</span> },
    { key:'tendencia', label:'Tendencia', render: r => {
      const t = r.tendencia; const icon = t === 'subiendo' ? '↗' : t === 'bajando' ? '↘' : '→'
      return <Badge text={`${icon} ${t || 'estable'}`} color={tendColor(t)} />
    }},
  ]

  const tabContent = {
    muertos: { kpis: deadKpis(), cols: deadCols, rows: deadStock },
    overstock: { kpis: overKpis(), cols: overCols, rows: overstock },
    liquidar: { kpis: liqKpis(), cols: liqCols, rows: liquidar },
    reforzar: { kpis: refKpis(), cols: refCols, rows: reforzar },
    trends: { kpis: trendKpis(), cols: trendCols, rows: trends },
  }

  const current = tabContent[activeTab]

  return (
    <div style={{ fontFamily:FONT }}>
      {/* Sub-tab pills */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:18 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
            padding:'8px 16px', borderRadius:20, border: activeTab === t.key ? `2px solid ${GOLD}` : '1px solid rgba(0,0,0,0.1)',
            background: activeTab === t.key ? 'rgba(200,168,75,0.15)' : 'rgba(255,255,255,0.5)',
            color: activeTab === t.key ? GOLD : COL.body, fontWeight: activeTab === t.key ? 700 : 500,
            fontSize:13, cursor:'pointer', fontFamily:FONT, backdropFilter:'blur(8px)', transition:'all 0.2s',
          }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ ...card, textAlign:'center', padding:60 }}>
          <div style={{ fontSize:14, color:COL.label }}>Cargando inteligencia de inventario...</div>
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:16 }}>
            {current.kpis.map((k, i) => <KPI key={i} label={k.label} value={k.value} color={k.color} />)}
          </div>
          {/* Data table */}
          <div style={card}>
            <Table columns={current.cols} rows={current.rows} />
          </div>
        </>
      )}
    </div>
  )
}
