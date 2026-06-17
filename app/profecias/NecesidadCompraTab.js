'use client';
import { useState, useMemo, useEffect } from 'react';
import { fmtNum, fmtMoney, MadurezBadge, SemaforoBadge, ConfianzaIndicator, BanderasIcons } from './ui.js';
import ConfirmarAprobacionModal from './ConfirmarAprobacionModal.js';

const PAGE = 100;
const SEMAFOROS_PEDIR = new Set(['rojo_critico', 'rojo', 'amarillo']);

export default function NecesidadCompraTab({ filas, onSeleccionar, onAprobado }) {
  const [mostrarAprobados, setMostrarAprobados] = useState(false);

  const candidatas = useMemo(() => {
    const arr = filas.filter((f) =>
      f.cantidad_sugerida > 0 || SEMAFOROS_PEDIR.has(f.semaforo) || f.datos_insuficientes
    );
    if (mostrarAprobados) return arr;
    return arr.filter((f) => f.estado_aprobacion !== 'aprobado' && f.estado_aprobacion !== 'en_orden');
  }, [filas, mostrarAprobados]);

  const recienNacidos = useMemo(() => candidatas.filter((f) => f.madurez === 'recien_nacido' && f.estado_aprobacion !== 'aprobado').length, [candidatas]);
  const insuficientes = useMemo(() => candidatas.filter((f) => f.datos_insuficientes && f.estado_aprobacion !== 'aprobado').length, [candidatas]);
  const yaAprobados = useMemo(() => filas.filter((f) => f.estado_aprobacion === 'aprobado').length, [filas]);

  const [overrides, setOverrides] = useState({});
  const [seleccion, setSeleccion] = useState({});
  const [sort, setSort] = useState({ col: 'cantidad_sugerida', dir: 'desc' });
  const [pagina, setPagina] = useState(1);
  const [aprobando, setAprobando] = useState(false);
  const [msg, setMsg] = useState(null);
  const [modalAbierto, setModalAbierto] = useState(false);

  useEffect(() => {
    // Limpiar selección de SKUs que ya no son candidatas (filtros cambiaron)
    setSeleccion((prev) => {
      const visibles = new Set(candidatas.map((c) => c.codigo_interno));
      const next = {};
      for (const k of Object.keys(prev)) if (visibles.has(k)) next[k] = prev[k];
      return next;
    });
  }, [candidatas]);

  const ordenadas = useMemo(() => {
    const arr = [...candidatas];
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
  }, [candidatas, sort]);

  const totalPaginas = Math.max(1, Math.ceil(ordenadas.length / PAGE));
  const visibles = ordenadas.slice((pagina - 1) * PAGE, pagina * PAGE);

  const cantFinal = (f) => {
    const ov = overrides[f.codigo_interno];
    if (ov?.cantidad != null && ov.cantidad !== '') return parseFloat(ov.cantidad) || 0;
    if (f.cantidad_sugerida != null) return Number(f.cantidad_sugerida) || 0;
    return 0;
  };
  const costoFinal = (f) => {
    const ov = overrides[f.codigo_interno];
    if (ov?.costo != null && ov.costo !== '') return parseFloat(ov.costo) || 0;
    return Number(f.ultimo_costo) || 0;
  };

  const totalSeleccion = useMemo(() => {
    let count = 0, inversion = 0;
    for (const f of candidatas) {
      if (!seleccion[f.codigo_interno]) continue;
      count += 1;
      inversion += cantFinal(f) * costoFinal(f);
    }
    return { count, inversion };
  }, [candidatas, seleccion, overrides]);

  function setOverride(codigo, campo, val) {
    setOverrides((prev) => ({ ...prev, [codigo]: { ...(prev[codigo] || {}), [campo]: val } }));
  }

  const aprobado = (f) => f.estado_aprobacion === 'aprobado' || f.estado_aprobacion === 'en_orden';

  function toggle(codigo) {
    setSeleccion((prev) => ({ ...prev, [codigo]: !prev[codigo] }));
  }

  function seleccionarTodosVisibles(val) {
    setSeleccion((prev) => {
      const cur = { ...prev };
      for (const f of visibles) if (!aprobado(f)) cur[f.codigo_interno] = val;
      return cur;
    });
  }

  function seleccionarAltaConfianza() {
    const cur = {};
    for (const f of candidatas) {
      if (aprobado(f)) continue;
      if (f.confianza === 'alta' && f.cantidad_sugerida > 0) cur[f.codigo_interno] = true;
    }
    setSeleccion(cur);
  }

  function seleccionarRecienNacidos() {
    const cur = {};
    for (const f of candidatas) {
      if (aprobado(f)) continue;
      if (f.madurez === 'recien_nacido') cur[f.codigo_interno] = true;
    }
    setSeleccion(cur);
  }

  const itemsParaModal = useMemo(() => {
    return candidatas
      .filter((f) => seleccion[f.codigo_interno] && !aprobado(f))
      .map((f) => ({
        codigo_interno: f.codigo_interno,
        item: f.item,
        proveedor: f.ultimo_proveedor,
        cantidad_aprobada: cantFinal(f),
        costo_unitario_estimado: costoFinal(f),
      }))
      .filter((i) => i.cantidad_aprobada > 0);
  }, [candidatas, seleccion, overrides]);

  function abrirModal() {
    if (!itemsParaModal.length) {
      setMsg({ tipo: 'err', txt: 'Seleccioná al menos un SKU con cantidad > 0.' });
      return;
    }
    setMsg(null);
    setModalAbierto(true);
  }

  async function confirmarAprobacion({ notas }) {
    setAprobando(true);
    try {
      // Proveedores que el usuario realmente procesó en este lote.
      const provsProcesados = new Set(itemsParaModal.map((i) => i.proveedor));
      const codigosAprobados = new Set(itemsParaModal.map((i) => i.codigo_interno));
      // SKUs revisados de esos proveedores que quedaron SIN pedir (cantidad = 0):
      // "lo revisó y decidió no pedir". El cero es dato válido para aprender.
      const itemsCero = candidatas
        .filter((f) =>
          provsProcesados.has(f.ultimo_proveedor) &&
          !codigosAprobados.has(f.codigo_interno) &&
          !aprobado(f)
        )
        .map((f) => ({ codigo_interno: f.codigo_interno }));

      const r = await fetch('/api/profecias/aprobar-lote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsParaModal, items_cero: itemsCero, notas }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error');
      setMsg({ tipo: 'ok', txt: `${j.count} SKUs aprobados. Ahora aparecen en Plan por Proveedor.` });
      setSeleccion({});
      setOverrides({});
      setModalAbierto(false);
      onAprobado?.();
    } catch (e) {
      setMsg({ tipo: 'err', txt: e.message });
    } finally {
      setAprobando(false);
    }
  }

  function exportarCSV() {
    const sel = candidatas.filter((f) => seleccion[f.codigo_interno]);
    const fuente = sel.length ? sel : candidatas;
    if (!fuente.length) return;
    const rows = fuente.map((f) => ({
      Codigo: f.codigo_interno,
      Nombre: f.item,
      Proveedor: f.ultimo_proveedor,
      Existencias: f.existencias,
      Proyeccion: f.demanda_proyectada,
      LeadTime: f.lead_time_dias,
      PuntoReorden: f.punto_reorden,
      CantidadSugerida: f.cantidad_sugerida,
      CantidadFinal: cantFinal(f),
      CostoUnit: costoFinal(f),
      InversionEst: cantFinal(f) * costoFinal(f),
      Confianza: f.confianza,
      Madurez: f.madurez,
      Semaforo: f.semaforo,
      Estado: f.estado_aprobacion,
    }));
    const csv = [Object.keys(rows[0]).join(',')]
      .concat(rows.map((r) => Object.values(r).map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `profecias-compra-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const handleSort = (col) => {
    setSort((p) => p.col === col ? { col, dir: p.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'desc' });
    setPagina(1);
  };

  return (
    <div>
      {(recienNacidos > 0 || insuficientes > 0) && (
        <div style={{
          background: '#FFF8E1', border: '1px solid #F6E05E', borderRadius: 8,
          padding: '10px 14px', marginBottom: 12, fontSize: 13, color: '#744210',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8,
        }}>
          <span>
            {insuficientes > 0 && <>🔬 <strong>{insuficientes}</strong> SKUs con datos insuficientes (menos de 7 días) requieren decisión humana. </>}
            {recienNacidos > 0 && <>🆕 <strong>{recienNacidos}</strong> SKUs recién nacidos que requieren tu criterio.</>}
          </span>
          <button onClick={seleccionarRecienNacidos} style={btnLink}>Seleccionar recién nacidos</button>
        </div>
      )}

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12,
        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 10,
        alignItems: 'center',
      }}>
        <button onClick={seleccionarAltaConfianza} style={btnSec}>Marcar alta confianza</button>
        <button onClick={seleccionarRecienNacidos} style={btnSec}>Marcar recién nacidos</button>
        <button onClick={() => seleccionarTodosVisibles(true)} style={btnSec}>Marcar página</button>
        <button onClick={() => setSeleccion({})} style={btnSec}>Limpiar selección</button>

        <label style={{ marginLeft: 12, fontSize: 12, color: '#4a5568', display: 'inline-flex', gap: 4, alignItems: 'center' }}>
          <input type="checkbox" checked={mostrarAprobados} onChange={(e) => setMostrarAprobados(e.target.checked)} />
          Mostrar también SKUs ya aprobados {yaAprobados > 0 && `(${yaAprobados})`}
        </label>

        <span style={{ marginLeft: 'auto', fontSize: 12, color: '#4a5568' }}>
          {totalSeleccion.count} seleccionados · <strong>{fmtMoney(totalSeleccion.inversion)}</strong>
        </span>
        <button disabled={!totalSeleccion.count || aprobando} onClick={abrirModal} style={{ ...btnPri, opacity: !totalSeleccion.count ? 0.5 : 1 }}>
          Aprobar selección {totalSeleccion.count > 0 ? `(${totalSeleccion.count})` : ''}
        </button>
        <button onClick={exportarCSV} style={btnSec}>Exportar CSV</button>
      </div>

      {msg && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 10, fontSize: 12,
          background: msg.tipo === 'ok' ? '#C6F6D5' : '#FED7D7', color: msg.tipo === 'ok' ? '#22543D' : '#822727',
        }}>{msg.txt}</div>
      )}

      <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#1c1f26', color: '#fff', position: 'sticky', top: 0 }}>
              <th style={th}><input type="checkbox" onChange={(e) => seleccionarTodosVisibles(e.target.checked)} /></th>
              <Th k="semaforo" sort={sort} onSort={handleSort}>Sem.</Th>
              <Th k="codigo_interno" sort={sort} onSort={handleSort}>Código</Th>
              <Th k="item" sort={sort} onSort={handleSort} style={{ minWidth: 220 }}>Nombre</Th>
              <Th k="ultimo_proveedor" sort={sort} onSort={handleSort}>Proveedor</Th>
              <Th k="madurez" sort={sort} onSort={handleSort}>Madurez</Th>
              <Th k="existencias" sort={sort} onSort={handleSort} num>Exist.</Th>
              <Th k="demanda_proyectada" sort={sort} onSort={handleSort} num>Proyección</Th>
              <Th k="lead_time_dias" sort={sort} onSort={handleSort} num>Lead</Th>
              <Th k="punto_reorden" sort={sort} onSort={handleSort} num>P.Reord.</Th>
              <Th k="cantidad_sugerida" sort={sort} onSort={handleSort} num>Sugerida</Th>
              <th style={{ ...th, textAlign: 'right' }}>Cant. final</th>
              <th style={{ ...th, textAlign: 'right' }}>Costo unit.</th>
              <th style={{ ...th, textAlign: 'right' }}>Inv. est.</th>
              <Th k="confianza" sort={sort} onSort={handleSort}>Conf.</Th>
              <th style={th}>⚑</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map((f) => {
              const cant = cantFinal(f);
              const costo = costoFinal(f);
              const ya = aprobado(f);
              return (
                <tr key={f.codigo_interno}
                  style={{
                    borderBottom: '1px solid #f0f2f5',
                    background: ya ? '#f7fafc' : (seleccion[f.codigo_interno] ? 'rgba(200,168,75,0.08)' : 'transparent'),
                    color: ya ? '#a0aec0' : 'inherit',
                  }}
                >
                  <td style={td}>
                    <input type="checkbox" disabled={ya} checked={!!seleccion[f.codigo_interno]} onChange={() => toggle(f.codigo_interno)} />
                  </td>
                  <td style={td}><SemaforoBadge value={f.semaforo} mini /></td>
                  <td style={{ ...td, fontFamily: 'monospace', fontWeight: 600, cursor: 'pointer' }} onClick={() => onSeleccionar(f.codigo_interno)}>
                    {f.codigo_interno}
                    {ya && <span title={`Aprobado el ${new Date(f.aprobado_en).toLocaleDateString('es-CR')}`} style={{ marginLeft: 6, fontSize: 10, color: '#38A169', fontWeight: 700 }}>✓ APROBADO</span>}
                  </td>
                  <td style={{ ...td, cursor: 'pointer' }} onClick={() => onSeleccionar(f.codigo_interno)}>{f.item}</td>
                  <td style={td}>{f.ultimo_proveedor}</td>
                  <td style={td}><MadurezBadge value={f.madurez} /></td>
                  <td style={tdNum}>{fmtNum(f.existencias, 0)}</td>
                  <td style={tdNum}>{f.datos_insuficientes ? <span style={{ color: '#805AD5' }}>🔬</span> : fmtNum(f.demanda_proyectada, 1)}</td>
                  <td style={tdNum}>{f.lead_time_dias}</td>
                  <td style={tdNum}>{fmtNum(f.punto_reorden, 0)}</td>
                  <td style={{ ...tdNum, color: '#c8a84b', fontWeight: 700 }}>{fmtNum(f.cantidad_sugerida, 0)}</td>
                  <td style={tdNum}>
                    <input
                      type="number" min={0}
                      disabled={ya}
                      value={overrides[f.codigo_interno]?.cantidad ?? (f.cantidad_sugerida ?? '')}
                      onChange={(e) => setOverride(f.codigo_interno, 'cantidad', e.target.value)}
                      style={{ ...inputNum, opacity: ya ? 0.5 : 1 }}
                    />
                  </td>
                  <td style={tdNum}>
                    <input
                      type="number" min={0} step="0.01"
                      disabled={ya}
                      value={overrides[f.codigo_interno]?.costo ?? f.ultimo_costo}
                      onChange={(e) => setOverride(f.codigo_interno, 'costo', e.target.value)}
                      style={{ ...inputNum, opacity: ya ? 0.5 : 1 }}
                    />
                  </td>
                  <td style={tdNum}>{fmtMoney(cant * costo, f.moneda)}</td>
                  <td style={td}><ConfianzaIndicator value={f.confianza} /></td>
                  <td style={td}><BanderasIcons row={f} /></td>
                </tr>
              );
            })}
            {visibles.length === 0 && (
              <tr><td colSpan={16} style={{ padding: 30, textAlign: 'center', color: '#718096' }}>Nada que pedir con los filtros actuales.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <Pager pagina={pagina} setPagina={setPagina} totalPaginas={totalPaginas} total={ordenadas.length} />

      {modalAbierto && (
        <ConfirmarAprobacionModal
          items={itemsParaModal}
          onClose={() => setModalAbierto(false)}
          onConfirmar={confirmarAprobacion}
          aprobando={aprobando}
        />
      )}
    </div>
  );
}

const th = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, letterSpacing: 0.3, textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
const td = { padding: '6px 10px', verticalAlign: 'middle' };
const tdNum = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };
const inputNum = { width: 80, padding: '3px 6px', border: '1px solid #cbd5e0', borderRadius: 4, fontSize: 12, textAlign: 'right' };
const btnPri = { padding: '6px 12px', borderRadius: 6, border: 'none', background: '#c8a84b', color: '#1c1f26', fontWeight: 700, cursor: 'pointer', fontSize: 12 };
const btnSec = { padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e0', background: '#fff', cursor: 'pointer', fontSize: 12 };
const btnLink = { background: 'transparent', border: 'none', color: '#744210', textDecoration: 'underline', cursor: 'pointer', fontSize: 12, fontWeight: 600 };

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
      <button disabled={pagina <= 1} onClick={() => setPagina(p => Math.max(1, p - 1))} style={btnSec}>‹ Anterior</button>
      <span>Página {pagina} de {totalPaginas} · {total.toLocaleString('es-CR')} candidatos</span>
      <button disabled={pagina >= totalPaginas} onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))} style={btnSec}>Siguiente ›</button>
    </div>
  );
}
