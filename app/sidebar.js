'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth } from '../lib/useAuth';

const nunitoStyle = `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;800;900&display=swap');`;
const ALL_NAV=[
  {group:'Principal',items:[{href:'/',key:'dashboard',icon:'⊞',name:'Dashboard'},{href:'/reportes',key:'reportes',icon:'📊',name:'Carga de reportes'}]},
  {group:'Inventario',items:[{href:'/inventario',key:'inventario',icon:'📦',name:'Compras'},{href:'/trazabilidad',key:'trazabilidad',icon:'🔴',name:'Trazabilidad'},{href:'/kronos',key:'kronos',icon:'📈',name:'Proyección de inventario'}]},
  {group:'Comercial',items:[{href:'/comercial',key:'comercial',icon:'💼',name:'Ventas · Equipo'}]},
  {group:'Importaciones',items:[{href:'/cif',key:'cif',icon:'🧮',name:'Calculadora CIF'},{href:'/contenedores',key:'contenedores',icon:'🚢',name:'Cargas en tránsito'},{href:'/aduana',key:'aduana',icon:'🛃',name:'Aduana · TLC China'}]},
  {group:'Inteligencia',items:[{href:'/mercado',key:'mercado',icon:'⚡',name:'Mercado'},{href:'/radar',key:'radar',icon:'📡',name:'RADAR'},{href:'/campanas',key:'campanas',icon:'📣',name:'Campañas'},{href:'/metricas-web',key:'metricas-web',icon:'📊',name:'Métricas Web'}]},
  {group:'Operaciones',items:[{href:'/cajas-aurora',key:'cajas-aurora',icon:'🌅',name:'Cajas'},{href:'/entregas',key:'entregas',icon:'🚛',name:'Entregas'}]},
  {group:'Finanzas',items:[{href:'/finanzas',key:'finanzas',icon:'💰',name:'Finanzas'},{href:'/finanzas/bancos',key:'bancos',icon:'🏦',name:'Bancos'},{href:'/pagos',key:'pagos',icon:'💸',name:'Coordinación de pagos'}]},
  {group:'Gestión',items:[{href:'/tareas',key:'tareas',icon:'✅',name:'Tareas'},{href:'/tareas-equipo',key:'tareas-equipo',icon:'📋',name:'Tareas Equipo'},{href:'/social',key:'social',icon:'📱',name:'Redes Sociales'},{href:'/kommo-proveedores',key:'kommo-proveedores',icon:'📲',name:'WhatsApp Proveedores'}]},
  {group:'Herramientas',items:[{href:'/ponderacion',key:'ponderacion',icon:'⚖️',name:'Promedios ponderados'},{href:'/materiales',key:'materiales',icon:'🧱',name:'Cálculo de materiales'},{href:'/fichas-tecnicas',key:'fichas-tecnicas',icon:'📋',name:'Fichas Técnicas'},{href:'/garantias',key:'garantias',icon:'🔄',name:'Devoluciones y Garantías'},{href:'/encomiendas',key:'encomiendas',icon:'📦',name:'Encomiendas'}]},
  {group:'Recursos Humanos',items:[{href:'/rrhh',key:'rrhh',icon:'👔',name:'Permisos y Vacaciones'}]},
  {group:'Admin',items:[{href:'/admin',key:'admin',icon:'👥',name:'Usuarios',adminOnly:true}]},
];
const ROL_COLOR={admin:'#ED6E2E',bodega:'#63b3ed',ventas:'#68d391',finanzas:'#c8a84b',logistica:'#b794f4'};

function NavItem({href,icon,name,collapsed,isActive}){
  return(
    <Link href={href} style={{textDecoration:'none',display:'block'}}>
      <div style={{display:'flex',alignItems:'center',gap:10,padding:'8px 16px',cursor:'pointer',borderRadius:10,margin:'1px 8px',borderLeft:isActive?'3px solid #c8a84b':'3px solid transparent',background:isActive?'rgba(200,168,75,0.15)':'transparent',transition:'all 0.15s ease'}}
        onMouseEnter={e=>{if(!isActive)e.currentTarget.style.background='rgba(255,255,255,0.06)';}}
        onMouseLeave={e=>{if(!isActive)e.currentTarget.style.background='transparent';}}>
        <span style={{fontSize:'1rem',flexShrink:0,width:20,textAlign:'center'}}>{icon}</span>
        {!collapsed&&<div style={{fontSize:'0.82rem',fontWeight:isActive?600:400,color:isActive?'#c8a84b':'rgba(255,255,255,0.75)',lineHeight:1.3,fontFamily:"'Rubik',sans-serif",overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{name}</div>}
      </div>
    </Link>
  );
}

export default function Sidebar(){
  const [collapsed,setCollapsed]=useState(false);
  const [search, setSearch] = useState('');
  const {perfil,loading,logout,puedeVer}=useAuth();
  const pathname=usePathname();
  const navAll=ALL_NAV.map(g=>({...g,items:g.items.filter(i=>i.adminOnly?perfil?.rol==='admin':puedeVer(i.key))})).filter(g=>g.items.length>0);
  // Normaliza para búsqueda insensible a tildes y mayúsculas.
  // Ej: "métricas" y "metricas" se convierten ambos a "metricas".
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const q = norm(search.trim());
  const navVisible = q
    ? navAll.map(g => ({ ...g, items: g.items.filter(i => norm(i.name).includes(q) || norm(g.group).includes(q)) })).filter(g => g.items.length > 0)
    : navAll;

  // Grupos colapsables: solo abre el grupo que contiene la página activa
  const [openGroups, setOpenGroups] = useState({});

  useEffect(() => {
    const active = {};
    navVisible.forEach(g => {
      const hasActive = g.items.some(i => pathname === i.href || (i.href !== '/' && pathname?.startsWith(i.href)));
      if (hasActive) active[g.group] = true;
    });
    // Dashboard siempre visible
    active['Principal'] = true;
    setOpenGroups(active);
  }, [pathname]);

  const toggleGroup = (group) => {
    setOpenGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  return(
    <>
      <style>{nunitoStyle}</style>
      <aside style={{width:collapsed?64:240,background:'#5E2733',borderRight:'1px solid rgba(255,255,255,0.08)',position:'fixed',top:0,left:0,height:'100vh',overflowY:'auto',overflowX:'hidden',display:'flex',flexDirection:'column',zIndex:100,transition:'width 0.2s ease',boxShadow:'4px 0 30px rgba(0,0,0,0.15)'}}>
        <div style={{padding:collapsed?'16px 12px':'18px 20px',borderBottom:'1px solid rgba(255,255,255,0.08)',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <svg width={collapsed?32:40} height={collapsed?28:34} viewBox="0 0 56 48" style={{flexShrink:0}}>
            <rect x="0"  y="0"  width="16" height="9" rx="2" fill="rgba(255,255,255,0.85)"/>
            <rect x="20" y="0"  width="24" height="9" rx="2" fill="#c8a84b"/>
            <rect x="0"  y="13" width="24" height="9" rx="2" fill="#c8a84b"/>
            <rect x="28" y="13" width="16" height="9" rx="2" fill="#c8a84b"/>
            <rect x="0"  y="26" width="10" height="9" rx="2" fill="#c8a84b"/>
            <rect x="14" y="26" width="30" height="9" rx="2" fill="#c8a84b"/>
          </svg>
          {!collapsed&&<div style={{lineHeight:1.1}}><div style={{fontFamily:"'Nunito',sans-serif",fontWeight:700,color:'rgba(255,255,255,0.45)',fontSize:7,letterSpacing:'0.10em',textTransform:'uppercase',marginBottom:1}}>DEPÓSITO JIMÉNEZ</div><div style={{fontFamily:"'Nunito',sans-serif",fontWeight:900,color:'#c8a84b',fontSize:18,letterSpacing:'0.04em',lineHeight:1}}>SOL</div><div style={{fontFamily:"'Rubik',sans-serif",fontWeight:400,color:'rgba(255,255,255,0.35)',fontSize:7.5,letterSpacing:'0.06em',textTransform:'uppercase',marginTop:2}}>Sistema de Operaciones y Logística</div></div>}
        </div>
        {!loading&&perfil&&!collapsed&&(
          <div style={{padding:'10px 20px',borderBottom:'1px solid rgba(255,255,255,0.08)',flexShrink:0}}>
            <div style={{fontSize:'0.72rem',color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.08em'}}>Sesión activa</div>
            <div style={{fontSize:'0.82rem',color:'rgba(255,255,255,0.85)',fontWeight:500,marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{perfil.nombre||perfil.email}</div>
            <span style={{display:'inline-block',marginTop:4,background:(ROL_COLOR[perfil.rol]||'#666')+'33',color:ROL_COLOR[perfil.rol]||'#ccc',border:'1px solid '+(ROL_COLOR[perfil.rol]||'#666')+'55',borderRadius:20,padding:'1px 8px',fontSize:'0.68rem',fontWeight:600}}>{perfil.rol}</span>
          </div>
        )}
        {!collapsed && (
          <div style={{padding:'8px 12px',flexShrink:0}}>
            <div style={{position:'relative'}}>
              <input
                type="text"
                placeholder="Buscar módulo..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{
                  width:'100%',
                  padding:'7px 12px 7px 30px',
                  background:'rgba(255,255,255,0.08)',
                  border:'1px solid rgba(255,255,255,0.1)',
                  borderRadius:8,
                  color:'rgba(255,255,255,0.85)',
                  fontSize:'0.8rem',
                  fontFamily:"'Rubik',sans-serif",
                  outline:'none',
                  boxSizing:'border-box',
                  transition:'border-color 0.15s',
                }}
                onFocus={e => e.target.style.borderColor='rgba(200,168,75,0.4)'}
                onBlur={e => e.target.style.borderColor='rgba(255,255,255,0.1)'}
              />
              <span style={{position:'absolute',left:10,top:'50%',transform:'translateY(-50%)',fontSize:'0.75rem',color:'rgba(255,255,255,0.35)',pointerEvents:'none'}}>&#128269;</span>
              {search && <span onClick={() => setSearch('')} style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontSize:'0.7rem',color:'rgba(255,255,255,0.4)',cursor:'pointer',padding:'2px 4px'}}>✕</span>}
            </div>
          </div>
        )}
        <nav style={{flex:1,padding:'6px 0',overflowY:'auto'}}>
          {navVisible.map(g=>{
            const isOpen = search.trim() ? true : openGroups[g.group];
            const hasActive = g.items.some(i => pathname === i.href || (i.href !== '/' && pathname?.startsWith(i.href)));
            // Grupos con 1 solo ítem se muestran directamente sin header colapsable
            if (g.items.length === 1 && g.group === 'Principal') {
              return <div key={g.group} style={{marginBottom:2}}>{g.items.map(item=><NavItem key={item.href} {...item} collapsed={collapsed} isActive={pathname===item.href||(item.href!=='/'&&pathname?.startsWith(item.href))}/>)}</div>;
            }
            return (
              <div key={g.group} style={{marginBottom:2}}>
                {!collapsed ? (
                  <div
                    onClick={() => toggleGroup(g.group)}
                    style={{
                      padding:'7px 20px 4px',
                      fontSize:'0.62rem',
                      fontWeight:700,
                      color: hasActive ? 'rgba(200,168,75,0.7)' : 'rgba(255,255,255,0.3)',
                      textTransform:'uppercase',
                      letterSpacing:'0.10em',
                      fontFamily:"'Rubik',sans-serif",
                      cursor:'pointer',
                      display:'flex',
                      alignItems:'center',
                      justifyContent:'space-between',
                      userSelect:'none',
                      transition:'color 0.15s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = hasActive ? 'rgba(200,168,75,0.9)' : 'rgba(255,255,255,0.5)'}
                    onMouseLeave={e => e.currentTarget.style.color = hasActive ? 'rgba(200,168,75,0.7)' : 'rgba(255,255,255,0.3)'}
                  >
                    <span>{g.group}</span>
                    <span style={{fontSize:'0.55rem',transition:'transform 0.2s',transform:isOpen?'rotate(0deg)':'rotate(-90deg)'}}>{isOpen ? '▾' : '▾'}</span>
                  </div>
                ) : (
                  <div style={{padding:'6px 0',borderBottom:'1px solid rgba(255,255,255,0.06)'}} />
                )}
                {(isOpen || collapsed) && g.items.map(item=>
                  <NavItem key={item.href} {...item} collapsed={collapsed} isActive={pathname===item.href||(item.href!=='/'&&pathname?.startsWith(item.href))}/>
                )}
              </div>
            );
          })}
        </nav>
        <div style={{padding:'12px 8px',borderTop:'1px solid rgba(255,255,255,0.08)',flexShrink:0}}>
          {!collapsed&&<button onClick={logout} style={{width:'100%',padding:'8px 12px',background:'rgba(200,168,75,0.12)',border:'1px solid rgba(200,168,75,0.25)',borderRadius:10,color:'rgba(200,168,75,0.8)',cursor:'pointer',fontSize:'0.78rem',fontFamily:"'Rubik',sans-serif",display:'flex',alignItems:'center',gap:8,marginBottom:8}} onMouseEnter={e=>e.currentTarget.style.background='rgba(200,168,75,0.20)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(200,168,75,0.12)'}><span>→</span><span>Cerrar sesión</span></button>}
          <button onClick={()=>setCollapsed(!collapsed)} style={{width:'100%',padding:'9px 12px',background:'rgba(255,255,255,0.06)',border:'none',borderRadius:10,color:'rgba(255,255,255,0.45)',cursor:'pointer',fontSize:12,fontFamily:"'Rubik',sans-serif",display:'flex',alignItems:'center',justifyContent:collapsed?'center':'flex-start',gap:8}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.10)'} onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.06)'}><span style={{fontSize:14}}>{collapsed?'→':'←'}</span>{!collapsed&&<span>Colapsar</span>}</button>
          {!collapsed&&<div style={{padding:'10px 12px 0',fontSize:'0.62rem',color:'rgba(255,255,255,0.2)',fontFamily:"'Rubik',sans-serif"}}>SOL v2.0 · 2026</div>}
        </div>
      </aside>
    </>
  );
}
