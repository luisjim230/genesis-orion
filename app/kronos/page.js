'use client';
import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import KronosTab from '../inventario/KronosTab';

export default function KronosPage() {
  const [calc, setCalc] = useState([]);
  const [transitoMap, setTransitoMap] = useState({});
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [progreso, setProgreso] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [syncMsg, setSyncMsg] = useState(null);

  async function cargarDatos() {
    setCargando(true);
    setError(null);
    setProgreso(0);
    try {
      const BATCH = 1000;
      let allInv = [];
      let offset = 0;
      while (true) {
        const { data: inv, error: eInv } = await supabase
          .from('neo_minimos_maximos')
          .select('*')
          .eq('activo', 'Sí')
          .range(offset, offset + BATCH - 1);
        if (eInv) throw eInv;
        if (!inv || inv.length === 0) break;
        allInv = allInv.concat(inv);
        setProgreso(allInv.length);
        if (inv.length < BATCH) break;
        offset += BATCH;
      }

      const { data: transito, error: eTrans } = await supabase
        .from('ordenes_compra_items')
        .select('codigo, cantidad_ordenada, cantidad_recibida, estado_item')
        .neq('estado_item', 'recibido');
      if (eTrans) throw eTrans;

      const tMap = {};
      (transito || []).forEach(t => {
        const pendiente = (parseFloat(t.cantidad_ordenada) || 0) - (parseFloat(t.cantidad_recibida) || 0);
        if (pendiente > 0) tMap[t.codigo] = (tMap[t.codigo] || 0) + pendiente;
      });

      setTransitoMap(tMap);
      setCalc(allInv);
    } catch (err) {
      console.error('[Kronos] Error cargando datos:', err);
      setError(err.message || 'Error al cargar datos');
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => { cargarDatos(); }, []);

  async function sincronizarTodo() {
    setSincronizando(true);
    setSyncMsg(null);
    try {
      const r = await fetch('/api/refresh-all', { method: 'POST' });
      const j = await r.json();
      const fallidas = (j.detalle || []).filter(d => !d.ok).map(d => d.rpc);
      if (fallidas.length) setSyncMsg(`Sincronizado en ${(j.ms / 1000).toFixed(1)}s. Fallaron: ${fallidas.join(', ')}`);
      else setSyncMsg(`Sincronizado en ${(j.ms / 1000).toFixed(1)}s (${j.exitosas}/${j.total} vistas).`);
      await cargarDatos();
    } catch (e) {
      setSyncMsg('Error: ' + e.message);
    } finally {
      setSincronizando(false);
      setTimeout(() => setSyncMsg(null), 6000);
    }
  }

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#2a3a50', margin: 0 }}>
            📈 Proyección de inventario
          </h1>
          <p style={{ fontSize: '0.82rem', color: '#666', margin: '6px 0 0' }}>
            Cobertura de stock por producto y fecha estimada de quiebre según lead time por proveedor.
          </p>
        </div>
        <button
          onClick={sincronizarTodo}
          disabled={sincronizando || cargando}
          style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--orange)', background: 'white', color: 'var(--orange)', fontWeight: 600, fontSize: '0.82rem', cursor: sincronizando ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}
        >
          {sincronizando ? '⏳ Sincronizando...' : '🔄 Sincronizar todo'}
        </button>
      </div>

      {syncMsg && (
        <div style={{ marginBottom: 14, padding: '10px 14px', borderRadius: 8, background: '#F0FFF4', border: '1px solid #9AE6B4', color: '#22543D', fontSize: '0.82rem' }}>
          {syncMsg}
        </div>
      )}

      {cargando && (
        <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
          Cargando inventario{progreso > 0 ? ` (${progreso} productos cargados...)` : '...'}
        </div>
      )}

      {error && (
        <div style={{ background: '#FFF5F5', border: '1px solid #FC8181', borderRadius: 8, padding: 16, color: '#C53030' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {!cargando && !error && (
        <KronosTab calc={calc} transitoMap={transitoMap} />
      )}
    </div>
  );
}
