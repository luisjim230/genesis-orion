'use client';
import { useMemo } from 'react';
import { CLASIFICACIONES, MADUREZ, SEMAFORO } from './ui.js';

export default function FiltrosToolbar({ filas, filtros, setFiltros, modo = 'ventas' }) {
  const opciones = useMemo(() => {
    const cats = new Set();
    const provs = new Set();
    for (const f of filas || []) {
      if (f.categoria) cats.add(f.categoria);
      if (f.ultimo_proveedor) provs.add(f.ultimo_proveedor);
    }
    return {
      categorias: [...cats].sort(),
      proveedores: [...provs].sort(),
    };
  }, [filas]);

  const set = (k, v) => setFiltros((prev) => ({ ...prev, [k]: v }));
  const toggleArr = (k, v) => setFiltros((prev) => {
    const cur = new Set(prev[k] || []);
    if (cur.has(v)) cur.delete(v); else cur.add(v);
    return { ...prev, [k]: [...cur] };
  });

  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
      padding: 12, marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center',
    }}>
      <input
        type="search"
        placeholder="Buscar código, nombre, marca…"
        value={filtros.busqueda || ''}
        onChange={(e) => set('busqueda', e.target.value)}
        style={{
          padding: '6px 10px', border: '1px solid #cbd5e0', borderRadius: 6,
          minWidth: 240, fontSize: 13,
        }}
      />

      <Multi label="Categoría" opciones={opciones.categorias} value={filtros.categoria || []} onToggle={(v) => toggleArr('categoria', v)} />
      <Multi label="Proveedor" opciones={opciones.proveedores} value={filtros.proveedor || []} onToggle={(v) => toggleArr('proveedor', v)} />
      <Multi label="Madurez" opciones={Object.keys(MADUREZ)} formatter={(v) => MADUREZ[v]?.label || v} value={filtros.madurez || []} onToggle={(v) => toggleArr('madurez', v)} />
      <Multi label="Semáforo" opciones={Object.keys(SEMAFORO)} formatter={(v) => SEMAFORO[v]?.label || v} value={filtros.semaforo || []} onToggle={(v) => toggleArr('semaforo', v)} />
      <Multi label="Clasificación" opciones={CLASIFICACIONES.map((c) => c.value)} formatter={(v) => CLASIFICACIONES.find((c) => c.value === v)?.label || v} value={filtros.clasificacion || []} onToggle={(v) => toggleArr('clasificacion', v)} />

      <label style={lblCheck}>
        <input type="checkbox" checked={!!filtros.ocultar_pausados} onChange={(e) => set('ocultar_pausados', e.target.checked)} />
        Ocultar proveedor pausado
      </label>
      <label style={lblCheck}>
        <input type="checkbox" checked={!!filtros.ocultar_ocultos} onChange={(e) => set('ocultar_ocultos', e.target.checked)} />
        Ocultar SKUs ocultos
      </label>
      {modo === 'compra' && (
        <label style={lblCheck}>
          <input type="checkbox" checked={!!filtros.ocultar_discontinuar} onChange={(e) => set('ocultar_discontinuar', e.target.checked)} />
          Ocultar discontinuar
        </label>
      )}

      <button
        onClick={() => setFiltros({ busqueda: '' })}
        style={{ marginLeft: 'auto', padding: '6px 10px', borderRadius: 6, border: '1px solid #cbd5e0', background: '#fff', cursor: 'pointer', fontSize: 12 }}
      >Limpiar filtros</button>
    </div>
  );
}

const lblCheck = { fontSize: 12, color: '#4a5568', display: 'inline-flex', alignItems: 'center', gap: 4 };

function Multi({ label, opciones, value, onToggle, formatter }) {
  const sel = new Set(value);
  return (
    <details style={{ position: 'relative' }}>
      <summary style={{
        listStyle: 'none', cursor: 'pointer', padding: '6px 10px',
        border: '1px solid #cbd5e0', borderRadius: 6, fontSize: 12,
        background: sel.size ? 'rgba(200,168,75,0.12)' : '#fff',
      }}>
        {label}{sel.size > 0 && ` · ${sel.size}`}
      </summary>
      <div style={{
        position: 'absolute', top: '100%', left: 0, marginTop: 4,
        background: '#fff', border: '1px solid #cbd5e0', borderRadius: 6,
        padding: 6, maxHeight: 280, overflowY: 'auto', zIndex: 50,
        minWidth: 200, boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
      }}>
        {opciones.length === 0 && <div style={{ padding: 6, color: '#999', fontSize: 12 }}>—</div>}
        {opciones.map((opt) => (
          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={sel.has(opt)} onChange={() => onToggle(opt)} />
            <span>{formatter ? formatter(opt) : opt}</span>
          </label>
        ))}
      </div>
    </details>
  );
}
