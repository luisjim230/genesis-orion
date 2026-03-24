'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '../lib/useAuth';

const nunitoStyle = `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;800;900&display=swap');`;
const ALL_NAV=[
  {group:'Principal',items:[{href:'/',key:'dashboard',icon:'⊞',name:'Dashboard'}]},
  {group:'Inventario',items:[{href:'/inventario',key:'inventario',icon:'📦',name:'Compras'},{href:'/trazabilidad',key:'trazabilidad',icon:'🔴',name:'Trazabilidad de inventario y compras'},{href:'/kronos',key:'kronos',icon:'📈',name:'Proyección de inventario'},{href:'/reportes',key:'reportes',icon:'📊',name:'Carga de reportes'}]},
  {group:'Comercial',items:[{href:'/comercial',key:'comercial',icon:'💼',name:'Comercial'}]},
  {group:'Importaciones',items:[{href:'/cif',key:'cif',icon:'🧮',name:'Calculadora de importación'},{href:'/contenedores',key:'contenedores',icon:'🚢',name:'Cargas en tránsito'},{href:'/mercado',key:'mercado',icon:'⚡',name:'Mercado'}]},
  {group:'Operaciones',items:[{href:'/cajas-aurora',key:'cajas-aurora',icon:'🌅',name:'Cajas'}]},{group:'Transportes',items:[{href:'/entregas',key:'entregas',icon:'🚛',name:'Entregas · Trazabilidad'}]},{group:'Gestión',items:[{href:'/finanzas',key:'finanzas',icon:'💰',name:'Finanzas'},{href:'/finanzas/bancos',key:'bancos',icon:'🏦',name:'Bancos'},{href:'/pagos',key:'pagos',icon:'💸',name:'Coordinación de pagos'},{href:'/tareas',key:'tareas',icon:'✅',name:'Tareas'},{href:'/social',key:'social',icon:'📱',name:'Redes Sociales'},{href:'/kommo-proveedores',key:'kommo-proveedores',icon:'📲',name:'WhatsApp Proveedores'}]},
  {group:'Herramientas',items:[{href:'/ponderacion',key:'ponderacion',icon:'⚖️',name:'Promedios ponderados'},{href:'/materiales',key:'materiales',icon:'🧱',name:'Cálculo de materiales'}]},
  {group:'Admin',items:[{href:'/admin',key:'admin',icon:'👥',name:'Usuarios',adminOnly:true}]},
];
const ROL_COLOR={admin:'#ED6E2E',bodega:'#63b3ed',ventas:'#68d391',finanzas:'#c8a84b',logistica:'#b794f4'};

function NavItem({href,icon,name,collapsed,isActive}){
  return(
    <Link href={href} style={{textDecoration:'none',display:'block'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 16px',cursor:'pointer',borderRadius:10,margin:'1px 8px',borderLeft:isActive?'3px solid #c8a84b':'3px solid transparent',background:isActive?'rgba(200,168,75,0.12)':'transparent',transition:'all 0.15s ease'}}
        onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background='rgba(0,0,0,0.03)';}}
        onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background='transparent';}}>
        <span style={{fontSize:'1rem',flexShrink:0,width:20,textAlign:'center'}}>{icon}</span>
        {!collapsed&&<div style={{fontSize:'0.83rem',fontWeight:isActive?600:400,color:isActive?'#c8a84b':'rgba(0,0,0,0.6)',lineHeight:1.3,fontFamily:"'Rubik',sans-serif",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>}
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
      <aside style={{width:collapsed?64:240,background:'rgba(255,255,255,0.45)',backdropFilter:'blur(30px) saturate(1.8)',WebkitBackdropFilter:'blur(30px) saturate(1.8)',borderRight:'1px solid rgba(255,255,255,0.5)',position:'fixed',top:0,left:0,height:'100vh',overflowY:'auto',overflowX:'hidden',display:'flex',flexDirection:'column',zIndex:100,transition:'width 0.2s ease',boxShadow:'4px 0 30px rgba(0,0,0,0.04)'}}>
        <div style={{padding:collapsed?'16px 12px':'18px 20px',borderBottom:'1px solid rgba(0,0,0,0.06)',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <svg width={collapsed?32:40} height={collapsed?28:34} viewBox="0 0 56 48" style={{flexShrink:0}}>
            <rect x="0"  y="0"  width="16" height="9" rx="2" fill="rgba(0,0,0,0.25)"/>
            <rect x="20" y="0"  width="24" height="9" rx="2" fill="#c8a84b"/>
            <rect x="0"  y="13" width="24" height="9" rx="2" fill="#c8a84b"/>
            <rect x="28" y="13" width="16" height="9" rx="2" fill="#c8a84b"/>
            <rect x="0"  y="26" width="10" height="9" rx="2" fill="#c8a84b"/>
            <rect x="14" y="26" width="30" height="9" rx="2" fill="#c8a84b"/>
          </svg>
          {!collapsed&&<div style={{lineHeight:1.1}}><div style={{fontFamily:"'Nunito',sans-serif",fontWeight:700,color:'rgba(0,0,0,0.35)',fontSize:7,letterSpacing:'0.10em',textTransform:'uppercase',marginBottom:1}}>DEPÓSITO JIMÉNEZ</div><div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,color:'#c8a84b',fontSize:18,letterSpacing:'0.04em',lineHeight:1}}>SOL</div><div style={{fontFamily:"'Rubik',sans-serif",fontWeight:400,color:'rgba(0,0,0,0.3)',fontSize:7.5,letterSpacing:'0.06em',textTransform:'uppercase',marginTop:2}}>Sistema de Operaciones y Logística</div></div>}
        </div>
        {!loading&&perfil&&!collapsed&&(
          <div style={{padding:'10px 20px',borderBottom:'1px solid rgba(0,0,0,0.06)',flexShrink:0}}>
            <div style={{fontSize:'0.72rem',color:'rgba(0,0,0,0.35)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Sesión activa</div>
            <div style={{fontSize:'0.82rem',color:'rgba(0,0,0,0.75)',fontWeight:500,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{perfil.nombre||perfil.email}</div>
            <span style={{display:'inline-block',marginTop:4,background:(ROL_COLOR[perfil.rol]||'#666')+'22',color:ROL_COLOR[perfil.rol]||'#666',border:'1px solid '+(ROL_COLOR[perfil.rol]||'#666')+'44',borderRadius:20,padding:'1px 8px',fontSize:'0.68rem',fontWeight:600}}>{perfil.rol}</span>
          </div>
        )}
        <nav style={{flex:1,padding:'10px 0',overflowY:'auto'}}>
          {navVisible.map(g=>(
            <div key={g.group} style={{marginBottom:4}}>
              {!collapsed&&<div style={{padding:'8px 20px 4px',fontSize:'0.60rem',fontWeight:700,color:'rgba(0,0,0,0.25)',textTransform:'uppercase',letterSpacing:'0.12em',fontFamily:"'Rubik',sans-serif"}}>{g.group}</div>}
              {g.items.map(item=><NavItem key={item.href} {...item} collapsed={collapsed} isActive={pathname===item.href||(item.href!=='/'&&pathname?.startsWith(item.href))}/>)}
            </div>
          ))}
        </nav>
        <div style={{padding:'12px 8px',borderTop:'1px solid rgba(0,0,0,0.06)',flexShrink:0}}>
          {!collapsed&&<button onClick={logout} style={{width:'100%',padding:'8px 12px',background:'rgba(200,168,75,0.1)',border:'1px solid rgba(200,168,75,0.25)',borderRadius:10,color:'#c8a84b',cursor:'pointer',fontSize:'0.78rem',fontFamily:"'Rubik',sans-serif",display:'flex',alignItems:'center',gap:8,marginBottom:8}} onMouseEnter={e=>e.currentTarget.style.background='rgba(200,168,75,0.18)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(200,168,75,0.1)'}><span>→</span><span>Cerrar sesión</span></button>}
          <button onClick={()=>setCollapsed(!collapsed)} style={{width:'100%',padding:'9px 12px',background:'rgba(0,0,0,0.03)',border:'none',borderRadius:10,color:'rgba(0,0,0,0.4)',cursor:'pointer',fontSize:12,fontFamily:"'Rubik',sans-serif",display:'flex',alignItems:'center',justifyContent:collapsed?'center':'flex-start',gap:8}} onMouseEnter={e=>e.currentTarget.style.background='rgba(0,0,0,0.06)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(0,0,0,0.03)'}><span style={{fontSize:14}}>{collapsed?'→':'←'}</span>{!collapsed&&<span>Colapsar</span>}</button>
          {!collapsed&&<div style={{padding:'10px 12px 0',fontSize:'0.62rem',color:'rgba(0,0,0,0.2)',fontFamily:"'Rubik',sans-serif"}}>SOL v2.0 · 2026</div>}
        </div>
      </aside>
    </>
  );
}
