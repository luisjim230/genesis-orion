'use client';
import { Suspense, useEffect, useState, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import FiltrosToolbar from './FiltrosToolbar.js';
import ProyeccionVentasTab from './ProyeccionVentasTab.js';
import NecesidadCompraTab from './NecesidadCompraTab.js';
import PlanProveedorTab from './PlanProveedorTab.js';
import SkuDetailDrawer from './SkuDetailDrawer.js';
import { fmtFecha } from './ui.js';

const TABS = [
  { id: 'ventas',   label: '📈 Proyección de Ventas' },
  { id: 'compra',   label: '🛒 Necesidad de Compra' },
  { id: 'proveedor',label: '🏭 Plan por Proveedor' },
];

const FILTROS_INICIAL = {
  busqueda: '',
  categoria: [],
  proveedor: [],
  madurez: [],
  semaforo: [],
  clasificacion: [],
  ocultar_pausados: false,
  ocultar_ocultos: false,
  ocultar_discontinuar: false,
};

export default function ProfeciasPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Cargando…</div>}>
      <ProfeciasInner />
    </Suspense>
  );
}

function ProfeciasInner() {
  const router = useRouter();
  const params = useSearchParams();
  const tabUrl = params.get('tab');
  const tabActivo = TABS.some((t) => t.id === tabUrl) ? tabUrl : 'ventas';

  const [filas, setFilas] = useState([]);
  const [calculadoEn, setCalculadoEn] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [filtros, setFiltros] = useState(FILTROS_INICIAL);
  const [skuActivo, setSkuActivo] = useState(null);
  const [refrescando, setRefrescando] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const r = await fetch('/api/profecias/panel');
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error');
      setFilas(j.filas || []);
      setCalculadoEn(j.calculado_en || null);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => { cargar(); }, [cargar]);

  // Filtrado en cliente (más reactivo, ya que la query trae todo)
  const filasFiltradas = useMemo(() => {
    let arr = filas;
    if (filtros.busqueda?.trim()) {
      const palabras = filtros.busqueda.toLowerCase().split(/\s+/).filter(Boolean);
      arr = arr.filter((f) => {
        const h = `${f.codigo_interno} ${f.item || ''} ${f.marca || ''} ${f.categoria || ''}`.toLowerCase();
        return palabras.every((p) => h.includes(p));
      });
    }
    if (filtros.categoria.length) arr = arr.filter((f) => filtros.categoria.includes(f.categoria));
    if (filtros.proveedor.length) arr = arr.filter((f) => filtros.proveedor.includes(f.ultimo_proveedor));
    if (filtros.madurez.length) arr = arr.filter((f) => filtros.madurez.includes(f.madurez));
    if (filtros.semaforo.length) arr = arr.filter((f) => filtros.semaforo.includes(f.semaforo));
    if (filtros.clasificacion.length) arr = arr.filter((f) => filtros.clasificacion.includes(f.clasificacion_manual));
    if (filtros.ocultar_pausados) arr = arr.filter((f) => !f.proveedor_pausado);
    if (filtros.ocultar_ocultos) arr = arr.filter((f) => !f.oculto_compras);
    if (filtros.ocultar_discontinuar) arr = arr.filter((f) => f.clasificacion_manual !== 'dormido_discontinuar');
    return arr;
  }, [filas, filtros]);

  const cambiarTab = (id) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', id);
    router.replace(url.pathname + url.search, { scroll: false });
  };

  async function refrescar() {
    setRefrescando(true);
    setRefreshMsg(null);
    try {
      const r = await fetch('/api/profecias/refresh', { method: 'POST' });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error');
      setRefreshMsg(`Recalculado en ${(j.ms / 1000).toFixed(1)}s.`);
      await cargar();
    } catch (e) {
      setRefreshMsg('Error: ' + e.message);
    } finally {
      setRefrescando(false);
    }
  }

  // KPIs cabecera
  const kpis = useMemo(() => {
    const k = { total: filasFiltradas.length, rojos: 0, amarillos: 0, recien: 0, sugerir: 0, inversion: 0 };
    for (const f of filasFiltradas) {
      if (f.semaforo === 'rojo' || f.semaforo === 'rojo_critico') k.rojos += 1;
      if (f.semaforo === 'amarillo') k.amarillos += 1;
      if (f.madurez === 'recien_nacido') k.recien += 1;
      if (f.cantidad_sugerida > 0) {
        k.sugerir += 1;
        k.inversion += (Number(f.cantidad_sugerida) || 0) * (Number(f.ultimo_costo) || 0);
      }
    }
    return k;
  }, [filasFiltradas]);

  return (
    <div style={{ padding: '20px 24px', background: '#f0f2f5', minHeight: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, color: '#1c1f26' }}>
            <span style={{ color: '#c8a84b' }}>🔭</span> Profecías
          </h1>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: '#718096' }}>
            Proyección de demanda y planificación de compras corregidas por edad de catálogo.
            {calculadoEn && <> · Último recálculo: {fmtFecha(calculadoEn)} {new Date(calculadoEn).toLocaleTimeString('es-CR', { hour: '2-digit', minute: '2-digit' })}</>}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {refreshMsg && <span style={{ fontSize: 12, color: '#4a5568' }}>{refreshMsg}</span>}
          <button onClick={refrescar} disabled={refrescando} style={btnPri}>
            {refrescando ? 'Recalculando…' : '↻ Recalcular'}
          </button>
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginBottom: 14 }}>
        <Kpi label="SKUs visibles" valor={kpis.total.toLocaleString('es-CR')} />
        <Kpi label="🔴 Rojos" valor={kpis.rojos.toLocaleString('es-CR')} color="#E53E3E" />
        <Kpi label="🟡 Amarillos" valor={kpis.amarillos.toLocaleString('es-CR')} color="#D69E2E" />
        <Kpi label="🆕 Recién nacidos" valor={kpis.recien.toLocaleString('es-CR')} color="#805AD5" />
        <Kpi label="🛒 Con sugerencia" valor={kpis.sugerir.toLocaleString('es-CR')} color="#c8a84b" />
        <Kpi label="💰 Inv. estimada" valor={'₡' + Math.round(kpis.inversion).toLocaleString('es-CR')} color="#1c1f26" />
      </div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 12, borderBottom: '2px solid #e2e8f0' }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => cambiarTab(t.id)} style={{
            padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer',
            fontSize: 13, fontWeight: 600,
            color: tabActivo === t.id ? '#c8a84b' : '#4a5568',
            borderBottom: tabActivo === t.id ? '3px solid #c8a84b' : '3px solid transparent',
            marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {tabActivo !== 'proveedor' && (
        <FiltrosToolbar filas={filas} filtros={filtros} setFiltros={setFiltros} modo={tabActivo === 'compra' ? 'compra' : 'ventas'} />
      )}

      {cargando && <div style={{ padding: 40, textAlign: 'center', color: '#718096' }}>Cargando profecías…</div>}
      {error && <div style={{ padding: 16, background: '#FED7D7', color: '#822727', borderRadius: 6 }}>Error: {error}</div>}

      {!cargando && !error && (
        <>
          {tabActivo === 'ventas' && <ProyeccionVentasTab filas={filasFiltradas} onSeleccionar={setSkuActivo} />}
          {tabActivo === 'compra' && <NecesidadCompraTab filas={filasFiltradas} onSeleccionar={setSkuActivo} onAprobado={cargar} />}
          {tabActivo === 'proveedor' && <PlanProveedorTab onSeleccionar={setSkuActivo} onCambio={cargar} />}
        </>
      )}

      {skuActivo && (
        <SkuDetailDrawer
          codigo={skuActivo}
          onClose={() => setSkuActivo(null)}
          onClasificacionChange={() => cargar()}
        />
      )}
    </div>
  );
}

function Kpi({ label, valor, color }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: '10px 12px',
    }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', color: '#718096', letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || '#1c1f26' }}>{valor}</div>
    </div>
  );
}

const btnPri = { padding: '8px 16px', borderRadius: 6, border: 'none', background: '#c8a84b', color: '#1c1f26', fontWeight: 700, cursor: 'pointer', fontSize: 13 };
