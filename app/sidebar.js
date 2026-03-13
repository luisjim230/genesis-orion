'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../lib/useAuth';

const nunitoStyle = `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;800;900&display=swap');`;
const ALL_NAV=[
  {group:'Principal',items:[{href:'/',key:'dashboard',icon:'⊞',name:'Dashboard'}]},
  {group:'Inventario',items:[{href:'/inventario',key:'inventario',icon:'📦',name:'Compras'},{href:'/trazabilidad',key:'trazabilidad',icon:'🔴',name:'Trazabilidad de inventario y compras'},{href:'/rotacion',key:'rotacion',icon:'🔄',name:'Rotación de productos'},{href:'/kronos',key:'kronos',icon:'📈',name:'Proyección de inventario'},{href:'/reportes',key:'reportes',icon:'📊',name:'Carga de reportes'}]},
  {group:'Comercial',items:[{href:'/comercial',key:'comercial',icon:'💼',name:'Comercial'}]},
  {group:'Importaciones',items:[{href:'/cif',key:'cif',icon:'🧮',name:'Calculadora de importación'},{href:'/contenedores',key:'contenedores',icon:'🚢',name:'Cargas en tránsito'},{href:'/mercado',key:'mercado',icon:'⚡',name:'Mercado'}]},
  {group:'Operaciones',items:[{href:'/cajas-aurora',key:'cajas-aurora',icon:'🌅',name:'Cajas Aurora'}]},{group:'Transportes',items:[{href:'/entregas',key:'entregas',icon:'🚛',name:'Entregas · Trazabilidad'}]},{group:'Gestión',items:[{href:'/finanzas',key:'finanzas',icon:'💰',name:'Finanzas'},{href:'/tareas',key:'tareas',icon:'✅',name:'Tareas'},{href:'/social',key:'social',icon:'📱',name:'Redes Sociales'}]},
  {group:'Herramientas',items:[{href:'/ponderacion',key:'ponderacion',icon:'⚖️',name:'Promedios ponderados'}]},
  {group:'Admin',items:[{href:'/admin',key:'admin',icon:'👥',name:'Usuarios',adminOnly:true}]},
];
const ROL_COLOR={admin:'#ED6E2E',bodega:'#63b3ed',ventas:'#68d391',finanzas:'#c8a84b',logistica:'#b794f4'};

function NavItem({href,icon,name,collapsed,isActive}){
  return(
    <Link href={href} style={{textDecoration:'none',display:'block'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',cursor:'pointer',borderRadius:8,margin:'1px 8px',borderLeft:isActive?'3px solid #ED6E2E':'3px solid transparent',background:isActive?'rgba(237,110,46,0.12)':'transparent',transition:'all 0.12s ease'}}
        onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background='rgba(253,244,244,0.06)';}}
        onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background='transparent';}}>
        <span style={{fontSize:'1rem',flexShrink:0,width:20,textAlign:'center'}}>{icon}</span>
        {!collapsed&&<div style={{fontSize:'0.83rem',fontWeight:isActive?600:400,color:isActive?'#ED6E2E':'rgba(253,244,244,0.80)',lineHeight:1.3,fontFamily:"'Rubik',sans-serif",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>}
      </div>
    </Link>
  );
}

export default function Sidebar(){
  const [collapsed,setCollapsed]=useState(false);
  const {perfil,loading,logout,puedeVer}=useAuth();
  const pathname=usePathname();
  const navVisible=ALL_NAV.map(g=>({...g,items:g.items.filter(i=>i.adminOnly?perfil?.rol==='admin':puedeVer(i.key))})).filter(g=>g.items.length>0);
  return(
    <>
      <style>{nunitoStyle}</style>
      <aside style={{width:collapsed?64:240,background:'#5E2733',borderRight:'1px solid rgba(255,255,255,0.06)',position:'fixed',top:0,left:0,height:'100vh',overflowY:'auto',overflowX:'hidden',display:'flex',flexDirection:'column',zIndex:100,transition:'width 0.2s ease'}}>
        <div style={{padding:collapsed?'16px 12px':'18px 20px',borderBottom:'1px solid rgba(255,255,255,0.07)',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <svg width={collapsed?32:40} height={collapsed?28:34} viewBox="0 0 56 48" style={{flexShrink:0}}>
            <rect x="0"  y="0"  width="16" height="9" rx="2" fill="rgba(255,255,255,0.90)"/>
            <rect x="20" y="0"  width="24" height="9" rx="2" fill="#ED6E2E"/>
            <rect x="0"  y="13" width="24" height="9" rx="2" fill="#ED6E2E"/>
            <rect x="28" y="13" width="16" height="9" rx="2" fill="#ED6E2E"/>
            <rect x="0"  y="26" width="10" height="9" rx="2" fill="#ED6E2E"/>
            <rect x="14" y="26" width="30" height="9" rx="2" fill="#ED6E2E"/>
          </svg>
          {!collapsed&&<div style={{lineHeight:1.1}}><div style={{fontFamily:"'Nunito',sans-serif",fontWeight:700,color:'rgba(253,244,244,0.50)',fontSize:7,letterSpacing:'0.10em',textTransform:'uppercase',marginBottom:1}}>DEPÓSITO JIMÉNEZ</div><div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,color:'#ED6E2E',fontSize:18,letterSpacing:'0.04em',lineHeight:1}}>SOL</div><div style={{fontFamily:"'Rubik',sans-serif",fontWeight:400,color:'rgba(253,244,244,0.40)',fontSize:7.5,letterSpacing:'0.06em',textTransform:'uppercase',marginTop:2}}>Sistema de Operaciones y Logística</div></div>}
        </div>
        {!loading&&perfil&&!collapsed&&(
          <div style={{padding:'10px 20px',borderBottom:'1px solid rgba(255,255,255,0.07)',flexShrink:0}}>
            <div style={{fontSize:'0.72rem',color:'rgba(253,244,244,0.40)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Sesión activa</div>
            <div style={{fontSize:'0.82rem',color:'rgba(253,244,244,0.85)',fontWeight:500,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{perfil.nombre||perfil.email}</div>
            <span style={{display:'inline-block',marginTop:4,background:(ROL_COLOR[perfil.rol]||'#666')+'33',color:ROL_COLOR[perfil.rol]||'#ccc',border:'1px solid '+(ROL_COLOR[perfil.rol]||'#666')+'55',borderRadius:20,padding:'1px 8px',fontSize:'0.68rem',fontWeight:600}}>{perfil.rol}</span>
          </div>
        )}
        <nav style={{flex:1,padding:'10px 0',overflowY:'auto'}}>
          {navVisible.map(g=>(
            <div key={g.group} style={{marginBottom:4}}>
              {!collapsed&&<div style={{padding:'8px 20px 4px',fontSize:'0.60rem',fontWeight:700,color:'rgba(253,244,244,0.25)',textTransform:'uppercase',letterSpacing:'0.12em',fontFamily:"'Rubik',sans-serif"}}>{g.group}</div>}
              {g.items.map(item=><NavItem key={item.href} {...item} collapsed={collapsed} isActive={pathname===item.href||(item.href!=='/'&&pathname?.startsWith(item.href))}/>)}
            </div>
          ))}
        </nav>
        <div style={{padding:'12px 8px',borderTop:'1px solid rgba(255,255,255,0.07)',flexShrink:0}}>
          {!collapsed&&<button onClick={logout} style={{width:'100%',padding:'8px 12px',background:'rgba(237,110,46,0.12)',border:'1px solid rgba(237,110,46,0.25)',borderRadius:8,color:'rgba(237,110,46,0.80)',cursor:'pointer',fontSize:'0.78rem',fontFamily:"'Rubik',sans-serif",display:'flex',alignItems:'center',gap:8,marginBottom:8}} onMouseEnter={e=>e.currentTarget.style.background='rgba(237,110,46,0.20)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(237,110,46,0.12)'}><span>→</span><span>Cerrar sesión</span></button>}
          <button onClick={()=>setCollapsed(!collapsed)} style={{width:'100%',padding:'9px 12px',background:'rgba(255,255,255,0.06)',border:'none',borderRadius:8,color:'rgba(253,244,244,0.50)',cursor:'pointer',fontSize:12,fontFamily:"'Rubik',sans-serif",display:'flex',alignItems:'center',justifyContent:collapsed?'center':'flex-start',gap:8}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.10)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'}><span style={{fontSize:14}}>{collapsed?'→':'←'}</span>{!collapsed&&<span>Colapsar</span>}</button>
          {!collapsed&&<div style={{padding:'10px 12px 0',fontSize:'0.62rem',color:'rgba(253,244,244,0.20)',fontFamily:"'Rubik',sans-serif"}}>SOL v1.0 · 2026</div>}
        </div>
      </aside>
    </>
  );
}
