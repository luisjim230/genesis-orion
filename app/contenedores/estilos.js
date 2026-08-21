// Estilos compartidos del módulo Cargas en tránsito.
// Estaban dentro de page.js; se sacaron acá para que el expediente, la tabla de
// mercadería y la pantalla de documentos usen exactamente la misma pinta.

export const S = {
  page:    { background:'var(--cream)', minHeight:'100vh', padding:'32px 36px', fontFamily:"'Rubik','DM Sans',sans-serif", color:'var(--text-primary)' },
  title:   { fontFamily:"'Bungee',cursive", fontSize:'1.6rem', color:'var(--burgundy)', letterSpacing:'0.03em', margin:0 },
  sub:     { fontSize:'0.8rem', color:'var(--text-muted)', marginTop:'4px', marginBottom:'24px' },
  card:    { background:'#fff', border:'1px solid var(--border-soft)', borderRadius:'12px', padding:'20px', marginBottom:'12px', boxShadow:'var(--card-shadow)' },
  tabBar:  { display:'flex', gap:'0', marginBottom:'24px', borderBottom:'2px solid var(--border)', flexWrap:'wrap' },
  tab:     (a)=>({ padding:'10px 20px', cursor:'pointer', border:'none', background:'none', color:a?'var(--orange)':'var(--text-muted)', fontWeight:a?600:400, borderBottom:a?'2px solid var(--orange)':'2px solid transparent', marginBottom:'-2px', fontSize:'0.86em', fontFamily:'inherit', transition:'all 0.15s' }),
  btn:     (c='var(--orange)')=>({ background:c, color:'#fff', border:'none', borderRadius:'8px', padding:'8px 16px', cursor:'pointer', fontSize:'0.84em', fontWeight:500, fontFamily:'inherit' }),
  btnSm:   (c='#fff')=>({ background:c, color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:'6px', padding:'5px 12px', cursor:'pointer', fontSize:'0.78em', fontFamily:'inherit' }),
  input:   { background:'#fff', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 12px', color:'var(--text-primary)', fontSize:'0.87em', width:'100%', boxSizing:'border-box', fontFamily:'inherit' },
  inputSm: { background:'#fff', border:'1px solid var(--border)', borderRadius:'6px', padding:'4px 8px', color:'var(--text-primary)', fontSize:'0.8em', width:'100%', boxSizing:'border-box', fontFamily:'inherit' },
  label:   { fontSize:'0.74em', color:'var(--text-muted)', display:'block', marginBottom:'4px', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.05em' },
  grid2:   { display:'grid', gridTemplateColumns:'1fr 1fr', gap:'14px' },
  grid3:   { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'14px' },
  divider: { border:'none', borderTop:'1px solid var(--border-soft)', margin:'20px 0' },
  badge:   (c)=>({ background:c+'18', color:c, border:'1px solid '+c+'44', borderRadius:'20px', padding:'3px 10px', fontSize:'0.72em', fontWeight:600 }),
  table:   { width:'100%', borderCollapse:'collapse', fontSize:'0.83em' },
  th:      { textAlign:'left', padding:'9px 12px', background:'var(--cream)', color:'var(--text-muted)', fontSize:'0.7em', textTransform:'uppercase', letterSpacing:'0.06em', borderBottom:'2px solid var(--border)' },
  td:      { padding:'9px 12px', borderBottom:'1px solid var(--border-soft)', color:'var(--text-primary)', verticalAlign:'middle' },
  kpi:     (c='var(--orange)')=>({ background:'#fff', border:'1px solid var(--border-soft)', borderTop:'3px solid '+c, borderRadius:'10px', padding:'14px 16px', boxShadow:'var(--card-shadow)' }),
  metric:  { fontSize:'1.5em', fontWeight:700, color:'var(--text-primary)', marginTop:'4px' },
  mLabel:  { fontSize:'0.68em', color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.07em' },
  mDelta:  (warn)=>({ fontSize:'0.74em', color:warn?'#DD6B20':'#38A169', marginTop:'2px' }),
  seccion: { fontSize:'0.75em', color:'#c8a84b', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:'10px' },
  caja:    { background:'var(--cream)', borderRadius:'10px', padding:'14px' },
  aviso:   (tipo)=>({
    background: tipo==='err' ? '#fc818118' : tipo==='warn' ? '#f6ad5518' : '#68d39118',
    border: '1px solid ' + (tipo==='err' ? '#fc818155' : tipo==='warn' ? '#f6ad5555' : '#68d39155'),
    color: tipo==='err' ? '#c53030' : tipo==='warn' ? '#b7791f' : '#2f855a',
    borderRadius:'8px', padding:'10px 14px', fontSize:'0.82em', marginBottom:'10px',
  }),
};

export const usd = (n) => (n !== null && n !== undefined && n !== '' && Number(n) !== 0)
  ? '$' + Number(n).toLocaleString('es-CR', { minimumFractionDigits:0, maximumFractionDigits:0 })
  : '—';

export const usd2 = (n) => '$' + Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits:2, maximumFractionDigits:2 });

export const numFmt = (n) => (n === null || n === undefined || n === '')
  ? '—'
  : Number(n).toLocaleString('es-CR', { maximumFractionDigits:2 });
