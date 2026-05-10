'use client';
import { useState, useMemo } from 'react';
import { fmtFecha, fmtNum, MadurezBadge, BanderasIcons, TendenciaIndicator } from './ui.js';
import ClasificacionDropdown from './ClasificacionDropdown.js';

const PAGE = 100;

export default function ProyeccionVentasTab({ filas, onSeleccionar }) {
  const [sort, setSort] = useState({ col: 'demanda_proyectada', dir: 'desc' });
  const [pagina, setPagina] = useState(1);

  const ordenadas = useMemo(() => {
    const arr = [...filas];
    arr.sort((a, b) => {
      const va = a[sort.col]; const vb = b[sort.col];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === 'number' && typeof vb === 'number') return sort.dir === 'asc' ? va - vb : vb - va;
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

  return (
    <div>
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
              <Th k="velocidad_30d" sort={sort} onSort={handleSort} num>V 30d</Th>
              <Th k="velocidad_90d" sort={sort} onSort={handleSort} num>V 90d</Th>
              <Th k="velocidad_180d" sort={sort} onSort={handleSort} num>V 180d</Th>
              <Th k="tendencia_pct" sort={sort} onSort={handleSort} num>Tend.</Th>
              <Th k="demanda_proyectada" sort={sort} onSort={handleSort} num>Dem./mes</Th>
              <Th k="meses_cobertura" sort={sort} onSort={handleSort} num>Cob.</Th>
              <Th k="ultima_venta" sort={sort} onSort={handleSort}>Últ. venta</Th>
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
                <td style={tdNum}>{fmtNum(f.velocidad_30d, 1)}</td>
                <td style={tdNum}>{fmtNum(f.velocidad_90d, 1)}</td>
                <td style={tdNum}>{fmtNum(f.velocidad_180d, 1)}</td>
                <td style={tdNum}><TendenciaIndicator pct={f.tendencia_pct} /></td>
                <td style={{ ...tdNum, fontWeight: 700, color: '#c8a84b' }}>{fmtNum(f.demanda_proyectada, 1)}</td>
                <td style={{ ...tdNum, color: cobertColor(f.meses_cobertura) }}>{f.meses_cobertura == null ? '—' : `${fmtNum(f.meses_cobertura, 1)}m`}</td>
                <td style={td}>{fmtFecha(f.ultima_venta)}</td>
                <td style={td}><BanderasIcons row={f} /></td>
                <td style={td} onClick={(e) => e.stopPropagation()}>
                  <ClasificacionDropdown codigo={f.codigo_interno} value={f.clasificacion_manual} />
                </td>
              </tr>
            ))}
            {visibles.length === 0 && (
              <tr><td colSpan={16} style={{ padding: 30, textAlign: 'center', color: '#718096' }}>Sin SKUs que coincidan con los filtros.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager pagina={pagina} setPagina={setPagina} totalPaginas={totalPaginas} total={ordenadas.length} />
    </div>
  );
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
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

function Th({ k, sort, onSort, num, style, children }) {
  const active = sort.col === k;
  return (
    <th style={{ ...th, textAlign: num ? 'right' : 'left', background: active ? '#2d3748' : 'transparent', ...style }}
        onClick={() => onSort(k)}>
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
