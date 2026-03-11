'use client';
import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import KronosTab from '../inventario/KronosTab';

export default function KronosPage() {
  const [calc, setCalc]           = useState([]);
  const [transitoMap, setTransitoMap] = useState({});
  const [cargando, setCargando]   = useState(true);
  const [error, setError]         = useState(null);

  useEffect(() => {
    async function cargarDatos() {
      setCargando(true);
      setError(null);
      try {
        // 1. Inventario principal
        const { data: inv, error: eInv } = await supabase
          .from('neo_minimos_maximos')
          .select('*')
          .eq('activo', true);
        if (eInv) throw eInv;

        // 2. En tránsito (ordenes_compra_items con recibido=false)
        const { data: transito, error: eTrans } = await supabase
          .from('ordenes_compra_items')
          .select('codigo, cantidad_pedida, cantidad_recibida, recibido')
          .eq('recibido', false);
        if (eTrans) throw eTrans;

        // Construir transitoMap: { codigo: cantidadEnTransito }
        const tMap = {};
        (transito || []).forEach(t => {
          const pendiente = (parseFloat(t.cantidad_pedida) || 0) - (parseFloat(t.cantidad_recibida) || 0);
          if (pendiente > 0) {
            tMap[t.codigo] = (tMap[t.codigo] || 0) + pendiente;
          }
        });

        setTransitoMap(tMap);
        setCalc(inv || []);
      } catch (err) {
        console.error('[Kronos] Error cargando datos:', err);
        setError(err.message || 'Error al cargar datos');
      } finally {
        setCargando(false);
      }
    }
    cargarDatos();
  }, []);

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#2a3a50', margin: 0 }}>
          📈 Proyección de inventario
        </h1>
        <p style={{ fontSize: '0.82rem', color: '#666', margin: '6px 0 0' }}>
          Cobertura de stock por producto y fecha estimada de quiebre según lead time por proveedor.
        </p>
      </div>

      {cargando && (
        <div style={{ textAlign: 'center', padding: 60, color: '#666' }}>
          <div style={{ fontSize: '2rem', marginBottom: 12 }}>⏳</div>
          Cargando inventario...
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
