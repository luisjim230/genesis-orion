'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';

const GOLD = '#c8a84b';
const BG   = '#1c1f26';

export default function SyncBadge({ reporteIds = [], label = 'Última actualización' }) {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!reporteIds.length) return;
    const fetch = async () => {
      const { data } = await supabase
        .from('sync_status')
        .select('ultima_sync, exitoso, nombre')
        .in('id', reporteIds)
        .order('ultima_sync', { ascending: false })
        .limit(1);
      if (data?.[0]) setInfo(data[0]);
    };
    fetch();
    // Refrescar cada 5 minutos
    const interval = setInterval(fetch, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [reporteIds.join(",")]);

  if (!info) return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:BG,
      border:'1px solid #2a2d35', borderRadius:6, padding:'4px 10px', fontSize:11, color:'#666' }}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:'#555', display:'inline-block' }} />
      Sin datos de sync
    </div>
  );

  const fecha = info.ultima_sync
    ? new Date(info.ultima_sync).toLocaleString('es-CR', {
        timeZone: 'America/Costa_Rica',
        day:'2-digit', month:'2-digit', year:'numeric',
        hour:'2-digit', minute:'2-digit'
      })
    : '—';

  const ok = info.exitoso !== false;
  const dot = ok ? '#4ade80' : '#f87171';
  const hace = info.ultima_sync ? tiempoAtras(new Date(info.ultima_sync)) : '';

  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:6, background:BG,
      border:`1px solid ${ok ? '#2a3a2a' : '#3a2a2a'}`, borderRadius:6,
      padding:'4px 10px', fontSize:11, color:'#aaa' }}
      title={`${info.nombre} — ${fecha}`}>
      <span style={{ width:7, height:7, borderRadius:'50%', background:dot,
        boxShadow:`0 0 5px ${dot}`, display:'inline-block', flexShrink:0 }} />
      <span style={{ color:'#666' }}>{label}:</span>
      <span style={{ color: GOLD, fontWeight:600 }}>{fecha}</span>
      {hace && <span style={{ color:'#555' }}>({hace})</span>}
    </div>
  );
}

function tiempoAtras(fecha) {
  const mins = Math.floor((Date.now() - fecha) / 60000);
  if (mins < 1) return 'hace un momento';
  if (mins < 60) return `hace ${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `hace ${hrs}h`;
  return `hace ${Math.floor(hrs/24)}d`;
}
