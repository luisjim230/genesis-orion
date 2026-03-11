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
  // ── Nuevos: Equipo de Ventas ─────────────────────────────────────────────
  neo_items_facturados: {
    nombre:'Lista de ítems facturados', emoji:'🧾',
    descripcion:'Detalle de cada ítem vendido: vendedor, costo, utilidad, cliente.',
    header_row:1, titulo_valor:'Lista de ítems facturados',
    fecha_col:'fecha',
    // Solo columnas necesarias para el módulo Equipo de Ventas (reduce payload ~50%)
    columnas:['factura','fecha','vendedor','cliente','codigo_interno','item','bodega','cantidad_facturada','cantidad_devuelta','precio_unitario','costo_unitario','subtotal','descuento','pct_descuento','impuesto','impuestos','utilidad_costo','total','tipo_cambio','territorio'],
    columnas_originales:['Factura','Fecha','Vendedor','Cliente','Código interno','Ítem','Bodega','Cantidad facturada','Cantidad devuelta','Precio unitario sin impuesto','Costo unitario sin impuesto','Subtotal','Descuento','% Descuento','Impuesto','Impuestos','Utilidad/costo','Total','Tipo de cambio de venta','Territorio'],
    modulos_destino:['vendedores'],
  },
  neo_informe_ventas_vendedor: {
    nombre:'Informe de ventas por vendedor', emoji:'👤',
    descripcion:'Totales de ventas, notas de crédito, utilidad y margen por vendedor.',
    titulo_valor:'Informe de ventas por  vendedor',
    header_row:7, data_row:8,
    usar_vendedor_parser: true,
    modulos_destino:['vendedores'],
    columnas:['vendedor','unidades_vendidas','ventas_sin_imp','ventas_con_imp','notas_sin_imp','notas_con_imp','imp_ventas','imp_notas','ventas_otros_cargos','notas_otros_cargos','ventas_totales','notas_totales','ventas_netas','costo','utilidad','pct_utilidad','util_costo','transacciones','tiquete_promedio'],
    columnas_originales:['Vendedor','Unidades vendidas','Ventas sin impuestos','Ventas con impuestos','Notas a clientes sin impuestos','Notas a clientes con impuestos','Impuestos ventas','Impuestos notas','Ventas / Otros cargos','Notas a clientes / Otros cargos','Ventas totales','Notas a clientes totales','Ventas netas','Costo','Utilidad','% Utilidad','Utilidad/Costo','Transacciones','Tiquete promedio'],
  },
  neo_informe_ventas_categoria: {
    nombre:'Informe de ventas por categoría', emoji:'📦',
    descripcion:'Totales de ventas, notas de crédito, utilidad y margen por categoría y subcategoría.',
    titulo_valor:'Informe de ventas por  Categoría del ítem',
    header_row:7, data_row:8,
    usar_categoria_parser: true,
    modulos_destino:['vendedores'],
    columnas:['categoria','subcategoria','unidades_vendidas','ventas_sin_imp','ventas_con_imp','notas_sin_imp','notas_con_imp','imp_ventas','imp_notas','ventas_otros_cargos','notas_otros_cargos','ventas_totales','notas_totales','ventas_netas','costo','utilidad','pct_utilidad','util_costo','transacciones','tiquete_promedio'],
    columnas_originales:['Categoría del ítem','','Unidades vendidas','Ventas sin impuestos','Ventas con impuestos','Notas a clientes sin impuestos','Notas a clientes con impuestos','Impuestos ventas','Impuestos notas','Ventas / Otros cargos','Notas a clientes / Otros cargos','Ventas totales','Notas a clientes totales','Ventas netas','Costo','Utilidad','% Utilidad','Utilidad/Costo','Transacciones','Tiquete promedio'],
  },
  neo_consolidado_facturas: {
    nombre:'Consolidado de facturas', emoji:'📑',
    descripcion:'Resumen de facturas por vendedor: modo de pago, subtotal, total.',
    // XLSX.js no puede leer los headers de este reporte (celdas mergeadas en fila 8)
    // Se detecta por nombre de archivo y se procesa por índice de columna fijo
    header_row:8, titulo_valor:'Consolidado de facturas',
    fecha_col:'fecha',
    usar_indices: true,   // flag: no buscar headers, usar posición fija
    data_row: 9,          // los datos empiezan en índice 9 (Excel row 10)
    columnas:['factura','fecha','modo_pago','vendedor','cliente','subtotal','descuento','impuesto','total','observaciones','moneda'],
    // índices de columna: 0=Factura, 1=Fecha, 2=Modo pago, 3=Vendedor, 4=Cliente,
    // 5=Subtotal, 6=Descuento, 7=Impuesto, 8=Total, 9=Observaciones, 10=Moneda
    col_indices:[0,1,2,3,4,5,6,7,8,9,10],
    columnas_originales:['Factura',' Fecha',' Modo de pago',' Vendedor',' Cliente',' Subtotal',' Descuento',' Impuesto',' Total',' Observaciones','Moneda'],
    modulos_destino:['vendedores'],
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

function detectarTipo(filas, nombreArchivo) {
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

  // ── Fallback: detectar por nombre de archivo ────────────────────────────
  // Algunos reportes tienen celdas mergeadas que XLSX.js no puede leer
  if (nombreArchivo) {
    const nom = nombreArchivo.toLowerCase();
    const mapaArchivo = [
      { patron: 'consolidado_de_facturas', tabla: 'neo_consolidado_facturas' },
      { patron: 'consolidado de facturas',  tabla: 'neo_consolidado_facturas' },
      { patron: 'lista_de_i_tems_facturados', tabla: 'neo_items_facturados' },
      { patron: 'lista de ítems facturados',  tabla: 'neo_items_facturados' },
      { patron: 'items_facturados',           tabla: 'neo_items_facturados' },
      // Detectar informe de ventas: vendedor vs categoría por contenido de fila 1
      { patron: 'informe_de_ventas',          tabla: '_informe_ventas_check' },
      { patron: 'informe de ventas',          tabla: '_informe_ventas_check' },
    ];
    for (const { patron, tabla } of mapaArchivo) {
      if (nom.includes(patron)) {
        if (tabla === '_informe_ventas_check') {
          // Distinguir por contenido de fila 1: "vendedor" vs "Categoría"
          for (let i = 0; i < Math.min(5, filas.length); i++) {
            const txt = filas[i].map(v => String(v||'').toLowerCase()).join(' ');
            if (txt.includes('vendedor')) return 'neo_informe_ventas_vendedor';
            if (txt.includes('categor')) return 'neo_informe_ventas_categoria';
          }
        }
        return tabla;
      }
    }
  }

  return null;
}

function extraerPeriodo(filas, tipo) {
  // Caso 1: rango explícito "Del X al Y" en encabezado (cualquier reporte)
  for (let i = 0; i < Math.min(10, filas.length); i++) {
    const fila = Array.isArray(filas[i]) ? filas[i] : [];
    for (const v of fila) {
      const s = String(v||'').trim();
      if (s && (s.includes('Del ') || s.includes('del ')) && s.includes('/')) return s;
    }
  }

  // Caso 2: Lista de ítems facturados — leer fechas reales de las facturas
  // La columna "Fecha" (col 2) tiene seriales de Excel con la fecha de cada factura
  if (tipo === 'neo_items_facturados' && filas.length > 2) {
    const fechas = [];
    for (let i = 2; i < filas.length; i++) {
      const serial = parseFloat(filas[i][2]);
      if (!isNaN(serial) && serial > 40000) { // serial válido (año > 2009)
        const ms = Math.round((serial - 25569) * 86400 * 1000);
        fechas.push(ms);
      }
    }
    if (fechas.length > 0) {
      const min = new Date(Math.min(...fechas));
      const max = new Date(Math.max(...fechas));
      const fmt = d => d.toLocaleDateString('es-CR', { day:'2-digit', month:'2-digit', year:'numeric' });
      if (fmt(min) === fmt(max)) {
        return `Día ${max.toISOString().slice(0,10)}`;
      }
      return `Del ${fmt(min)} al ${fmt(max)}`;
    }
  }

  // Caso 3: Informes de ventas — fecha en fila 2 (formato DD/MM/YYYY HH:MM)
  for (let i = 0; i < Math.min(5, filas.length); i++) {
    const fila = Array.isArray(filas[i]) ? filas[i] : [];
    for (const v of fila) {
      const s = String(v||'').trim();
      if (s.match(/^\d{2}\/\d{2}\/\d{4}/)) {
        const parts = s.split(' ')[0].split('/');
        if (parts.length === 3) {
          const [d, m, y] = parts;
          return `Día ${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
        }
      }
    }
  }

  // Fallback: fecha de hoy
  return `Día ${new Date().toISOString().slice(0,10)}`;
}

function procesarExcel(filas, tabla, fechaCarga, periodo) {
  const cfg = REPORTES[tabla];

  // ── Procesador: Informe ventas por VENDEDOR ───────────────────────────────
  if (cfg.usar_vendedor_parser) {
    const records = [];
    // Headers en fila 7, datos de fila 8 en adelante
    // Col 0 = vendedor (string) o vacío (subtotal) — solo guardamos filas con nombre
    // Última fila = total general (número en col 0)
    const COLS = ['ventas_sin_imp','ventas_con_imp','notas_sin_imp','notas_con_imp','imp_ventas','imp_notas','ventas_otros_cargos','notas_otros_cargos','ventas_totales','notas_totales','ventas_netas','costo','utilidad','pct_utilidad','util_costo','transacciones','tiquete_promedio'];
    const n = (v) => parseFloat(String(v||'0').replace('%','').trim()) || 0;
    for (const row of filas.slice(8)) {
      if (!row || !row.length) continue;
      const col0 = String(row[0]||'').trim();
      // Solo filas con nombre de vendedor (string no vacío, no número)
      if (!col0 || !isNaN(parseFloat(col0))) continue;
      const record = {
        fecha_carga: fechaCarga, periodo_reporte: periodo,
        vendedor: col0,
        unidades_vendidas: n(row[1]),
      };
      // unidades en col 1, datos de col 2 en adelante → mapear
      COLS.forEach((c, i) => { record[c] = n(row[i + 2]); });
      records.push(record);
    }
    return records;
  }

  // ── Procesador: Informe ventas por CATEGORÍA ──────────────────────────────
  if (cfg.usar_categoria_parser) {
    const records = [];
    const n = (v) => parseFloat(String(v||'0').replace('%','').trim()) || 0;
    // Header en fila 7: [Categoría, subcategoría-o-nada, unidades, ...]
    // Fila con 2 strings iniciales = subcategoría; 1 string = categoría sin subcat
    // Última fila = totales (col 0 = número)
    const DATA_COLS = ['unidades_vendidas','ventas_sin_imp','ventas_con_imp','notas_sin_imp','notas_con_imp','imp_ventas','imp_notas','ventas_otros_cargos','notas_otros_cargos','ventas_totales','notas_totales','ventas_netas','costo','utilidad','pct_utilidad','util_costo','transacciones','tiquete_promedio'];
    for (const row of filas.slice(8)) {
      if (!row || !row.length) continue;
      const col0 = String(row[0]||'').trim();
      const col1 = String(row[1]||'').trim();
      // Saltar fila de totales (col0 = número)
      if (!col0 || !isNaN(parseFloat(col0))) continue;

      let categoria, subcategoria, dataStart;
      if (col1 && isNaN(parseFloat(col1))) {
        // col0=categoria, col1=subcategoria, datos desde col 2
        categoria = col0; subcategoria = col1; dataStart = 2;
      } else {
        // col0=categoria (sin subcat), datos desde col 1
        categoria = col0; subcategoria = null; dataStart = 1;
      }
      const record = { fecha_carga: fechaCarga, periodo_reporte: periodo, categoria, subcategoria };
      DATA_COLS.forEach((c, i) => { record[c] = n(row[dataStart + i]); });
      records.push(record);
    }
    return records;
  }

  // ── Procesador por índice de columna (para reportes con headers mergeados) ─

  if (cfg.usar_indices) {
    const dataRows = filas.slice(cfg.data_row);
    const records = [];
    for (const row of dataRows) {
      if (!row || row.every(v => v === null || v === undefined || String(v).trim() === '')) continue;
      const primerVal = String(row[0]||'').trim();
      if (!primerVal || primerVal.startsWith('Total:') || primerVal === 'Factura') continue;

      const record = { fecha_carga: fechaCarga, periodo_reporte: periodo };
      cfg.columnas.forEach((col, i) => {
        const idx = cfg.col_indices[i];
        const val = row[idx];
        if (val === null || val === undefined || String(val).trim() === '') {
          record[col] = null;
        } else {
          const s = String(val).trim();
          record[col] = (s === '' || s === 'nan' || s === 'null') ? null : s;
        }
      });
      records.push(record);
    }
    return records;
  }

  // ── Procesador estándar por nombre de columna ────────────────────────────
  const headerRow = cfg.header_row;
  const headers = filas[headerRow].map(v => String(v||'').trim());
  const dataRows = filas.slice(headerRow + 1);

  // Construir rename map: original → normalizado
  const renameMap = {};
  cfg.columnas_originales.forEach((orig, i) => {
    const norm = cfg.columnas[i];
    const colIdx = headers.findIndex(h => h.trim() === orig.trim());
    if (colIdx >= 0) renameMap[colIdx] = norm;
    else console.warn(`[Ezequiel] NO mapeado: "${orig}"`);
  });
  console.log(`[Ezequiel] renameMap keys:`, Object.keys(renameMap).length, 'de', cfg.columnas_originales.length);

  const limpiar = (val, colName) => {
    if (val === null || val === undefined) return null;
    // Número serial de Excel en columna de fecha → convertir a YYYY-MM-DD
    if (typeof val === 'number' && colName && colName.toLowerCase().includes('fecha')) {
      const d = new Date((val - 25569) * 86400 * 1000);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    // Si es número (no fecha), convertir directamente a string sin notación científica
    if (typeof val === 'number') return String(val);
    // Convertir a string y limpiar TODOS los whitespace (incluyendo non-breaking spaces)
    const s = String(val).trim();
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
      record[norm] = limpiar(row[idx], norm);
    }
    records.push(record);
  }
  
  return records;
}

// ── Deduplicación inteligente por período ─────────────────────────────────
// REGLA CLAVE:
//   • Mismo período exacto  → borra la carga anterior y reemplaza (evita duplicados)
//   • Período distinto      → acumula (suma datos históricos de distintos períodos)
//   • "Sin período"         → usa la fecha del día como identificador de período
//
// Esto permite subir:
//   - Un reporte diario, semanal o mensual
//   - Acumular histórico de múltiples períodos en la misma tabla
//   - Re-subir el mismo período sin duplicar datos
async function cargarASupabase(tabla, records, periodoNuevo, onProgress) {
  if (!records.length) return { total: 0, esNuevoPeriodo: true };
  const BATCH = 500;
  const fechaCargaActual = records[0]?.fecha_carga;

  // Normalizar período: si no viene, usar fecha del día como clave única
  let periodo = periodoNuevo || 'Sin período';
  if (periodo === 'Sin período') {
    const hoy = new Date(fechaCargaActual);
    periodo = `Día ${hoy.getFullYear()}-${String(hoy.getMonth()+1).padStart(2,'0')}-${String(hoy.getDate()).padStart(2,'0')}`;
  }

  // Poner el período normalizado en todos los records
  records = records.map(r => ({ ...r, periodo_reporte: periodo }));

  // Dedup: si ya existe UNA carga con este mismo período → borrarla antes de insertar
  // Si el período es distinto a los existentes → no borramos nada (acumulamos)
  let esNuevoPeriodo = true;
  try {
    const { data: previas } = await supabase
      .from(tabla)
      .select('fecha_carga')
      .eq('periodo_reporte', periodo)
      .limit(50);

    const fcsUnicas = [...new Set((previas||[]).map(r => r.fecha_carga))];
    if (fcsUnicas.length > 0) {
      console.log(`[SOL] Período "${periodo}" ya existe en ${tabla} — reemplazando ${fcsUnicas.length} carga(s) previa(s)`);
      for (const fc of fcsUnicas) {
        await supabase.from(tabla).delete().eq('fecha_carga', fc);
      }
      esNuevoPeriodo = false;
    } else {
      console.log(`[SOL] Período "${periodo}" es NUEVO en ${tabla} — acumulando al histórico`);
      esNuevoPeriodo = true;
    }
  } catch(e) {
    console.warn('[SOL] Advertencia en dedup:', e.message);
  }

  // Insertar en batches
  let total = 0;
  const errores = [];
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    let intentos = 0;
    let ok = false;
    while (intentos < 3 && !ok) {
      const { error } = await supabase.from(tabla).insert(batch);
      if (!error) {
        total += batch.length;
        console.log(`[SOL] Batch ${Math.floor(i/BATCH)+1}/${Math.ceil(records.length/BATCH)}: OK (${batch.length} filas, total=${total})`);
        ok = true;
        if (onProgress) onProgress(total);
      } else {
        intentos++;
        console.error(`[SOL] Batch ${Math.floor(i/BATCH)+1} intento ${intentos} error:`, error.message, '|', error.details, '|', error.hint);
        if (intentos >= 3) {
          errores.push(`Batch ${Math.floor(i/BATCH)+1}: ${error.message}`);
          break; // Continuar con el siguiente batch en vez de tirar error total
        }
        await new Promise(r => setTimeout(r, 800 * intentos));
      }
    }
  }
  if (errores.length) console.error('[SOL] Batches fallidos:', errores.join('; '));
  return { total, esNuevoPeriodo };
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
        const filas = XLSX.utils.sheet_to_json(ws, { header:1, defval:'' });

        const tipo = detectarTipo(filas, file.name);
        console.log(`[Ezequiel] Archivo: ${file.name} → tipo: ${tipo}`);
        console.log(`[Ezequiel] Filas totales: ${filas.length}`);
        if (!tipo) {
          res.estado  = 'no_reconocido';
          res.error   = 'No se pudo identificar el tipo de reporte.';
          nuevos.push(res);
          continue;
        }

        let cantidad;
        // neo_minimos_maximos: procesar en el SERVIDOR para manejar xml:space="preserve"
        // XLSX.js en el browser ignora ese atributo y devuelve "" para strings con espacios
        if (tipo === 'neo_minimos_maximos') {
          const formData = new FormData();
          formData.append('file', file);
          const apiRes = await fetch('/api/subir-inventario', { method: 'POST', body: formData });
          const apiData = await apiRes.json();
          if (!apiRes.ok) throw new Error(apiData.error || 'Error en servidor');
          console.log(`[Ezequiel] Servidor procesó: ${apiData.total} records, ${apiData.con_proveedor} con proveedor`);
          cantidad = apiData.total;
          res.tipo = tipo;
          res.filas = cantidad;
          res.periodo = apiData.fecha_carga?.slice(0, 10) || '';
          res.estado = 'ok';
          nuevos.push(res);
          continue;
        }

        const periodo  = extraerPeriodo(filas, tipo);
        const records  = procesarExcel(filas, tipo, fechaCarga, periodo);
        console.log(`[SOL] procesarExcel → ${records.length} records para ${tipo}`);
        if (records.length > 0) console.log(`[SOL] Sample:`, JSON.stringify(records[0]).slice(0,200));
        // Mostrar progreso en tiempo real
        res.totalRecords = records.length;
        setResultados(prev => {
          const idx = prev.findIndex(r => r === res);
          if (idx >= 0) { const n=[...prev]; n[idx]={...res}; return n; }
          return prev;
        });
        const { total: cantidad2, esNuevoPeriodo } = await cargarASupabase(tipo, records, periodo, (inserted) => {
          res.insertados = inserted;
          setResultados(prev => [...prev]);
        });
        console.log(`[SOL] cargarASupabase → ${cantidad2} insertados, nuevo período: ${esNuevoPeriodo}`);
        cantidad = cantidad2;

        // ── Auto-crear vendedores en sol_metas_vendedor ───────────────────
        // Si es un informe de ventas por vendedor, crear filas en sol_metas_vendedor
        // para los vendedores nuevos (sin pisar parámetros ya configurados)
        if (tipo === 'neo_informe_ventas_vendedor' && records.length > 0) {
          try {
            const vendedoresEnReporte = [...new Set(records.map(r => r.vendedor).filter(Boolean))];
            // Traer los que ya existen
            const { data: yaExisten } = await supabase
              .from('sol_metas_vendedor')
              .select('vendedor');
            const setExistentes = new Set((yaExisten || []).map(r => r.vendedor));
            const nuevosVendedores = vendedoresEnReporte.filter(v => !setExistentes.has(v));
            if (nuevosVendedores.length > 0) {
              const filas = nuevosVendedores.map(v => ({
                vendedor: v,
                meta_ventas: 0,
                meta_utilidad: 0,
                pct_comision: 3,
                bono_meta: 1,
                bono_margen: 1,
                umbral_margen: 35,
              }));
              await supabase.from('sol_metas_vendedor').insert(filas);
              console.log(`[SOL] Auto-creados ${nuevosVendedores.length} vendedores nuevos:`, nuevosVendedores.join(', '));
            } else {
              console.log('[SOL] Todos los vendedores ya existen en sol_metas_vendedor');
            }
          } catch(e) {
            console.warn('[SOL] No se pudieron auto-crear vendedores:', e.message);
          }
        }

        // ── Auto-match trazabilidad si es lista de ítems comprados ────────
        if (tipo === 'neo_items_comprados' && cantidad > 0) {
          try {
            const matchRes = await fetch('/api/procesar-match', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ fecha_carga: fechaCarga }),
            });
            const matchData = await matchRes.json();
            console.log('[SOL] Match trazabilidad auto:', matchData);
            if (matchData.ok) res.matchTrazabilidad = `✅ Match: ${matchData.completados} completos, ${matchData.parciales} parciales`;
          } catch(e) { console.warn('[SOL] Match auto falló:', e.message); }
        }

        res.estado  = cantidad > 0 ? 'ok' : 'error';
        res.tipo    = tipo;
        res.filas   = cantidad;
        res.filasTotales = records.length;
        res.periodo = periodo;
        res.esNuevoPeriodo = esNuevoPeriodo;
        if (cantidad === 0 && records.length > 0) {
          res.error = 'Se procesaron ' + records.length + ' filas pero ninguna se guardó en la BD. Revisar consola (F12).';
        }
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
      <p style={{ color:'var(--text-muted)', marginBottom:'20px' }}>Podés subir varios archivos a la vez. SOL detecta automáticamente qué tipo de reporte es cada uno.</p>

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
                ['📊 Lista de mínimos y máximos',        '📦 Inventario · 🔄 Rotación de productos'],
                ['🛒 Lista de ítems comprados',           '🔴 Trazabilidad'],
                ['📅 Antigüedad de saldos · proveedores','💰 Finanzas → Cuentas por pagar'],
                ['👥 Antigüedad de saldos · clientes',   '💰 Finanzas → Cuentas por cobrar'],
                ['🏆 Ítems más vendidos',                 '🔄 Rotación · 👥 Equipo de ventas'],
                ['💰 Rentabilidad por proveedor',         '👥 Equipo de ventas'],
                ['📋 Lista de ítems',                     '🔄 Rotación de productos'],
                ['🧾 Lista de ítems facturados',          '👥 Ventas — Pestaña Productos · 📈 Proyección de inventario'],
                ['👤 Informe de ventas por vendedor',     '👥 Ventas — Resumen + Comisiones'],
                ['📦 Informe de ventas por Categoría',   '👥 Ventas — Categorías'],
                ['📑 Consolidado de facturas',            '👥 Equipo de ventas'],
                ['📒 Movimientos contables',              '📒 Contabilidad'],
              ].map(([r,a],i)=>(
                <tr key={i} style={{ background: i%2===0 ? 'transparent' : 'rgba(237,110,46,0.04)' }}>
                  <td style={S.td}>{r}</td>
                  <td style={{ ...S.td, color:'#63b3ed' }}>{a}</td>
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
        <p style={{ color:'#2a3a50', margin:'6px 0 16px', fontSize:'0.82rem' }}>Ítems facturados · Informe vendedor · Informe categoría · Mínimos/máximos · Ítems comprados · Rentabilidad · Antigüedad saldos</p>
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
                        {REPORTES[r.tipo]?.emoji} {REPORTES[r.tipo]?.nombre} · <strong style={{ color:'var(--text-primary)' }}>{r.periodo}</strong> ·{' '}
                        <strong style={{ color:'var(--text-primary)' }}>{r.filas.toLocaleString()}</strong> filas{r.filasTotales && r.filasTotales !== r.filas ? <span style={{color:'#e53e3e'}}> ({r.filasTotales} en archivo)</span> : ''}{' '}
                        {r.esNuevoPeriodo
                          ? <span style={{ background:'#c6f6d5', color:'#276749', borderRadius:4, padding:'1px 7px', fontSize:'0.72rem', fontWeight:700 }}>+ NUEVO PERÍODO</span>
                          : <span style={{ background:'#fef3c7', color:'#92400e', borderRadius:4, padding:'1px 7px', fontSize:'0.72rem', fontWeight:700 }}>↺ REEMPLAZADO</span>
                        }
                      </div>
                    </>
                  )}
                  {r.estado==='no_reconocido' && <div style={{ fontSize:'0.83rem', color:'#7B341E' }}>⚠️ No reconocido — {r.error}</div>}
                  {r.estado==='error' && <div style={{ fontSize:'0.83rem', color:'#f87171' }}>❌ Error: {r.error}</div>}
                  {r.estado==='procesando' && (
                    r.totalRecords > 0 ? (
                      <div style={{ marginTop:4 }}>
                        <div style={{ fontSize:'0.78rem', color:'var(--orange)', marginBottom:3 }}>
                          ⏳ Subiendo… {(r.insertados||0).toLocaleString()} / {r.totalRecords.toLocaleString()} filas
                        </div>
                        <div style={{ background:'#EAE0E0', borderRadius:4, height:6, width:'180px' }}>
                          <div style={{ background:'var(--orange)', borderRadius:4, height:6,
                            width: Math.round(((r.insertados||0)/r.totalRecords)*100)+'%',
                            transition:'width 0.4s ease' }}/>
                        </div>
                      </div>
                    ) : <div style={{ fontSize:'0.83rem', color:'var(--orange)' }}>⏳ Procesando...</div>
                  )}
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
      <p style={S.caption}>Subí tus reportes de NEO y SOL los guarda con historial completo en la nube.</p>

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
