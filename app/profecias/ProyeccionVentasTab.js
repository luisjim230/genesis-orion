'use client';
import { useState, useMemo } from 'react';
import { fmtFecha, fmtNum, MadurezBadge, BanderasIcons, TendenciaIndicator } from './ui.js';
import ClasificacionDropdown from './ClasificacionDropdown.js';

const PAGE = 100;

const VISTAS = [
  { id: 'ambos',  label: 'Ambos' },
  { id: 'real',   label: 'Solo venta real' },
  { id: 'ritmo',  label: 'Solo ritmo' },
];

const TT = {
  vendido: 'Unidades realmente vendidas en este período (sin extrapolar).',
  ritmo: 'Velocidad mensual implícita según las ventas del período. Si el producto tiene menos de N días, se calcula con sus días de vida. Devuelve — cuando hay muy pocos datos.',
  proyeccion: 'Demanda mensual estimada que el sistema usa para calcular cuánto pedir. Excluye facturas atípicas (mayoreo).',
  cobertura: 'Meses que durarán las existencias actuales con la demanda proyectada.',
  tendencia: 'Cambio de ritmo entre los últimos 90 y 180 días.',
};

export default function ProyeccionVentasTab({ filas, onSeleccionar }) {
  const [sort, setSort] = useState({ col: 'demanda_proyectada', dir: 'desc' });
  const [pagina, setPagina] = useState(1);
  const [vista, setVista] = useState('ambos');

  const ordenadas = useMemo(() => {
    const arr = [...filas];
    arr.sort((a, b) => {
      const va = a[sort.col]; const vb = b[sort.col];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const na = Number(va), nb = Number(vb);
      if (Number.isFinite(na) && Number.isFinite(nb)) return sort.dir === 'asc' ? na - nb : nb - na;
      return sort.dir === 'asc' ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return arr;
  }, [filas, sort]);

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / PAGE));
  const visibles = ordenadas.slice((pagina - 1) * PAGE, pagina * PAGE);

  const handleSort = (col) => {
    setSort((prev) => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
    setPagina(1);
  };

  const showVend = vista !== 'ritmo';
  const showRitmo = vista !== 'real';

  return (
    <div>
      <div style={{
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8,
        padding: '8px 12px', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 12, color: '#4a5568', fontWeight: 600 }}>Mostrar columnas:</span>
        <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid #cbd5e0', overflow: 'hidden' }}>
          {VISTAS.map((v) => (
            <button key={v.id} onClick={() => setVista(v.id)} style={{
              padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 12,
              background: vista === v.id ? '#c8a84b' : '#fff',
              color: vista === v.id ? '#1c1f26' : '#4a5568',
              fontWeight: vista === v.id ? 700 : 500,
            }}>{v.label}</button>
          ))}
        </div>
        <span style={{ fontSize: 11, color: '#718096', marginLeft: 'auto' }}>
          <span style={{ marginRight: 10 }}>🔬 datos insuficientes</span>
          <span>📊 outliers detectados</span>
        </span>
      </div>

      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#1c1f26', color: '#fff', position: 'sticky', top: 0 }}>
              <Th k="codigo_interno" sort={sort} onSort={handleSort}>Código</Th>
              <Th k="item" sort={sort} onSort={handleSort} style={{ minWidth: 240 }}>Nombre</Th>
              <Th k="categoria" sort={sort} onSort={handleSort}>Categoría</Th>
              <Th k="ultimo_proveedor" sort={sort} onSort={handleSort}>Proveedor</Th>
              <Th k="existencias" sort={sort} onSort={handleSort} num>Exist.</Th>
              <Th k="madurez" sort={sort} onSort={handleSort}>Madurez</Th>
              <Th k="dias_vida" sort={sort} onSort={handleSort} num>Días</Th>
              {showVend && <Th k="vendido_30d"  sort={sort} onSort={handleSort} num title="Unidades realmente vendidas en los últimos 30 días.">Vend. 30D</Th>}
              {showVend && <Th k="vendido_90d"  sort={sort} onSort={handleSort} num title="Unidades realmente vendidas en los últimos 90 días.">Vend. 90D</Th>}
              {showVend && <Th k="vendido_180d" sort={sort} onSort={handleSort} num title="Unidades realmente vendidas en los últimos 180 días.">Vend. 180D</Th>}
              {showRitmo && <Th k="velocidad_30d"  sort={sort} onSort={handleSort} num title={TT.ritmo}>Ritmo 30D</Th>}
              {showRitmo && <Th k="velocidad_90d"  sort={sort} onSort={handleSort} num title={TT.ritmo}>Ritmo 90D</Th>}
              {showRitmo && <Th k="velocidad_180d" sort={sort} onSort={handleSort} num title={TT.ritmo}>Ritmo 180D</Th>}
              <Th k="tendencia_pct"      sort={sort} onSort={handleSort} num title={TT.tendencia}>Tend.</Th>
              <Th k="demanda_proyectada" sort={sort} onSort={handleSort} num title={TT.proyeccion}>Proyección</Th>
              <Th k="meses_cobertura"    sort={sort} onSort={handleSort} num title={TT.cobertura}>Cob.</Th>
              <Th k="ultima_venta"       sort={sort} onSort={handleSort}>Últ. venta</Th>
              <th style={th}>⚑</th>
              <th style={th}>Clasificación</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => (
              <tr key={f.codigo_interno}
                onClick={() => onSeleccionar(f.codigo_interno)}
                style={{ cursor: 'pointer', borderBottom: '1px solid #f0f2f5' }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(200,168,75,0.06)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ ...td, fontFamily: 'monospace', color: '#1c1f26', fontWeight: 600 }}>{f.codigo_interno}</td>
                <td style={td}>{f.item}</td>
                <td style={td}>{f.categoria || '—'}</td>
                <td style={td}>{f.ultimo_proveedor}</td>
                <td style={tdNum}>{fmtNum(f.existencias, 0)}</td>
                <td style={td}><MadurezBadge value={f.madurez} /></td>
                <td style={tdNum}>{f.dias_vida || '—'}</td>
                {showVend && <td style={tdVend}>{fmtNum(f.vendido_30d, 0)}</td>}
                {showVend && <td style={tdVend}>{fmtNum(f.vendido_90d, 0)}</td>}
                {showVend && <td style={tdVend}>{fmtNum(f.vendido_180d, 0)}</td>}
                {showRitmo && <td style={tdRitmo}>{ritmo(f.velocidad_30d, f.velocidad_ajustada_30d, f.tiene_outliers)}</td>}
                {showRitmo && <td style={tdRitmo}>{ritmo(f.velocidad_90d, f.velocidad_ajustada_90d, f.tiene_outliers)}</td>}
                {showRitmo && <td style={tdRitmo}>{ritmo(f.velocidad_180d, f.velocidad_ajustada_180d, f.tiene_outliers)}</td>}
                <td style={tdNum}><TendenciaIndicator pct={f.tendencia_pct} /></td>
                <td style={tdProy}>{proyeccion(f.demanda_proyectada, f.datos_insuficientes)}</td>
                <td style={{ ...tdNum, color: cobertColor(f.meses_cobertura) }}>{f.meses_cobertura == null ? '—' : `${fmtNum(f.meses_cobertura, 1)}m`}</td>
                <td style={td}>{fmtFecha(f.ultima_venta)}</td>
                <td style={td}><BanderasIcons row={f} /></td>
                <td style={td} onClick={(e) => e.stopPropagation()}>
                  <ClasificacionDropdown codigo={f.codigo_interno} value={f.clasificacion_manual} />
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={20} style={{ padding: 30, textAlign: 'center', color: '#718096' }}>Sin SKUs que coincidan con los filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager pagina={pagina} setPagina={setPagina} totalPaginas={totalPaginas} total={ordenadas.length} />
    </div>
  );
}

function ritmo(bruto, ajustado, tieneOutliers) {
  if (bruto == null) return <span style={{ color: '#cbd5e0' }} title="Producto con muy pocos días de vida para extrapolar.">—</span>;
  const aj = Number(ajustado);
  if (tieneOutliers && Number.isFinite(aj) && Math.abs(aj - Number(bruto)) > 0.5) {
    return (
      <span title={`Bruto: ${fmtNum(bruto, 1)} · Ajustado: ${fmtNum(aj, 1)} (sin outliers)`}>
        <span style={{ color: '#9aa5b1', textDecoration: 'line-through', marginRight: 4 }}>{fmtNum(bruto, 0)}</span>
        <span style={{ fontWeight: 700 }}>{fmtNum(aj, 1)}</span>
      </span>
    );
  }
  return fmtNum(bruto, 1);
}

function proyeccion(dem, insuficiente) {
  if (insuficiente) return <span style={{ color: '#805AD5', fontWeight: 600 }} title="Datos insuficientes — requiere decisión humana.">decisión 🔬</span>;
  if (dem == null) return <span style={{ color: '#cbd5e0' }}>—</span>;
  return <span style={{ color: '#c8a84b', fontWeight: 700 }}>{fmtNum(dem, 1)}</span>;
}

function cobertColor(m) {
  if (m == null) return '#718096';
  if (m < 1) return '#E53E3E';
  if (m < 2) return '#D69E2E';
  if (m > 12) return '#3182CE';
  return '#38A169';
}

const th = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
const td = { padding: '6px 10px', verticalAlign: 'middle' };
const tdNum   = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const tdVend  = { ...tdNum, color: '#4a5568', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' };
const tdRitmo = { ...tdNum, color: '#0369a1', fontWeight: 500 };
const tdProy  = { ...tdNum };

function Th({ k, sort, onSort, num, style, title, children }) {
  const active = sort.col === k;
  return (
    <th
      style={{ ...th, textAlign: num ? 'right' : 'left', background: active ? '#2d3748' : 'transparent', ...style }}
      onClick={() => onSort(k)}
      title={title}
    >
      {children} {active && (sort.dir === 'asc' ? '↑' : '↓')}
    </th>
  );
}

function Pager({ pagina, setPagina, totalPaginas, total }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 12, color: '#4a5568' }}>
      <button disabled={pagina <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))} style={btn}>‹ Anterior</button>
      <span>Página {pagina} de {totalPaginas} · {total.toLocaleString('es-CR')} SKUs</span>
      <button disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} style={btn}>Siguiente ›</button>
    </div>
  );
}

const btn = { padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e0', background: '#fff', cursor: 'pointer', fontSize: 12 };
