'use client';
import { useState } from 'react';

const GOLD = '#c8a84b';
const S = {
  page:      { background:'linear-gradient(135deg, #e8ecf4 0%, #d5dde8 30%, #e0e7f0 60%, #edf1f7 100%)', minHeight:'100vh', padding:'28px 32px', fontFamily:'Rubik, sans-serif', color:'rgba(0,0,0,0.8)' },
  title:     { fontSize:'1.7rem', fontWeight:700, color:'rgba(0,0,0,0.85)', margin:0 },
  caption:   { fontSize:'0.82rem', color:'rgba(0,0,0,0.4)', marginTop:'4px', marginBottom:'24px' },
  tabs:      { display:'flex', gap:'6px', marginBottom:'24px', flexWrap:'wrap' },
  tab:       { padding:'8px 16px', borderRadius:12, border:'none', cursor:'pointer', fontSize:'0.85rem', fontWeight:500, background:'rgba(255,255,255,0.35)', color:'rgba(0,0,0,0.45)', transition:'all 0.2s', backdropFilter:'blur(8px)' },
  tabActive: { background:'rgba(255,255,255,0.65)', color:GOLD, fontWeight:700, boxShadow:'0 2px 12px rgba(0,0,0,0.06)' },
  card:      { background:'rgba(255,255,255,0.55)', backdropFilter:'blur(24px) saturate(1.8)', WebkitBackdropFilter:'blur(24px) saturate(1.8)', border:'1px solid rgba(255,255,255,0.6)', borderRadius:20, padding:'24px', marginBottom:'16px', boxShadow:'0 4px 30px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)' },
  input:     { background:'rgba(255,255,255,0.5)', border:'1px solid rgba(0,0,0,0.1)', borderRadius:8, color:'rgba(0,0,0,0.8)', padding:'10px 14px', fontSize:'0.95rem', width:'100%', outline:'none', boxSizing:'border-box', backdropFilter:'blur(8px)' },
  select:    { background:'rgba(255,255,255,0.5)', border:'1px solid rgba(0,0,0,0.1)', borderRadius:8, color:'rgba(0,0,0,0.8)', padding:'10px 14px', fontSize:'0.95rem', width:'100%', outline:'none', backdropFilter:'blur(8px)' },
  label:     { fontSize:'0.82rem', color:'rgba(0,0,0,0.45)', marginBottom:'6px', display:'block', fontWeight:600 },
  btnPrimary:{ background:`linear-gradient(135deg, ${GOLD}, #a08930)`, color:'#fff', border:'none', borderRadius:10, padding:'10px 24px', fontWeight:700, cursor:'pointer', fontSize:'0.95rem', boxShadow:'0 4px 20px rgba(200,168,75,0.25)', transition:'all 0.2s' },
  btnGhost:  { background:'rgba(255,255,255,0.45)', color:'rgba(0,0,0,0.6)', border:'1px solid rgba(0,0,0,0.1)', borderRadius:10, padding:'10px 20px', cursor:'pointer', fontSize:'0.88rem', backdropFilter:'blur(12px)', transition:'all 0.2s' },
  table:     { width:'100%', borderCollapse:'collapse', fontSize:'0.88rem' },
  th:        { background:'rgba(255,255,255,0.35)', color:'rgba(0,0,0,0.5)', padding:'10px 14px', textAlign:'left', borderBottom:'1px solid rgba(0,0,0,0.08)', fontWeight:600 },
  td:        { padding:'10px 14px', borderBottom:'1px solid rgba(0,0,0,0.06)', color:'rgba(0,0,0,0.75)' },
  tdVal:     { padding:'10px 14px', borderBottom:'1px solid rgba(0,0,0,0.06)', color:GOLD, fontWeight:700, textAlign:'right' },
  grid2:     { display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap:'16px', marginBottom:'16px' },
  grid3:     { display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:'16px', marginBottom:'16px' },
  sectionTitle: { fontSize:'0.78rem', fontWeight:700, color:'rgba(0,0,0,0.35)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:'20px', marginBottom:'10px' },
};

const ceil2 = (n) => Math.ceil(n * 100) / 100;

// ─── Tab 1: Gypsum Cielos ────────────────────────────────────────────────
function GypCielos() {
  const [m2, setM2] = useState('');
  const v = parseFloat(m2) || 0;
  const materiales = [
    { mat: 'Angular 25×25×3mts', cant: v * 0.40, und: 'und' },
    { mat: 'Perfil Furring Chanel 3.66mt', cant: v * 0.505, und: 'und' },
    { mat: 'Perfil Canales 38mm×4.88mt', cant: v * 0.20, und: 'und' },
    { mat: 'Tornillo P.B. #7/16 paq 25', cant: v * 0.303, und: 'paq' },
    { mat: 'Lámina 1.22×2.44×9mm corriente', cant: v * 0.3456, und: 'und' },
    { mat: 'Tornillo P.B. #6×25mm paq 25', cant: v * 0.5530, und: 'paq' },
    { mat: 'Pasta cubeta tapa roja', cant: v * 0.04, und: 'cubeta' },
    { mat: 'Cinta papel 50mm×250ft', cant: v * 0.0133, und: 'rollo' },
  ];
  const opcionales = [
    { mat: 'Cinta adhesiva 50mm×250ft', cant: v * 0.0133, und: 'rollo' },
    { mat: 'Lija madera #100', cant: v * 0.0864, und: 'und' },
    { mat: 'Clavo 18mm p/pistola presión', cant: v * 3.20, und: 'und' },
    { mat: 'Tiro café p/pistola presión', cant: v * 3.20, und: 'und' },
    { mat: 'Pasta secado rápido 45 (8kg)', cant: v * 0.10, und: 'bolsa' },
  ];
  return (
    <>
      <div style={S.card}>
        <div style={S.label}>Metros cuadrados (m²)</div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <input style={{ ...S.input, maxWidth:200 }} type="number" min="0" step="0.1" value={m2} onChange={e => setM2(e.target.value)} placeholder="Ej: 12" />
          <button style={S.btnGhost} onClick={() => setM2('')}>Limpiar</button>
        </div>
      </div>
      {v > 0 && (
        <div style={S.card}>
          <div style={S.sectionTitle}>Materiales principales</div>
          <TablaResultados items={materiales} />
          <div style={S.sectionTitle}>Complementos opcionales</div>
          <TablaResultados items={opcionales} />
        </div>
      )}
    </>
  );
}

// ─── Tab 2: Gypsum Paredes ───────────────────────────────────────────────
function GypParedes() {
  const [ml, setMl] = useState('');
  const [forros, setForros] = useState('1');
  const v = parseFloat(ml) || 0;
  const f = forros === '2' ? 2 : 1;
  const materiales = [
    { mat: 'Perfil Stud varios', cant: v * 1.6667, und: 'und' },
    { mat: 'Perfil Track varios', cant: v * 0.6667, und: 'und' },
    { mat: 'Tornillo P.B. #7/16 paq 25', cant: v * 1.00, und: 'paq' },
    { mat: 'Lámina 1.22×2.44×12mm corriente', cant: v * 0.8443 * f, und: 'und' },
    { mat: 'Tornillo P.B. #6×31mm paq 25', cant: v * 1.3508 * f, und: 'paq' },
    { mat: 'Pasta cubeta tapa roja', cant: v * 0.04 * f, und: 'cubeta' },
    { mat: 'Cinta papel 50mm×250ft', cant: v * 0.0133 * f, und: 'rollo' },
    { mat: 'Cinta adhesiva 50mm×250ft', cant: v * 0.0133 * f, und: 'rollo' },
    { mat: 'Lija madera #100', cant: v * 0.2111 * f, und: 'und' },
    { mat: 'Clavo 18mm p/pistola presión', cant: v * 5.3333, und: 'und' },
    { mat: 'Tiro café p/pistola presión', cant: v * 5.3333, und: 'und' },
    { mat: 'Pasta secado rápido 45 (8kg)', cant: v * 0.10 * f, und: 'bolsa' },
  ];
  return (
    <>
      <div style={S.card}>
        <div style={S.grid2}>
          <div>
            <div style={S.label}>Metros lineales (ml)</div>
            <input style={S.input} type="number" min="0" step="0.1" value={ml} onChange={e => setMl(e.target.value)} placeholder="Ej: 28" />
          </div>
          <div>
            <div style={S.label}>Forros</div>
            <select style={S.select} value={forros} onChange={e => setForros(e.target.value)}>
              <option value="1">1 forro</option>
              <option value="2">2 forros</option>
            </select>
          </div>
        </div>
        <button style={S.btnGhost} onClick={() => setMl('')}>Limpiar</button>
      </div>
      {v > 0 && <div style={S.card}><TablaResultados items={materiales} /></div>}
    </>
  );
}

// ─── Tab 3: Tablilla PVC ─────────────────────────────────────────────────
function TablillaPVC() {
  const [m2, setM2] = useState('');
  const v = parseFloat(m2) || 0;
  const materiales = [
    { mat: 'Angular 25×25×3mts', cant: v * 0.40, und: 'und' },
    { mat: 'Perfil Furring Chanel 3.66mt', cant: v * 0.505, und: 'und' },
    { mat: 'Perfil Canales 38mm×4.88mt', cant: v * 0.20, und: 'und' },
    { mat: 'Tornillo P.B. #7/16 paq 25', cant: v * 0.303, und: 'paq' },
    { mat: 'Tornillo P.B. 8×12mm paq 25', cant: v * 0.3051, und: 'paq' },
    { mat: 'Tablilla PVC', cant: v * 0.8475, und: 'und' },
    { mat: 'Cornisa PVC 5.90', cant: v * 0.3955, und: 'und' },
  ];
  return (
    <>
      <div style={S.card}>
        <div style={S.label}>Metros cuadrados (m²)</div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <input style={{ ...S.input, maxWidth:200 }} type="number" min="0" step="0.1" value={m2} onChange={e => setM2(e.target.value)} placeholder="Ej: 6" />
          <button style={S.btnGhost} onClick={() => setM2('')}>Limpiar</button>
        </div>
      </div>
      {v > 0 && <div style={S.card}><TablaResultados items={materiales} /></div>}
    </>
  );
}

// ─── Tab 4: Bloques 12×20×40 ─────────────────────────────────────────────
function Bloques() {
  const [largo, setLargo] = useState('');
  const [altura, setAltura] = useState('');
  const l = parseFloat(largo) || 0;
  const a = parseFloat(altura) || 0;
  const m2 = l * a;
  const bloques = m2 * 12.5;
  const peso = bloques * 12;
  const arena = m2 * 0.085;
  return (
    <>
      <div style={S.card}>
        <div style={S.grid2}>
          <div>
            <div style={S.label}>Largo de la pared (m)</div>
            <input style={S.input} type="number" min="0" step="0.1" value={largo} onChange={e => setLargo(e.target.value)} placeholder="Ej: 10" />
          </div>
          <div>
            <div style={S.label}>Altura de la pared (m)</div>
            <input style={S.input} type="number" min="0" step="0.1" value={altura} onChange={e => setAltura(e.target.value)} placeholder="Ej: 2.4" />
          </div>
        </div>
        <button style={S.btnGhost} onClick={() => { setLargo(''); setAltura(''); }}>Limpiar</button>
      </div>
      {m2 > 0 && (
        <div style={S.card}>
          <table style={S.table}>
            <thead><tr><th style={S.th}>Concepto</th><th style={{ ...S.th, textAlign:'right' }}>Valor</th><th style={S.th}>Unidad</th></tr></thead>
            <tbody>
              <tr><td style={S.td}>Metros cuadrados de pared</td><td style={S.tdVal}>{ceil2(m2)}</td><td style={S.td}>m²</td></tr>
              <tr><td style={S.td}>Bloques 12×20×40</td><td style={S.tdVal}>{ceil2(bloques)}</td><td style={S.td}>und</td></tr>
              <tr><td style={S.td}>Peso total</td><td style={S.tdVal}>{ceil2(peso).toLocaleString()}</td><td style={S.td}>kg</td></tr>
              <tr><td style={S.td}>Arena</td><td style={S.tdVal}>{ceil2(arena)}</td><td style={S.td}>m³</td></tr>
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

// ─── Tab 5: Planché (Chorrea de Concreto) ────────────────────────────────
function Planche() {
  const [largo, setLargo] = useState('');
  const [ancho, setAncho] = useState('');
  const [espesor, setEspesor] = useState('0.20');
  const l = parseFloat(largo) || 0;
  const a = parseFloat(ancho) || 0;
  const e = parseFloat(espesor) || 0;
  const vol = l * a * e;

  const opciones = [
    { nombre: 'Opción A — 6 sacos/m³ (relación 2-1-1)', piedra: vol * 0.6667, arena: vol * 0.3333, cemento: vol * 6 },
    { nombre: 'Opción B — 3 sacos/m³ (relación 3-1-1)', piedra: vol * 0.75, arena: vol * 0.25, cemento: vol * 3 },
    { nombre: 'Opción C — 4 sacos/m³ (relación 3-1-1¼)', piedra: vol * 0.75, arena: vol * 0.25, cemento: vol * 4 },
  ];

  return (
    <>
      <div style={S.card}>
        <div style={S.grid3}>
          <div>
            <div style={S.label}>Largo (m)</div>
            <input style={S.input} type="number" min="0" step="0.1" value={largo} onChange={ev => setLargo(ev.target.value)} placeholder="Ej: 10" />
          </div>
          <div>
            <div style={S.label}>Ancho (m)</div>
            <input style={S.input} type="number" min="0" step="0.1" value={ancho} onChange={ev => setAncho(ev.target.value)} placeholder="Ej: 5" />
          </div>
          <div>
            <div style={S.label}>Espesor (m)</div>
            <input style={S.input} type="number" min="0" step="0.01" value={espesor} onChange={ev => setEspesor(ev.target.value)} placeholder="0.20" />
          </div>
        </div>
        {vol > 0 && <div style={{ fontSize:'0.9rem', color:GOLD, fontWeight:700, marginBottom:8 }}>Volumen: {ceil2(vol)} m³</div>}
        <button style={S.btnGhost} onClick={() => { setLargo(''); setAncho(''); setEspesor('0.20'); }}>Limpiar</button>
      </div>
      {vol > 0 && opciones.map((op, i) => (
        <div key={i} style={S.card}>
          <div style={{ fontSize:'0.88rem', fontWeight:700, color:'rgba(0,0,0,0.7)', marginBottom:12 }}>{op.nombre}</div>
          <table style={S.table}>
            <thead><tr><th style={S.th}>Material</th><th style={{ ...S.th, textAlign:'right' }}>Cantidad</th><th style={S.th}>Unidad</th></tr></thead>
            <tbody>
              <tr><td style={S.td}>Piedra</td><td style={S.tdVal}>{ceil2(op.piedra)}</td><td style={S.td}>m³</td></tr>
              <tr><td style={S.td}>Arena</td><td style={S.tdVal}>{ceil2(op.arena)}</td><td style={S.td}>m³</td></tr>
              <tr><td style={S.td}>Cemento</td><td style={S.tdVal}>{ceil2(op.cemento)}</td><td style={S.td}>sacos</td></tr>
            </tbody>
          </table>
        </div>
      ))}
    </>
  );
}

// ─── Tab 6: Cerámica y Azulejo ───────────────────────────────────────────
function Ceramica() {
  const [m2, setM2] = useState('');
  const v = parseFloat(m2) || 0;
  const materiales = [
    { mat: 'Mortero', cant: v * 0.32, und: 'sacos' },
    { mat: 'Porcelana', cant: v * 0.50, und: 'kg' },
    { mat: 'Plasterbond', cant: v * 0.10, und: 'galones' },
  ];
  return (
    <>
      <div style={S.card}>
        <div style={S.label}>Metros cuadrados (m²)</div>
        <div style={{ display:'flex', gap:12, alignItems:'center' }}>
          <input style={{ ...S.input, maxWidth:200 }} type="number" min="0" step="0.1" value={m2} onChange={e => setM2(e.target.value)} placeholder="Ej: 20" />
          <button style={S.btnGhost} onClick={() => setM2('')}>Limpiar</button>
        </div>
        <div style={{ fontSize:'0.78rem', color:'rgba(0,0,0,0.35)', marginTop:8 }}>El cálculo puede variar según las condiciones y el tamaño de la cisa.</div>
      </div>
      {v > 0 && <div style={S.card}><TablaResultados items={materiales} /></div>}
    </>
  );
}

// ─── Tabla reutilizable ──────────────────────────────────────────────────
function TablaResultados({ items }) {
  return (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Material</th>
          <th style={{ ...S.th, textAlign:'right' }}>Cantidad</th>
          <th style={S.th}>Unidad</th>
        </tr>
      </thead>
      <tbody>
        {items.map((it, i) => (
          <tr key={i}>
            <td style={S.td}>{it.mat}</td>
            <td style={S.tdVal}>{ceil2(it.cant)}</td>
            <td style={S.td}>{it.und}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Componente principal ────────────────────────────────────────────────
const TABS = [
  { id: 'gyp-cielos', label: 'Gypsum Cielos', comp: GypCielos },
  { id: 'gyp-paredes', label: 'Gypsum Paredes', comp: GypParedes },
  { id: 'tablilla', label: 'Tablilla PVC', comp: TablillaPVC },
  { id: 'bloques', label: 'Bloques', comp: Bloques },
  { id: 'planche', label: 'Planché', comp: Planche },
  { id: 'ceramica', label: 'Cerámica', comp: Ceramica },
];

export default function MaterialesPage() {
  const [tab, setTab] = useState('gyp-cielos');
  const current = TABS.find(t => t.id === tab);
  const Comp = current?.comp;

  return (
    <div style={S.page}>
      <h1 style={S.title}>Cálculo de Materiales</h1>
      <p style={S.caption}>Calculadora para vendedores — ingresá las medidas y obtené la lista de materiales necesarios</p>

      <div style={S.tabs}>
        {TABS.map(t => (
          <button
            key={t.id}
            style={{ ...S.tab, ...(tab === t.id ? S.tabActive : {}) }}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {Comp && <Comp />}
    </div>
  );
}
