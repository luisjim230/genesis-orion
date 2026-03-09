'use client';
import { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';

// ── Estilos ────────────────────────────────────────────────────────────────
const S = {
  page:     { background:'var(--cream)', minHeight:'100vh', padding:'28px 32px', fontFamily:'DM Sans, sans-serif', color:'var(--text-primary)' },
  title:    { fontSize:'1.7rem', fontWeight:700, color:'var(--text-primary)', margin:0 },
  caption:  { fontSize:'0.82rem', color:'var(--text-muted)', marginTop:'4px', marginBottom:'24px' },
  kicker:   { color:'#63b3ed', fontSize:'0.82rem', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', marginBottom:'6px' },
  tabs:     { display:'flex', gap:'8px', marginBottom:'24px', borderBottom:'1px solid var(--border-soft)', paddingBottom:'0' },
  tab:      { padding:'8px 18px', borderRadius:'8px 8px 0 0', border:'none', cursor:'pointer', fontSize:'0.9rem', fontWeight:500, background:'transparent', color:'var(--text-muted)', marginBottom:'-1px' },
  tabActive:{ background:'var(--cream)', color:'var(--orange)', borderBottom:'2px solid var(--orange)' },
  card:     { background:'#fff', borderRadius:'12px', padding:'16px 20px', marginBottom:'12px', border:'1px solid var(--border-soft)' },
  cardDash: { background:'#fff', borderRadius:'12px', padding:'16px', marginBottom:'12px', border:'1px solid var(--border-soft)' },
  cardEmpty:{ background:'#fff', borderRadius:'12px', padding:'16px', marginBottom:'12px', border:'1px dashed var(--border)' },
  input:    { background:'var(--cream)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-primary)', padding:'8px 12px', fontSize:'0.9rem', width:'100%', outline:'none', boxSizing:'border-box' },
  select:   { background:'var(--cream)', border:'1px solid var(--border)', borderRadius:'8px', color:'var(--text-primary)', padding:'8px 12px', fontSize:'0.9rem', width:'100%', outline:'none' },
  btnPrimary:{ background:'var(--orange)', color:'#fff', border:'none', borderRadius:'8px', padding:'9px 20px', fontWeight:700, cursor:'pointer', fontSize:'0.9rem' },
  btnGhost: { background:'var(--cream)', color:'var(--text-primary)', border:'1px solid var(--border)', borderRadius:'8px', padding:'8px 16px', cursor:'pointer', fontSize:'0.88rem' },
  label:    { fontSize:'0.82rem', color:'var(--text-muted)', marginBottom:'4px', display:'block' },
  divider:  { border:'none', borderTop:'1px solid var(--border-soft)', margin:'20px 0' },
  info:     { background:'#EBF8FF', border:'1px solid #BEE3F8', borderRadius:'8px', padding:'12px 16px', color:'#2C5282', fontSize:'0.88rem' },
  success:  { background:'#F0FFF4', border:'1px solid #9AE6B4', borderRadius:'8px', padding:'10px 14px', color:'#276749', fontSize:'0.88rem' },
  warning:  { background:'#352a10', border:'1px solid #FAD776', borderRadius:'8px', padding:'10px 14px', color:'#7B341E', fontSize:'0.88rem' },
  error:    { background:'#351a1a', border:'1px solid #552020', borderRadius:'8px', padding:'10px 14px', color:'#f87171', fontSize:'0.88rem' },
  dropzone: { background:'#fff', border:'1px dashed var(--border)', borderRadius:'14px', padding:'2.5rem', textAlign:'center', marginTop:'1rem' },
  table:    { width:'100%', borderCollapse:'collapse', fontSize:'0.82rem' },
  th:       { background:'var(--cream)', color:'var(--text-muted)', padding:'8px 12px', textAlign:'left', borderBottom:'1px solid var(--border-soft)', fontWeight:600, whiteSpace:'nowrap' },
  td:       { padding:'7px 12px', borderBottom:'1px solid #1a1e26', color:'var(--text-primary)', whiteSpace:'nowrap', maxWidth:'200px', overflow:'hidden', textOverflow:'ellipsis' },
};

// ── Configuración de reportes ──────────────────────────────────────────────
const REPORTES = {
  neo_items_vendidos: {
    nombre:'Ítems más vendidos', emoji:'🏆',
    descripcion:'Ranking de productos por ventas en un período.',
    header_row:8, titulo_valor:'Ítems más vendidos',
    columnas:['categoria','codigo_interno','item','ventas','utilidad','utilidad_costo_pct','unidades'],
    columnas_originales:['Categoría','Código Interno','Ítem','Ventas','Utilidad','Utilidad/Costo','Unidades'],
  },
  neo_minimos_maximos: {
    nombre:'Lista de mínimos y máximos', emoji:'📊',
    descripcion:'Stock actual vs mínimos y máximos definidos.',
    header_row:1, titulo_valor:'Lista de mínimos y máximos',
    columnas:['codigo','tipo','nombre','categoria','marca','ubicacion','minimo','existencias','maximo','ultima_compra','ultimo_proveedor','ultimo_costo','moneda','promedio_mensual','activo','estatus'],
    columnas_originales:['Código','Tipo','Nombre','Categoría','Marca','Ubicación','Mínimo','Existencias','Máximo','Última compra','Último proveedor','Último costo unitario con descuento','Moneda','Promedio mensual vendido','Activo','Estatus'],
  },
  neo_items_comprados: {
    nombre:'Lista de ítems comprados', emoji:'🛒',
    descripcion:'Historial de compras por ítem y proveedor.',
    header_row:1, titulo_valor:'Lista de ítems comprados',
    columnas:['compra','estado','fecha','num_factura','proveedor','tipo_item','codigo_interno','item','cantidad_comprada','cantidad_devuelta','costo_unitario_sin_imp','moneda','precio_unitario_con_imp','subtotal','descuento','subtotal_con_descuento_contab','pct_impuesto','impuestos','total','total_sin_imp_colones','existencias_al_comprar','costo_unitario_actual','costo_unitario_compra','costo_unitario_promedio','precio_unitario_actual','utilidad','tipo_de_cambio','marca','categoria'],
    columnas_originales:['Compra','Estado','Fecha','Num. Factura','Proveedor','Tipo de ítem','Código interno','Ítem','Cantidad comprada','Cantidad devuelta','Costo unitario sin impuesto','Moneda','Precio unitario con impuesto','Subtotal','Descuento','Subtotal con descuento (moneda de contab','% Impuesto','Impuestos','Total','Total sin impuesto en colones','Existencias al momento de la compra','Costo unitario actual','Costo unitario compra','Costo unitario promedio','Precio unitario actual','Utilidad','Tipo de cambio','Marca del ítem','Categoría dél ítem'],
  },
  neo_lista_items: {
    nombre:'Lista de ítems', emoji:'📋',
    descripcion:'Catálogo completo de productos con costos y precios.',
    header_row:1, titulo_valor:'Lista de ítems',
    columnas:['codigo_interno','codigo_cabys','tipo','categoria','marca','item','proveedor','fecha_registro','ultima_compra','ultima_venta','descripcion','costo_sin_imp','moneda_costo','precio_sin_imp','precio_con_imp','moneda_precio','iva','pct_utilidad','existencias','activo','descuento_maximo'],
    columnas_originales:['Código interno','Código CABYS','Tipo','Categoría','Marca','Ítem','Proveedor','Fecha de registro','Última compra','Última venta','Descripción','Costo unitario sin impuesto','Moneda del costo unitario sin impuesto','Precio unitario sin impuesto','Precio unitario con impuesto','Moneda del precio unitario sin impuesto','IVA','% utilidad','Existencias','Activo','Descuento Máximo'],
  },
  neo_rentabilidad_proveedor: {
    nombre:'Rentabilidad por proveedor', emoji:'💰',
    descripcion:'Ventas, costos y utilidad desglosados por proveedor.',
    header_row:8, titulo_valor:'Rentabilidad por proveedor',
    columnas:['proveedor','codigo_interno','item','cantidad_comprada','cantidad_facturada','costo'],
    columnas_originales:['Nombre del proveedor','Código interno','Ítem',' Cantidad comprada',' Cantidad facturada','Costo'],
  },
  neo_antiguedad_saldos: {
    nombre:'Antigüedad de saldos de proveedores', emoji:'📅',
    descripcion:'Saldos pendientes con proveedores por antigüedad.',
    header_row:8, titulo_valor:'Informe de antigüedad de saldos', titulo_col1:'Código',
    columnas:['codigo','proveedor','tipo','numero','fecha_compra','fecha_vencimiento','saldo_original','pagos_aplicados','notas_aplicadas','saldo_actual','moneda','sin_vencer','dias_1_8','dias_9_15','dias_16_22','dias_23_30','dias_1_30','dias_31_60','dias_61_90','dias_91_120','mas_120_dias'],
    columnas_originales:['Código','Proveedor','Tipo','Número','Fecha de la compra','Fecha de vencimiento','Saldo original','Pagos aplicados','Notas aplicadas','Saldo actual','Moneda','Sin vencer','1 - 8 Días','9 - 15 Días','16 - 22 Días','23 - 30 Días','1 - 30 Días','31 - 60 Días','61 - 90 Días','91 - 120 Días','Más de 120 Días'],
  },
  neo_antiguedad_saldos_clientes: {
    nombre:'Antigüedad de saldos de clientes', emoji:'👥',
    descripcion:'Saldos pendientes de clientes por antigüedad.',
    header_row:8, titulo_valor:'Informe de antigüedad de saldos', titulo_col1:'Vendedor',
    columnas:['vendedor','territorio','codigo','cliente','tipo','numero','fecha_factura','fecha_vencimiento','saldo_original','cobros_aplicados','notas_credito','notas_debito','saldo_actual','moneda','sin_vencer','dias_1_30','dias_31_60','dias_61_90','dias_91_120','mas_120_dias','notas'],
    columnas_originales:['Vendedor','Territorio','Código','Cliente','Tipo','Número','Fecha de la factura','Fecha de vencimiento','Saldo original','Cobros aplicados','Notas de crédito aplicadas','Notas de débito aplicadas','Saldo actual','Moneda','Sin vencer','1 - 30 Días','31 - 60 Días','61 - 90 Días','91 - 120 Días','Más de 120 Días','Notas'],
  },
  neo_movimientos_contables: {
    nombre:'Lista de movimientos de cuentas', emoji:'📒',
    descripcion:'Asientos contables con cuentas, montos y centros de costo.',
    header_row:1, titulo_valor:'Lista de movimientos de cuentas',
    columnas:['asiento','fecha','tipo','cuenta_contable','centro_costo','debe_moneda_asiento','moneda_debe','haber_moneda_asiento','moneda_haber','debe_contabilidad','moneda_debe_cont','haber_contabilidad','moneda_haber_cont','observaciones_asiento','observaciones_movimiento'],
    columnas_originales:['Asiento contable','Fecha ','Tipo','Cuenta contable','Centro de costo','Debe (Moneda del asiento)','Moneda','Haber (Moneda del asiento)','Moneda1','Debe (Moneda de contabilidad)','Moneda2','Haber (Moneda de contabilidad)','Moneda3','Observaciones del asiento','Observaciones del movimiento'],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function utcACR(iso) {
  try {
    return new Intl.DateTimeFormat('es-CR', {
      timeZone: 'America/Costa_Rica',
      day:'2-digit', month:'2-digit', year:'numeric',
      hour:'2-digit', minute:'2-digit', hour12:false,
    }).format(new Date(iso));
  } catch { return iso?.slice(0,16).replace('T',' ') || '—'; }
}

function detectarTipo(filas) {
  // filas = array de arrays (raw sheet)
  let tituloEncontrado = null;

  for (let i = 0; i < Math.min(10, filas.length); i++) {
    const fila = filas[i].map(v => String(v||'').trim());
    for (const [tabla, cfg] of Object.entries(REPORTES)) {
      if (fila.some(v => v && v.toLowerCase().includes(cfg.titulo_valor.toLowerCase()))) {
        if (cfg.titulo_col1) {
          tituloEncontrado = { tabla, cfg, filaIdx: i };
        } else {
          return tabla;
        }
      }
    }
  }

  // Resolver ambigüedad por primera columna del header
  if (tituloEncontrado) {
    const { filaIdx } = tituloEncontrado;
    for (let offset = 1; offset <= 4; offset++) {
      const idx = filaIdx + offset;
      if (idx >= filas.length) break;
      const filaHeader = filas[idx].map(v => String(v||'').trim()).filter(v => v);
      if (filaHeader.length > 0) {
        const col1 = filaHeader[0];
        for (const [tabla, cfg] of Object.entries(REPORTES)) {
          if (cfg.titulo_col1 && cfg.titulo_col1 === col1) return tabla;
        }
        break;
      }
    }
  }
  return null;
}

function extraerPeriodo(filas) {
  for (let i = 0; i < Math.min(10, filas.length); i++) {
    for (const v of filas[i]) {
      const s = String(v||'').trim();
      if (s && (s.includes('Del ') || s.includes('Al '))) return s;
    }
  }
  return 'Sin período';
}

function procesarExcel(filas, tabla, fechaCarga, periodo) {
  const cfg = REPORTES[tabla];
  const headerRow = cfg.header_row;
  const headers = filas[headerRow].map(v => String(v||'').trim());
  const dataRows = filas.slice(headerRow + 1);

  // DEBUG: mostrar primeras filas para diagnosticar
  console.log(`[Ezequiel] procesarExcel tabla=${tabla} header_row=${headerRow}`);
  console.log(`[Ezequiel] filas[0]:`, JSON.stringify(filas[0]?.slice(0,4)));
  console.log(`[Ezequiel] filas[1] (headers):`, JSON.stringify(filas[1]?.slice(0,6)));
  console.log(`[Ezequiel] filas[2] (primer dato):`, JSON.stringify(filas[2]?.slice(0,6)));
  console.log(`[Ezequiel] headers procesados:`, JSON.stringify(headers.slice(0,6)));

  // Construir rename map: original → normalizado
  const renameMap = {};
  cfg.columnas_originales.forEach((orig, i) => {
    const norm = cfg.columnas[i];
    const colIdx = headers.findIndex(h => h.trim() === orig.trim());
    if (colIdx >= 0) renameMap[colIdx] = norm;
    else console.warn(`[Ezequiel] NO mapeado: "${orig}"`);
  });
  console.log(`[Ezequiel] renameMap keys:`, Object.keys(renameMap).length, 'de', cfg.columnas_originales.length);

  // Función robusta para limpiar valores del Excel
  // XLSX.js puede devolver strings con trailing spaces, tabs, etc.
  const limpiar = (val) => {
    if (val === null || val === undefined) return null;
    // Convertir a string y limpiar TODOS los whitespace (incluyendo non-breaking spaces)
    const s = String(val).replace(/^[\s ​]+|[\s ​]+$/g, '');
    if (s === '' || s === 'nan' || s === 'null' || s === 'undefined') return null;
    return s;
  };

  const records = [];
  for (const row of dataRows) {
    if (!row || row.every(v => v === null || v === undefined || String(v).trim() === '')) continue;

    // Primera columna: filtrar totales y vacíos
    const primerVal = limpiar(row[0]);
    if (!primerVal || primerVal.startsWith('Total:')) continue;

    const record = { fecha_carga: fechaCarga, periodo_reporte: periodo };
    for (const [idxStr, norm] of Object.entries(renameMap)) {
      const idx = parseInt(idxStr);
      record[norm] = limpiar(row[idx]);
    }
    records.push(record);
  }
  
  // DEBUG: mostrar muestra de valores procesados
  if (records.length > 0) {
    const sample = records.find(r => r.ultimo_proveedor !== null) || records[0];
    console.log(`[Ezequiel] Muestra de record procesado:`, JSON.stringify(sample));
    const conProv = records.filter(r => r.ultimo_proveedor !== null).length;
    console.log(`[Ezequiel] Records con ultimo_proveedor: ${conProv} / ${records.length}`);
  }
  
  return records;
}

async function cargarASupabase(tabla, records) {
  if (!records.length) return 0;
  const BATCH = 200;
  const fechaCarga = records[0].fecha_carga;

  // Paso 1: obtener TODAS las fechas_carga existentes en esta tabla
  // y borrarlas una por una (el RLS de Supabase permite delete con eq exacto)
  try {
    const { data: fechasExistentes } = await supabase
      .from(tabla)
      .select('fecha_carga')
      .order('fecha_carga', { ascending: false });

    if (fechasExistentes?.length) {
      const fechasUnicas = [...new Set(fechasExistentes.map(r => r.fecha_carga))];
      for (const fc of fechasUnicas) {
        await supabase.from(tabla).delete().eq('fecha_carga', fc);
      }
    }
  } catch(e) {
    console.warn('Advertencia limpiando tabla:', e.message);
    // Si falla, intentar limpiar al menos la fecha actual
    await supabase.from(tabla).delete().eq('fecha_carga', fechaCarga);
  }

  // Paso 2: insertar todos los registros nuevos en batches con retry
  let total = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    let intentos = 0;
    while (intentos < 3) {
      const { error } = await supabase.from(tabla).insert(batch);
      if (!error) { total += batch.length; break; }
      intentos++;
      if (intentos >= 3) throw new Error(`Batch ${Math.floor(i/BATCH)+1} falló (${error.message})`);
      await new Promise(r => setTimeout(r, 1000 * intentos));
    }
  }
  return total;
}

// ── Tab 1: Subir ──────────────────────────────────────────────────────────
function TabSubir() {
  const [resultados, setResultados] = useState([]);
  const [procesando, setProcesando] = useState(false);
  const [arrastrar, setArrastrar]   = useState(false);

  const procesarArchivos = useCallback(async (files) => {
    if (!files || files.length === 0) return;
    setProcesando(true);
    const nuevos = [];

    for (const file of files) {
      // Cada archivo recibe su propia fecha_carga para historial separado
      await new Promise(r => setTimeout(r, 10)); // pequeño delay para timestamps únicos
      const fechaCarga = new Date().toISOString();
      const res = { nombre: file.name, estado: 'procesando', tipo: null, filas: 0, periodo: '', error: null };
      try {
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type:'array' });
        const ws  = wb.Sheets[wb.SheetNames[0]];
        const filas = XLSX.utils.sheet_to_json(ws, { header:1, defval:null });

        const tipo = detectarTipo(filas);
        if (!tipo) {
          res.estado  = 'no_reconocido';
          res.error   = 'No se pudo identificar el tipo de reporte.';
          nuevos.push(res);
          continue;
        }

        const periodo  = extraerPeriodo(filas);
        const records  = procesarExcel(filas, tipo, fechaCarga, periodo);
        const cantidad = await cargarASupabase(tipo, records);

        res.estado  = 'ok';
        res.tipo    = tipo;
        res.filas   = cantidad;
        res.periodo = periodo;
      } catch(e) {
        res.estado = 'error';
        res.error  = e.message;
      }
      nuevos.push(res);
    }

    setResultados(prev => [...nuevos, ...prev]);
    setProcesando(false);
  }, []);

  const onFileInput = (e) => procesarArchivos(Array.from(e.target.files || []));
  const onDrop = (e) => {
    e.preventDefault(); setArrastrar(false);
    procesarArchivos(Array.from(e.dataTransfer.files || []));
  };

  return (
    <div>
      <h3 style={{ color:'var(--text-primary)', marginTop:0 }}>Subir reportes de NEO</h3>
      <p style={{ color:'var(--text-muted)', marginBottom:'20px' }}>Podés subir varios archivos a la vez. Génesis detecta automáticamente qué tipo de reporte es cada uno.</p>

      {/* Info tabla */}
      <details style={{ ...S.card, marginBottom:'16px' }}>
        <summary style={{ cursor:'pointer', color:'var(--orange)', fontWeight:600, fontSize:'0.9rem' }}>📋 ¿Qué reportes necesito subir?</summary>
        <div style={{ marginTop:'12px', overflowX:'auto' }}>
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Reporte en NEO</th>
                <th style={S.th}>Alimenta</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['📊 Lista de mínimos y máximos',   '🪐 Inventario'],
                ['🛒 Lista de ítems comprados',      '🔴 Trazabilidad'],
                ['📅 Antigüedad de saldos · proveedores','💰 Finanzas → Cuentas por pagar'],
                ['👥 Antigüedad de saldos · clientes',  '💰 Finanzas → Cuentas por cobrar'],
                ['🏆 Ítems más vendidos',            '☀️ Inteligencia Comercial'],
                ['💰 Rentabilidad por proveedor',    '☀️ Inteligencia Comercial'],
                ['📋 Lista de ítems',                '☀️ Inteligencia Comercial'],
                ['📒 Movimientos contables',         '📒 Contabilidad'],
              ].map(([r,a],i)=>(
                <tr key={i}>
                  <td style={S.td}>{r}</td>
                  <td style={S.td} style={{ ...S.td, color:'#63b3ed' }}>{a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {/* Dropzone */}
      <div
        style={{ ...S.dropzone, border: arrastrar ? '1px dashed #c8a84b' : S.dropzone.border, transition:'all .2s' }}
        onDragOver={e=>{ e.preventDefault(); setArrastrar(true); }}
        onDragLeave={()=>setArrastrar(false)}
        onDrop={onDrop}
      >
        <div style={{ fontSize:'2.5rem', marginBottom:'12px' }}>📂</div>
        <p style={{ color:'var(--text-muted)', margin:0, fontSize:'0.95rem' }}>
          {procesando ? '⏳ Procesando archivos...' : 'Arrastrá tus archivos Excel de NEO acá'}
        </p>
        <p style={{ color:'#2a3a50', margin:'6px 0 16px', fontSize:'0.82rem' }}>Ítems más vendidos · Mínimos y máximos · Ítems comprados · Lista de ítems · Rentabilidad · Antigüedad de saldos</p>
        <label style={{ ...S.btnPrimary, display:'inline-block', cursor:'pointer', opacity: procesando ? 0.5 : 1 }}>
          {procesando ? 'Procesando...' : '📁 Seleccionar archivos'}
          <input type="file" accept=".xlsx" multiple style={{ display:'none' }} onChange={onFileInput} disabled={procesando}/>
        </label>
      </div>

      {/* Resultados */}
      {resultados.length > 0 && (
        <div style={{ marginTop:'20px' }}>
          <hr style={S.divider}/>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'12px' }}>
            <h4 style={{ color:'var(--text-primary)', margin:0 }}>Resultados</h4>
            <button style={S.btnGhost} onClick={()=>setResultados([])}>Limpiar</button>
          </div>
          {resultados.map((r,i)=>(
            <div key={i} style={{
              ...S.card,
              borderLeft: r.estado==='ok' ? '3px solid #4ade80' : r.estado==='error'||r.estado==='no_reconocido' ? '3px solid #f87171' : '3px solid #c8a84b'
            }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
                <div>
                  <div style={{ fontWeight:600, color:'var(--text-primary)', marginBottom:'4px' }}>📄 {r.nombre}</div>
                  {r.estado==='ok' && (
                    <>
                      <div style={{ fontSize:'0.83rem', color:'#276749' }}>✅ Guardado correctamente</div>
                      <div style={{ fontSize:'0.8rem', color:'var(--text-muted)', marginTop:'4px' }}>
                        {REPORTES[r.tipo]?.emoji} {REPORTES[r.tipo]?.nombre} · {r.periodo} · <strong style={{ color:'var(--text-primary)' }}>{r.filas.toLocaleString()}</strong> filas
                      </div>
                    </>
                  )}
                  {r.estado==='no_reconocido' && <div style={{ fontSize:'0.83rem', color:'#7B341E' }}>⚠️ No reconocido — {r.error}</div>}
                  {r.estado==='error' && <div style={{ fontSize:'0.83rem', color:'#f87171' }}>❌ Error: {r.error}</div>}
                  {r.estado==='procesando' && <div style={{ fontSize:'0.83rem', color:'var(--orange)' }}>⏳ Procesando...</div>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Tab 2: Ver datos ──────────────────────────────────────────────────────
function TabVerDatos() {
  const [reporteSel, setReporteSel] = useState('neo_minimos_maximos');
  const [fechas, setFechas]         = useState([]);
  const [fechaSel, setFechaSel]     = useState('');
  const [datos, setDatos]           = useState([]);
  const [cargando, setCargando]     = useState(false);
  const [resumen, setResumen]       = useState({});
  const [resumenCargado, setResumenCargado] = useState(false);
  const [buscar, setBuscar]         = useState('');

  const cargarResumen = useCallback(async () => {
    const res = {};
    for (const tabla of Object.keys(REPORTES)) {
      try {
        // Obtener la fecha más reciente
        const { data } = await supabase.from(tabla).select('fecha_carga,periodo_reporte').order('fecha_carga', { ascending:false }).limit(1);
        if (data?.[0]) {
          const fc = data[0].fecha_carga;
          // Contar cuántos registros tiene esa fecha_carga
          const { count } = await supabase.from(tabla).select('*', { count:'exact', head:true }).eq('fecha_carga', fc);
          res[tabla] = { ...data[0], count };
        } else {
          res[tabla] = null;
        }
      } catch { res[tabla] = null; }
    }
    setResumen(res);
    setResumenCargado(true);
  }, []);

  const cargarFechas = useCallback(async (tabla) => {
    const { data } = await supabase.from(tabla).select('fecha_carga,periodo_reporte').order('fecha_carga', { ascending:false });
    const vistos = new Set(); const unicas = [];
    for (const row of (data||[])) {
      if (!vistos.has(row.fecha_carga)) { vistos.add(row.fecha_carga); unicas.push(row); }
    }
    setFechas(unicas);
    if (unicas.length > 0) { setFechaSel(unicas[0].fecha_carga); cargarDatos(tabla, unicas[0].fecha_carga); }
    else { setFechaSel(''); setDatos([]); }
  }, []);

  const cargarDatos = useCallback(async (tabla, fecha) => {
    setCargando(true); setDatos([]); setBuscar('');
    const PAGE = 1000; let todos = [], offset = 0;
    while (true) {
      const { data } = await supabase.from(tabla).select('*').eq('fecha_carga', fecha).range(offset, offset+PAGE-1);
      if (!data || data.length === 0) break;
      todos = [...todos, ...data];
      if (data.length < PAGE) break;
      offset += PAGE;
    }
    setDatos(todos);
    setCargando(false);
  }, []);

  // Cargar resumen al montar
  useState(() => { cargarResumen(); cargarFechas('neo_minimos_maximos'); }, []);

  const onReporteChange = (tabla) => {
    setReporteSel(tabla); setDatos([]); setFechas([]); setFechaSel('');
    cargarFechas(tabla);
  };

  const onFechaChange = (fecha) => { setFechaSel(fecha); cargarDatos(reporteSel, fecha); };

  // Columnas a mostrar (sin metadatos)
  const META = ['id','fecha_carga','periodo_reporte'];
  const columnas = datos.length > 0 ? Object.keys(datos[0]).filter(c => !META.includes(c)) : [];

  const datosFiltrados = buscar
    ? datos.filter(row => columnas.some(c => String(row[c]||'').toLowerCase().includes(buscar.toLowerCase())))
    : datos;

  const descargarCSV = () => {
    const cfg = REPORTES[reporteSel];
    const cols = columnas;
    const header = cols.join(',');
    const rows = datosFiltrados.map(row => cols.map(c => `"${String(row[c]||'').replace(/"/g,'""')}"`).join(','));
    const csv = [header, ...rows].join('\n');
    const blob = new Blob(['\ufeff'+csv], { type:'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url;
    a.download = `${reporteSel}_${fechaSel?.slice(0,10)||'export'}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div>
      <h3 style={{ color:'var(--text-primary)', marginTop:0 }}>Estado de los reportes</h3>

      {/* Cards de estado */}
      {!resumenCargado
        ? <div style={{ color:'var(--text-muted)', marginBottom:'20px' }}>Cargando estado...</div>
        : <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:'12px', marginBottom:'24px' }}>
            {Object.entries(REPORTES).map(([tabla, cfg]) => {
              const info = resumen[tabla];
              return info
                ? <div key={tabla} style={S.cardDash}>
                    <div style={{ fontSize:'1.4rem' }}>{cfg.emoji}</div>
                    <div style={{ color:'var(--text-primary)', fontWeight:600, fontSize:'0.88rem', margin:'4px 0 2px' }}>{cfg.nombre}</div>
                    <div style={{ color:'#63b3ed', fontSize:'0.75rem' }}>✅ {utcACR(info.fecha_carga)}</div>
                    {info.count != null && (
                      <div style={{ fontSize:'0.72rem', fontWeight:700, marginTop:2,
                        color: info.count > 3000 ? '#276749' : info.count > 500 ? '#7B341E' : '#C53030',
                        background: info.count > 3000 ? '#F0FFF4' : info.count > 500 ? '#FFFBEB' : '#FFF5F5',
                        borderRadius:8, padding:'1px 7px', display:'inline-block' }}>
                        {info.count?.toLocaleString()} registros
                      </div>
                    )}
                    <div style={{ color:'var(--text-muted)', fontSize:'0.72rem' }}>{info.periodo_reporte||'—'}</div>
                  </div>
                : <div key={tabla} style={S.cardEmpty}>
                    <div style={{ fontSize:'1.4rem' }}>{cfg.emoji}</div>
                    <div style={{ color:'var(--text-primary)', fontWeight:600, fontSize:'0.88rem', margin:'4px 0 2px' }}>{cfg.nombre}</div>
                    <div style={{ color:'var(--text-muted)', fontSize:'0.75rem' }}>Sin datos aún</div>
                  </div>;
            })}
          </div>
      }

      <hr style={S.divider}/>
      <h4 style={{ color:'var(--text-primary)', marginBottom:'16px' }}>Explorar historial</h4>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'16px' }}>
        <div>
          <label style={S.label}>Reporte</label>
          <select style={S.select} value={reporteSel} onChange={e=>onReporteChange(e.target.value)}>
            {Object.entries(REPORTES).map(([k,cfg])=>(
              <option key={k} value={k}>{cfg.emoji} {cfg.nombre}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={S.label}>Carga</label>
          <select style={S.select} value={fechaSel} onChange={e=>onFechaChange(e.target.value)} disabled={fechas.length===0}>
            {fechas.length===0 && <option>Sin cargas disponibles</option>}
            {fechas.map(f=>(
              <option key={f.fecha_carga} value={f.fecha_carga}>
                {utcACR(f.fecha_carga)} — {f.periodo_reporte||'Sin período'}
              </option>
            ))}
          </select>
        </div>
      </div>

      {cargando && <div style={S.info}>⏳ Cargando datos...</div>}

      {!cargando && datos.length > 0 && (
        <>
          <div style={{ display:'flex', gap:'12px', alignItems:'center', marginBottom:'12px', flexWrap:'wrap' }}>
            <span style={{ color:'var(--text-muted)', fontSize:'0.85rem' }}>
              <strong style={{ color:'var(--text-primary)' }}>{datosFiltrados.length.toLocaleString()}</strong> / {datos.length.toLocaleString()} filas
            </span>
            <input style={{ ...S.input, maxWidth:'280px' }} placeholder="🔍 Buscar en datos..." value={buscar} onChange={e=>setBuscar(e.target.value)}/>
            <button style={S.btnGhost} onClick={descargarCSV}>⬇️ Descargar CSV</button>
          </div>

          <div style={{ overflowX:'auto', borderRadius:'10px', border:'1px solid var(--border-soft)' }}>
            <table style={S.table}>
              <thead>
                <tr>{columnas.slice(0,12).map(c=><th key={c} style={S.th}>{c}</th>)}</tr>
              </thead>
              <tbody>
                {datosFiltrados.slice(0,200).map((row,i)=>(
                  <tr key={i} style={{ background: i%2===0 ? '#0f1115' : '#161920' }}>
                    {columnas.slice(0,12).map(c=><td key={c} style={S.td} title={String(row[c]||'')}>{String(row[c]||'—')}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            {datosFiltrados.length > 200 && (
              <div style={{ padding:'10px 16px', color:'var(--text-muted)', fontSize:'0.82rem', borderTop:'1px solid var(--border-soft)' }}>
                Mostrando 200 de {datosFiltrados.length.toLocaleString()} filas · Descargá CSV para ver todo
              </div>
            )}
          </div>
        </>
      )}

      {!cargando && datos.length===0 && fechas.length===0 && (
        <div style={S.info}>📭 Todavía no hay datos cargados para este reporte.</div>
      )}
    </div>
  );
}

// ── Vista principal ───────────────────────────────────────────────────────
export default function EzequielCentrodeDatos() {
  const [tab, setTab] = useState(0);

  return (
    <div style={S.page}>
      <div style={S.kicker}>NEO · Reportes</div>
      <h1 style={S.title}>📂 Ezequiel – Centro de Datos</h1>
      <p style={S.caption}>Subí tus reportes de NEO y Génesis los guarda con historial completo en la nube.</p>

      <div style={S.tabs}>
        {['⬆️ Subir reportes','📊 Ver datos'].map((t,i)=>(
          <button key={i} style={{ ...S.tab, ...(tab===i ? S.tabActive : {}) }} onClick={()=>setTab(i)}>{t}</button>
        ))}
      </div>

      {tab===0 && <TabSubir/>}
      {tab===1 && <TabVerDatos/>}
    </div>
  );
}
