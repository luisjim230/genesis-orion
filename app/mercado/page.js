'use client';
import { useState, useEffect, useCallback } from 'react';
const S = {
  page:{ background:'var(--cream)', minHeight:'100vh', padding:'28px 32px', fontFamily:'DM Sans, sans-serif', color:'var(--text-primary)' },
  title:{ fontSize:'1.7rem', fontWeight:700, color:'var(--text-primary)', margin:0 },
  caption:{ fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'4px', marginBottom:'24px' },
  section:{ fontSize:'1.15rem', fontWeight:700, color:'var(--text-primary)', marginBottom:'4px', marginTop:'8px' },
  subCap:{ fontSize:'0.8rem', color:'var(--text-muted)', marginBottom:'16px' },
  divider:{ border:'none', borderTop:'1px solid var(--border-soft)', margin:'24px 0' },
  grid4:{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:'12px', marginBottom:'16px' },
  grid3:{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'12px', marginBottom:'16px' },
  grid2:{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:'16px', marginBottom:'16px' },
  input:{ background:'var(--cream)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-primary)', padding:'8px 12px', fontSize:'0.9rem', width:'100%', outline:'none', boxSizing:'border-box' },
  label:{ fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:'4px', display:'block' },
  info:{ background:'#EBF8FF', border:'1px solid #BEE3F8', borderRadius:'8px', padding:'12px 16px', color:'#2C5282', fontSize:'0.85rem', marginBottom:'8px' },
  btnGhost:{ background:'var(--cream)', color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 16px', cursor:'pointer', fontSize:'0.88rem' },
};
function Card({ nombre, emoji='📦', acento='#3d8ef8', children, cargando }) {
  if (cargando) return <div style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'1px solid var(--border-soft)',borderLeft:'4px solid '+acento}}><div style={{fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:'8px'}}>{emoji} {nombre}</div><div style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>⏳ Consultando...</div></div>;
  return <div style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'1px solid var(--border-soft)',borderLeft:'4px solid '+acento}}><div style={{fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:'8px'}}>{emoji} {nombre}</div>{children}</div>;
}
function TarjetaTC({ nombre, compra, venta, emoji, cargando }) {
  if (cargando || !compra || !venta) return <Card nombre={nombre} emoji={emoji} cargando={cargando}>{!cargando&&<div style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>No disponible · <a href="https://gee.bccr.fi.cr/IndicadoresEconomicos/Cuadros/frmConsultaTCVentanilla.aspx" target="_blank" rel="noreferrer" style={{color:'#63b3ed'}}>BCCR</a></div>}</Card>;
  const spread = venta - compra;
  return <Card nombre={nombre} emoji={emoji} acento="#3d8ef8"><div style={{display:'flex',gap:'16px',alignItems:'center',flexWrap:'wrap'}}><div><div style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase'}}>Compra</div><div style={{fontSize:'1.35rem',fontWeight:700,color:'#4ec9b0'}}>₡{compra.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div><div><div style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase'}}>Venta</div><div style={{fontSize:'1.35rem',fontWeight:700,color:'#f48771'}}>₡{venta.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</div></div><div><div style={{fontSize:'0.65rem',color:'var(--text-muted)',textTransform:'uppercase'}}>Spread</div><div style={{fontSize:'1.1rem',color:'#dcdcaa'}}>₡{spread.toFixed(2)}</div></div></div></Card>;
}
function TarjetaCommodity({ nombre, precio, unidad, cambio_pct=0, moneda='USD', emoji, nota, cargando }) {
  if (cargando||!precio) return <Card nombre={nombre} emoji={emoji} cargando={cargando} acento={cargando?'#3d8ef8':'#2a3a35'}>{!cargando&&<div style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>No disponible en este momento</div>}</Card>;
  const sube=cambio_pct>=0, color=sube?'#4ec9b0':'#f48771', flecha=sube?'▲':'▼';
  return <Card nombre={nombre} emoji={emoji} acento={color}><div style={{display:'flex',gap:'16px',alignItems:'center'}}><div><div style={{fontSize:'1.4rem',fontWeight:700,color:'#dcdcaa'}}>{moneda} {precio.toLocaleString('es-CR',{minimumFractionDigits:2,maximumFractionDigits:2})}</div><div style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>por {unidad}</div></div><div style={{fontSize:'1.05rem',color:color,fontWeight:700}}>{flecha} {cambio_pct>=0?'+':''}{cambio_pct.toFixed(2)}%</div></div>{nota&&<div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:'6px'}}>{nota}</div>}</Card>;
}
function TarjetaFlete({ ruta, precio, nota, cargando }) {
  if (cargando||!precio) return <Card nombre={ruta} emoji="🚢" acento="#c586c0" cargando={cargando}>{!cargando&&<div style={{fontSize:'0.8rem',color:'var(--text-muted)'}}>No disponible</div>}</Card>;
  return <Card nombre={ruta} emoji="🚢" acento="#c586c0"><div style={{fontSize:'1.4rem',fontWeight:700,color:'#c586c0'}}>${precio.toLocaleString('es-CR')}/FEU</div><div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:'4px'}}>contenedor 40&apos; · referencia semanal</div>{nota&&<div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:'6px'}}>{nota}</div>}</Card>;
}
function useMercado() {
  const [data,setData]=useState({});
  const [cargando,setCargando]=useState(true);
  const [ultima,setUltima]=useState('');
  const fetch_=async(url)=>{try{const r=await fetch(url);const j=await r.json();return j.ok?j.data:null;}catch{return null;}};
  const cargar=useCallback(async()=>{
    setCargando(true);
    const [refData,bancosData,cobre_,aluminio_,petroleo_,aceroHRC_,aceroReb_,pvc_,fletes_]=await Promise.allSettled([
      fetch_('/api/mercado?fuente=bccr_ref'),
      fetch_('/api/mercado?fuente=bccr_bancos'),
      fetch_('/api/mercado?fuente=yahoo&ticker=HG%3DF'),
      fetch_('/api/mercado?fuente=yahoo&ticker=ALI%3DF'),
      fetch_('/api/mercado?fuente=yahoo&ticker=CL%3DF'),
      fetch_('/api/mercado?fuente=tradingeconomics&slug=hrc-steel'),
      fetch_('/api/mercado?fuente=tradingeconomics&slug=steel'),
      fetch_('/api/mercado?fuente=tradingeconomics&slug=polyvinyl'),
      fetch_('/api/mercado?fuente=fletes'),
    ]);
    const bancos = bancosData.value || {};
    setData({tcRef:refData.value||null,bancos,cobre:cobre_.value||null,aluminio:aluminio_.value||null,petroleo:petroleo_.value||null,aceroHRC:aceroHRC_.value||null,aceroReb:aceroReb_.value||null,pvc:pvc_.value||null,fletes:fletes_.value||null});
    const now=new Date();
    setUltima(String(now.getDate()).padStart(2,'0')+'/'+String(now.getMonth()+1).padStart(2,'0')+'/'+now.getFullYear()+' '+String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0'));
    setCargando(false);
  },[]);
  useEffect(()=>{cargar();},[cargar]);
  return {...data,cargando,ultima,recargar:cargar};
}
export default function IsaiasMercado() {
  const {tcRef,bancos,fletes,cobre,aluminio,petroleo,aceroHRC,aceroReb,pvc,cargando,ultima,recargar}=useMercado();
  const [montoUSD,setMontoUSD]=useState(1000);
  const [fleteActual,setFleteActual]=useState(2500);
  const [fleteRef,setFleteRef]=useState(2000);
  const tcVenta=tcRef?.venta||null;
  const flete1=fletes?.asia_uswc||null;
  const flete2=fletes?.asia_usec||null;
  const cobrePrecio=cobre?cobre.precio*2204.62:null;
  const alumPrecio=aluminio?aluminio.precio*2204.62:null;
  const diff=fleteActual-fleteRef, pct=fleteRef>0?(diff/fleteRef)*100:0;
  return (
    <div style={S.page}>
      <h1 style={S.title}>⚡ Pulsar – Mercado en Tiempo Real</h1>
      <div style={S.caption}>⚡ Datos en tiempo real · Consultado: {ultima||'—'}<br/><span style={{color:'var(--text-muted)'}}>Precios e indicadores en tiempo real · SOL</span></div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px',flexWrap:'wrap',gap:'12px'}}>
        <div style={{fontSize:'0.82rem',color:'var(--text-muted)'}}>🕐 Última consulta: {ultima||'—'} · Actualización automática cada 15-30 min</div>
        <button style={S.btnGhost} onClick={recargar} disabled={cargando}>{cargando?'⏳ Actualizando...':'🔄 Forzar actualización'}</button>
      </div>
      <hr style={S.divider}/>
      <div style={S.section}>💱 Las Monedas del Reino — Tipos de Cambio</div>
      <div style={S.subCap}>Compra y venta en ventanilla · Fuente: BCCR</div>
      <div style={S.grid4}>
        <TarjetaTC nombre="BCCR Referencia" emoji="🏛️" compra={tcRef?.compra} venta={tcRef?.venta} cargando={cargando}/>
        <TarjetaTC nombre="BAC San José" emoji="🏦" compra={bancos?.bac?.compra} venta={bancos?.bac?.venta} cargando={cargando}/>
        <TarjetaTC nombre="Davivienda" emoji="🔴" compra={bancos?.davivienda?.compra} venta={bancos?.davivienda?.venta} cargando={cargando}/>
        <TarjetaTC nombre="BCR" emoji="🇨🇷" compra={bancos?.bcr?.compra} venta={bancos?.bcr?.venta} cargando={cargando}/>
      </div>
      <div style={{fontSize:'0.8rem',color:'var(--text-muted)',marginBottom:'8px'}}>📌 Fuente oficial: <a href="https://gee.bccr.fi.cr/IndicadoresEconomicos/Cuadros/frmConsultaTCVentanilla.aspx" target="_blank" rel="noreferrer" style={{color:'#63b3ed'}}>BCCR Ventanilla en tiempo real</a></div>
      <hr style={S.divider}/>
      <div style={S.section}>⚒️ El Precio de los Elementos — Materias Primas</div>
      <div style={S.subCap}>Mercados internacionales · Precios de referencia</div>
      <div style={S.grid3}>
        <div>
          <div style={{fontSize:'0.88rem',fontWeight:600,color:'var(--text-primary)',marginBottom:'8px'}}>🔩 Metales Industriales</div>
          <TarjetaCommodity nombre="Acero HRC (bobina laminada)" precio={aceroHRC?.precio} unidad="tonelada" cambio_pct={aceroHRC?.cambio_pct||0} emoji="🔩" nota="Hot-Rolled Coil · NYMEX" cargando={cargando}/>
          <TarjetaCommodity nombre="Acero Rebar (varilla)" precio={aceroReb?.precio} unidad="tonelada" cambio_pct={aceroReb?.cambio_pct||0} moneda="CNY" emoji="🏗️" nota="Shanghai Futures Exchange · referencia Asia" cargando={cargando}/>
        </div>
        <div>
          <div style={{fontSize:'0.88rem',fontWeight:600,color:'var(--text-primary)',marginBottom:'8px'}}>🪨 Metales y Petroquímicos</div>
          <TarjetaCommodity nombre="Cobre" precio={cobrePrecio} unidad="tonelada" cambio_pct={cobre?.cambio_pct||0} emoji="🔶" nota="COMEX Futures · convertido a USD/t" cargando={cargando}/>
          <TarjetaCommodity nombre="Aluminio" precio={alumPrecio} unidad="tonelada" cambio_pct={aluminio?.cambio_pct||0} emoji="⬜" nota="LME Futures · convertido a USD/t" cargando={cargando}/>
        </div>
        <div>
          <div style={{fontSize:'0.88rem',fontWeight:600,color:'var(--text-primary)',marginBottom:'8px'}}>🛢️ Energía y Plásticos</div>
          <TarjetaCommodity nombre="Petróleo WTI" precio={petroleo?.precio} unidad="barril" cambio_pct={petroleo?.cambio_pct||0} emoji="🛢️" nota="WTI Crude · mueve el costo de fletes" cargando={cargando}/>
          <TarjetaCommodity nombre="PVC (Polyvinyl)" precio={pvc?.precio} unidad="tonelada" cambio_pct={pvc?.cambio_pct||0} moneda="CNY" emoji="🪣" nota="Dalian Commodity Exchange · referencia Asia" cargando={cargando}/>
        </div>
      </div>
      <hr style={S.divider}/>
      <div style={S.section}>🚢 Las Rutas del Mar — Fletes Internacionales</div>
      <div style={S.subCap}>Freightos Baltic Index (FBX) · Actualización semanal</div>
      {!cargando&&!flete1&&!flete2?(
        <div style={S.info}>🚢 Índices de flete no disponibles. Consultá: <a href="https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/" target="_blank" rel="noreferrer" style={{color:'#63b3ed'}}>Freightos Baltic Index</a> · <a href="https://www.drewry.co.uk/supply-chain-advisors/supply-chain-expertise/world-container-index-assessed-by-drewry" target="_blank" rel="noreferrer" style={{color:'#63b3ed'}}>Drewry WCI</a><div style={{marginTop:'8px',fontSize:'0.8rem',color:'var(--text-muted)'}}>Los fletes Asia → Costa Rica generalmente se mueven entre $1,500 y $5,000/FEU.</div></div>
      ):(
        <div style={S.grid3}>
          <TarjetaFlete ruta="Asia → USA Costa Oeste" precio={flete1} nota="FBX01 · Puerto más cercano a Costa Rica vía Pacífico" cargando={cargando}/>
          <TarjetaFlete ruta="Asia → USA Costa Este" precio={flete2} nota="FBX03 · Ruta alternativa vía Atlántico" cargando={cargando}/>
          {flete1&&flete2&&(<div style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'1px solid var(--border-soft)',borderLeft:'4px solid #dcdcaa'}}><div style={{fontSize:'0.82rem',color:'var(--text-muted)',marginBottom:'8px'}}>📊 Diferencial Pacífico vs Atlántico</div><div style={{fontSize:'1.3rem',fontWeight:700,color:'#dcdcaa'}}>${Math.abs(flete2-flete1).toLocaleString('es-CR')}/FEU</div><div style={{fontSize:'0.82rem',color:'var(--text-muted)',marginTop:'6px'}}>{flete2>flete1?'Atlántico más caro':'Pacífico más caro'} por este monto</div><div style={{fontSize:'0.72rem',color:'var(--text-muted)',marginTop:'6px'}}>Para Costa Rica, la ruta Pacífico (Costa Oeste) suele ser más directa</div></div>)}
        </div>
      )}
      <hr style={S.divider}/>
      <div style={S.section}>🧮 El Oráculo Rápido — Calculadora de Impacto</div>
      <div style={S.subCap}>¿Cómo afecta el tipo de cambio de hoy a tus costos?</div>
      <div style={S.grid2}>
        <div style={{background:'#fff',borderRadius:'12px',padding:'20px',border:'1px solid var(--border-soft)'}}>
          <div style={{fontWeight:600,color:'var(--text-primary)',marginBottom:'14px'}}>Conversor USD ↔ CRC</div>
          <label style={S.label}>Monto en USD</label>
          <input style={S.input} type="number" step="100" value={montoUSD} onChange={e=>setMontoUSD(parseFloat(e.target.value)||0)}/>
          {tcVenta?(<div style={{marginTop:'16px'}}><div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginBottom:'4px'}}>Equivalente en CRC (BCCR venta)</div><div style={{fontSize:'1.6rem',fontWeight:700,color:'var(--orange)'}}>₡{(montoUSD*tcVenta).toLocaleString('es-CR',{maximumFractionDigits:0})}</div><div style={{fontSize:'0.75rem',color:'var(--text-muted)',marginTop:'4px'}}>TC usado: ₡{tcVenta.toFixed(2)}</div></div>):(<div style={{marginTop:'12px',fontSize:'0.82rem',color:'var(--text-muted)'}}>TC de referencia no disponible · ingresalo manualmente en Halley</div>)}
        </div>
        <div style={{background:'#fff',borderRadius:'12px',padding:'20px',border:'1px solid var(--border-soft)'}}>
          <div style={{fontWeight:600,color:'var(--text-primary)',marginBottom:'14px'}}>Impacto del precio del flete</div>
          <label style={S.label}>Flete cotizado (USD)</label>
          <input style={{...S.input,marginBottom:'10px'}} type="number" step="100" value={fleteActual} onChange={e=>setFleteActual(parseFloat(e.target.value)||0)}/>
          <label style={S.label}>Flete de referencia del mercado (USD)</label>
          <input style={S.input} type="number" step="100" value={fleteRef} onChange={e=>setFleteRef(parseFloat(e.target.value)||0)} placeholder={flete1?'Índice: $'+flete1:''}/>
          {fleteRef>0&&(Math.abs(diff)<50?<div style={{marginTop:'12px',background:'#F0FFF4',border:'1px solid #9AE6B4',borderRadius:'8px',padding:'10px',color:'#276749',fontSize:'0.85rem'}}>✅ Estás pagando prácticamente el precio de mercado (${diff>0?'+':''}{diff.toFixed(0)})</div>:diff>0?<div style={{marginTop:'12px',background:'#352a10',border:'1px solid #FAD776',borderRadius:'8px',padding:'10px',color:'#7B341E',fontSize:'0.85rem'}}>⚠️ Estás pagando ${diff.toLocaleString('es-CR',{maximumFractionDigits:0})} más que el índice ({pct>0?'+':''}{pct.toFixed(1)}%). Considerá renegociar.</div>:<div style={{marginTop:'12px',background:'#F0FFF4',border:'1px solid #9AE6B4',borderRadius:'8px',padding:'10px',color:'#276749',fontSize:'0.85rem'}}>🎉 Estás pagando ${Math.abs(diff).toLocaleString('es-CR',{maximumFractionDigits:0})} menos que el índice ({pct.toFixed(1)}%).</div>)}
        </div>
      </div>
      <hr style={S.divider}/>
      <details style={{background:'#fff',borderRadius:'12px',padding:'16px',border:'1px solid var(--border-soft)'}}>
        <summary style={{cursor:'pointer',color:'var(--orange)',fontWeight:600,fontSize:'0.9rem'}}>📚 Fuentes de datos y metodología</summary>
        <div style={{marginTop:'14px',overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:'0.82rem'}}>
            <thead><tr>{['Indicador','Fuente','Frecuencia'].map(h=><th key={h} style={{background:'var(--cream)',color:'var(--text-muted)',padding:'8px 12px',textAlign:'left',borderBottom:'1px solid var(--border-soft)',fontWeight:600}}>{h}</th>)}</tr></thead>
            <tbody>{[['Tipo de cambio BCCR','API oficial BCCR','Diaria'],['TC BAC, Davivienda, BCR','BCCR ventanilla oficial','Diaria'],['Acero HRC','TradingEconomics (NYMEX)','Diaria'],['Acero Rebar','TradingEconomics (Shanghai)','Diaria'],['Cobre','Yahoo Finance (COMEX)','Diaria'],['Aluminio','Yahoo Finance (LME)','Diaria'],['Petróleo WTI','Yahoo Finance (NYMEX)','Diaria'],['PVC Polyvinyl','TradingEconomics (Dalian)','Diaria'],['Fletes marítimos','Freightos Baltic Index','Semanal']].map(([i,f,fr],idx)=><tr key={idx} style={{background:idx%2===0?'#0f1115':'#161920'}}><td style={{padding:'7px 12px',color:'var(--text-primary)',borderBottom:'1px solid #1a1e26'}}>{i}</td><td style={{padding:'7px 12px',color:'#63b3ed',borderBottom:'1px solid #1a1e26'}}>{f}</td><td style={{padding:'7px 12px',color:'var(--text-muted)',borderBottom:'1px solid #1a1e26'}}>{fr}</td></tr>)}</tbody>
          </table>
          <div style={{fontSize:'0.78rem',color:'var(--text-muted)',marginTop:'12px'}}>Los precios son de referencia internacional. Pueden variar según naviero, temporada y condiciones del contrato.</div>
        </div>
      </details>
    </div>
  );
}
