import { useState, useMemo, useRef, useEffect } from "react";

const MOCK_PRODUCTS = [
  { id: 1, codigo: "A-001", nombre: "Aceite Motor 10W40", proveedor: "Lubrimax SA", stock: 3, minimo: 20, transito: 0, alerta: "BAJO_STOCK", cantComprar: 60 },
  { id: 2, codigo: "A-002", nombre: "Filtro de Aire", proveedor: "Filtros del Sur", stock: 5, minimo: 15, transito: 10, alerta: "BAJO_STOCK", cantComprar: 20 },
  { id: 3, codigo: "B-010", nombre: "Pastillas de Freno", proveedor: "FrenoTec", stock: 45, minimo: 30, transito: 0, alerta: "OPTIMO", cantComprar: 0 },
  { id: 4, codigo: "B-011", nombre: "Disco de Freno", proveedor: "FrenoTec", stock: 8, minimo: 10, transito: 5, alerta: "ATENCION", cantComprar: 7 },
  { id: 5, codigo: "C-020", nombre: "Bujía NGK", proveedor: "AutoParts CR", stock: 120, minimo: 50, transito: 0, alerta: "SOBRESTOCK", cantComprar: 0 },
  { id: 6, codigo: "C-021", nombre: "Cable de Bujía", proveedor: "AutoParts CR", stock: 200, minimo: 40, transito: 0, alerta: "SOBRESTOCK", cantComprar: 0 },
  { id: 7, codigo: "D-030", nombre: "Correa de Distribución", proveedor: "Lubrimax SA", stock: 2, minimo: 10, transito: 0, alerta: "BAJO_STOCK", cantComprar: 30 },
  { id: 8, codigo: "D-031", nombre: "Tensor de Correa", proveedor: "Lubrimax SA", stock: 0, minimo: 5, transito: 3, alerta: "BAJO_STOCK", cantComprar: 7 },
  { id: 9, codigo: "E-040", nombre: "Líquido de Frenos DOT4", proveedor: "Filtros del Sur", stock: 18, minimo: 20, transito: 0, alerta: "ATENCION", cantComprar: 10 },
  { id: 10, codigo: "E-041", nombre: "Anticongelante", proveedor: "Filtros del Sur", stock: 35, minimo: 30, transito: 0, alerta: "OPTIMO", cantComprar: 0 },
  { id: 11, codigo: "F-050", nombre: "Amortiguador Delantero", proveedor: "ShockPro", stock: 6, minimo: 8, transito: 0, alerta: "ATENCION", cantComprar: 10 },
  { id: 12, codigo: "F-051", nombre: "Amortiguador Trasero", proveedor: "ShockPro", stock: 1, minimo: 8, transito: 0, alerta: "BAJO_STOCK", cantComprar: 24 },
  { id: 13, codigo: "G-060", nombre: "Batería 12V 60Ah", proveedor: "PowerBatt", stock: 300, minimo: 50, transito: 0, alerta: "SOBRESTOCK", cantComprar: 0 },
  { id: 14, codigo: "G-061", nombre: "Batería 12V 80Ah", proveedor: "PowerBatt", stock: 90, minimo: 20, transito: 0, alerta: "SOBRESTOCK", cantComprar: 0 },
  { id: 15, codigo: "H-070", nombre: "Filtro de Combustible", proveedor: "AutoParts CR", stock: 25, minimo: 20, transito: 6, alerta: "TRANSITO", cantComprar: 0 },
  { id: 16, codigo: "H-071", nombre: "Bomba de Combustible", proveedor: "AutoParts CR", stock: 4, minimo: 6, transito: 4, alerta: "TRANSITO", cantComprar: 0 },
];

const ALERT_CONFIG = {
  BAJO_STOCK: { label: "Bajo Stock", color: "#ef4444", bg: "#fef2f2", border: "#fecaca", dot: "🔴", order: 1 },
  TRANSITO:   { label: "Tránsito",   color: "#f97316", bg: "#fff7ed", border: "#fed7aa", dot: "🟠", order: 2 },
  ATENCION:   { label: "Atención",   color: "#eab308", bg: "#fefce8", border: "#fef08a", dot: "🟡", order: 3 },
  OPTIMO:     { label: "Óptimo",     color: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0", dot: "🟢", order: 4 },
  SOBRESTOCK: { label: "Sobrestock", color: "#3b82f6", bg: "#eff6ff", border: "#bfdbfe", dot: "🔵", order: 5 },
};

function ColFilter({ label, values, selected, onSelect, onSort, activeSort }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const isFiltered = selected.size < values.length;
  const isActive = isFiltered || activeSort;
  const visibleValues = values.filter(v => String(v).toLowerCase().includes(search.toLowerCase()));

  const toggleAll = () => {
    if (selected.size === values.length) onSelect(new Set());
    else onSelect(new Set(values));
  };

  const toggle = (v) => {
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    onSelect(next);
  };

  return (
    <div ref={ref} style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 4 }}>
      <span style={{ fontWeight: 700, color: "#374151", fontSize: 12, letterSpacing: 0.3 }}>{label}</span>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: isActive ? "#f97316" : "#e5e7eb",
          border: "none", borderRadius: 4, width: 20, height: 20,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, color: isActive ? "white" : "#6b7280", flexShrink: 0,
        }}
        title="Filtrar columna"
      >
        {isActive ? "▼" : "▾"}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 999,
          background: "white", border: "1.5px solid #e5e7eb", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 200, padding: 8,
        }}>
          <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 0.5, marginBottom: 4, paddingLeft: 4 }}>ORDENAR</div>
            {[{ dir: "asc", icon: "↑", text: "Ascendente" }, { dir: "desc", icon: "↓", text: "Descendente" }].map(({ dir, icon, text }) => (
              <button key={dir} onClick={() => { onSort(dir); setOpen(false); }} style={{
                display: "flex", alignItems: "center", gap: 8, width: "100%",
                padding: "5px 8px", borderRadius: 6, border: "none", cursor: "pointer",
                background: activeSort === dir ? "#fff7ed" : "transparent",
                color: activeSort === dir ? "#f97316" : "#374151",
                fontWeight: activeSort === dir ? 700 : 400, fontSize: 13,
              }}>
                <span style={{ fontSize: 14 }}>{icon}</span>{text}
              </button>
            ))}
          </div>

          <div style={{ borderBottom: "1px solid #f3f4f6", paddingBottom: 6, marginBottom: 6 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: 0.5, marginBottom: 4, paddingLeft: 4 }}>FILTRAR</div>
            <input
              placeholder="Buscar..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", padding: "5px 8px", border: "1px solid #e5e7eb", borderRadius: 6, fontSize: 12, outline: "none" }}
              onClick={e => e.stopPropagation()}
            />
          </div>

          <div style={{ maxHeight: 180, overflowY: "auto" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 6px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151" }}>
              <input type="checkbox" checked={selected.size === values.length} onChange={toggleAll} style={{ cursor: "pointer" }} />
              (Seleccionar todo)
            </label>
            {visibleValues.map(v => (
              <label key={v} style={{ display: "flex", alignItems: "center", gap: 8, padding: "3px 6px", cursor: "pointer", fontSize: 12, color: "#4b5563", borderRadius: 4 }}>
                <input type="checkbox" checked={selected.has(v)} onChange={() => toggle(v)} style={{ cursor: "pointer" }} />
                {ALERT_CONFIG[v] ? `${ALERT_CONFIG[v].dot} ${ALERT_CONFIG[v].label}` : String(v)}
              </label>
            ))}
          </div>

          <button onClick={() => setOpen(false)} style={{
            marginTop: 8, width: "100%", padding: "7px 0",
            background: "#f97316", color: "white", border: "none",
            borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: "pointer",
          }}>
            Aplicar
          </button>
        </div>
      )}
    </div>
  );
}

export default function SaturnoInventario() {
  const [busqueda, setBusqueda] = useState("");
  const [alertaFiltro, setAlertaFiltro] = useState("TODOS");
  const [colFilters, setColFilters] = useState({
    codigo: new Set(MOCK_PRODUCTS.map(p => p.codigo)),
    nombre: new Set(MOCK_PRODUCTS.map(p => p.nombre)),
    proveedor: new Set(MOCK_PRODUCTS.map(p => p.proveedor)),
    stock: new Set(MOCK_PRODUCTS.map(p => p.stock)),
    transito: new Set(MOCK_PRODUCTS.map(p => p.transito)),
    alerta: new Set(MOCK_PRODUCTS.map(p => p.alerta)),
    cantComprar: new Set(MOCK_PRODUCTS.map(p => p.cantComprar)),
  });
  const [colSort, setColSort] = useState({ col: "alerta", dir: "asc" });

  const allValues = useMemo(() => ({
    codigo: [...new Set(MOCK_PRODUCTS.map(p => p.codigo))].sort(),
    nombre: [...new Set(MOCK_PRODUCTS.map(p => p.nombre))].sort(),
    proveedor: [...new Set(MOCK_PRODUCTS.map(p => p.proveedor))].sort(),
    stock: [...new Set(MOCK_PRODUCTS.map(p => p.stock))].sort((a, b) => a - b),
    transito: [...new Set(MOCK_PRODUCTS.map(p => p.transito))].sort((a, b) => a - b),
    alerta: Object.keys(ALERT_CONFIG),
    cantComprar: [...new Set(MOCK_PRODUCTS.map(p => p.cantComprar))].sort((a, b) => a - b),
  }), []);

  const counts = useMemo(() => {
    const c = { TOTAL: MOCK_PRODUCTS.length };
    Object.keys(ALERT_CONFIG).forEach(k => { c[k] = MOCK_PRODUCTS.filter(p => p.alerta === k).length; });
    return c;
  }, []);

  const setFilter = (col, val) => setColFilters(f => ({ ...f, [col]: val }));
  const setSort = (col, dir) => setColSort({ col, dir });

  const filtered = useMemo(() => {
    let result = [...MOCK_PRODUCTS];
    if (busqueda.trim()) {
      const q = busqueda.toLowerCase();
      result = result.filter(p => p.nombre.toLowerCase().includes(q) || p.codigo.toLowerCase().includes(q) || p.proveedor.toLowerCase().includes(q));
    }
    if (alertaFiltro !== "TODOS") result = result.filter(p => p.alerta === alertaFiltro);
    result = result.filter(p =>
      colFilters.codigo.has(p.codigo) && colFilters.nombre.has(p.nombre) &&
      colFilters.proveedor.has(p.proveedor) && colFilters.stock.has(p.stock) &&
      colFilters.transito.has(p.transito) && colFilters.alerta.has(p.alerta) &&
      colFilters.cantComprar.has(p.cantComprar)
    );
    result.sort((a, b) => {
      let va = a[colSort.col], vb = b[colSort.col];
      if (colSort.col === "alerta") { va = ALERT_CONFIG[va].order; vb = ALERT_CONFIG[vb].order; }
      if (typeof va === "string") return colSort.dir === "asc" ? va.localeCompare(vb) : vb.localeCompare(va);
      return colSort.dir === "asc" ? va - vb : vb - va;
    });
    return result;
  }, [busqueda, alertaFiltro, colFilters, colSort]);

  const hasAnyColFilter = Object.entries(colFilters).some(([k, v]) => v.size < allValues[k].length);
  const hasFilters = busqueda || alertaFiltro !== "TODOS" || hasAnyColFilter;

  const resetAll = () => {
    setBusqueda(""); setAlertaFiltro("TODOS");
    setColFilters({
      codigo: new Set(allValues.codigo), nombre: new Set(allValues.nombre),
      proveedor: new Set(allValues.proveedor), stock: new Set(allValues.stock),
      transito: new Set(allValues.transito), alerta: new Set(allValues.alerta),
      cantComprar: new Set(allValues.cantComprar),
    });
  };

  const columns = [
    { key: "codigo", label: "Código" }, { key: "nombre", label: "Nombre" },
    { key: "proveedor", label: "Proveedor" }, { key: "stock", label: "Stock" },
    { key: "transito", label: "En Tránsito" }, { key: "alerta", label: "Alerta" },
    { key: "cantComprar", label: "Cant. a Comprar" },
  ];

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", background: "#fdf6f0", minHeight: "100vh", padding: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, color: "#1a1a2e" }}>🪐 Saturno – Inventario</h1>
          <p style={{ margin: "4px 0 0", color: "#888", fontSize: 13 }}>El Análisis de Stock · Depósito Jiménez</p>
        </div>
        <button style={{ background: "white", border: "2px solid #f97316", color: "#f97316", borderRadius: 8, padding: "8px 16px", fontWeight: 600, cursor: "pointer" }}>🔄 Reiniciar</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { key: "TOTAL", label: "TOTAL", count: counts.TOTAL, color: "#1a1a2e", border: "#1a1a2e" },
          { key: "BAJO_STOCK", label: "BAJO STOCK", count: counts.BAJO_STOCK, color: "#ef4444", border: "#ef4444" },
          { key: "TRANSITO", label: "TRÁNSITO", count: counts.TRANSITO, color: "#f97316", border: "#f97316" },
          { key: "ATENCION", label: "ATENCIÓN", count: counts.ATENCION, color: "#eab308", border: "#eab308" },
          { key: "OPTIMO", label: "ÓPTIMO", count: counts.OPTIMO, color: "#22c55e", border: "#22c55e" },
          { key: "SOBRESTOCK", label: "SOBRESTOCK", count: counts.SOBRESTOCK, color: "#3b82f6", border: "#3b82f6" },
        ].map(card => (
          <button key={card.key} onClick={() => setAlertaFiltro(alertaFiltro === card.key ? "TODOS" : card.key)} style={{
            background: alertaFiltro === card.key ? card.color : "white",
            border: `2px solid ${card.border}`, borderRadius: 12, padding: "14px 12px",
            cursor: "pointer", textAlign: "left", transition: "all 0.15s",
            transform: alertaFiltro === card.key ? "scale(1.03)" : "scale(1)",
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: alertaFiltro === card.key ? "rgba(255,255,255,0.8)" : "#888", letterSpacing: 0.5, marginBottom: 4 }}>
              {card.key !== "TOTAL" && ALERT_CONFIG[card.key]?.dot + " "}{card.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: alertaFiltro === card.key ? "white" : card.color }}>{card.count}</div>
          </button>
        ))}
      </div>

      <div style={{ background: "white", borderRadius: 14, padding: 16, marginBottom: 16, border: "1px solid #e5e7eb", boxShadow: "0 1px 6px rgba(0,0,0,0.06)", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ position: "relative", flex: "1 1 280px" }}>
          <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#aaa" }}>🔍</span>
          <input type="text" placeholder="Buscar por código, nombre, proveedor..." value={busqueda} onChange={e => setBusqueda(e.target.value)}
            style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px 10px 38px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, outline: "none" }}
            onFocus={e => e.target.style.borderColor = "#f97316"} onBlur={e => e.target.style.borderColor = "#e5e7eb"} />
        </div>
        {hasFilters && (
          <>
            <button onClick={resetAll} style={{ padding: "10px 16px", borderRadius: 10, border: "1.5px solid #ef4444", background: "#fef2f2", color: "#ef4444", fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>
              ✕ Limpiar todos los filtros
            </button>
            <span style={{ fontSize: 12, color: "#888" }}>Mostrando <strong style={{ color: "#1a1a2e" }}>{filtered.length}</strong> de {MOCK_PRODUCTS.length}</span>
          </>
        )}
      </div>

      <div style={{ background: "white", borderRadius: 14, border: "1px solid #e5e7eb", overflow: "hidden", boxShadow: "0 1px 6px rgba(0,0,0,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f9fafb", borderBottom: "2px solid #e5e7eb" }}>
              {columns.map(col => (
                <th key={col.key} style={{ padding: "10px 14px", textAlign: "left" }}>
                  <ColFilter label={col.label} values={allValues[col.key]} selected={colFilters[col.key]}
                    onSelect={(v) => setFilter(col.key, v)} onSort={(dir) => setSort(col.key, dir)}
                    activeSort={colSort.col === col.key ? colSort.dir : null} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#9ca3af" }}>😕 No se encontraron productos con esos filtros</td></tr>
            ) : filtered.map((p, i) => {
              const cfg = ALERT_CONFIG[p.alerta];
              return (
                <tr key={p.id} style={{ borderBottom: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#fafafa" }}>
                  <td style={{ padding: "11px 14px", fontFamily: "monospace", fontSize: 12, color: "#6b7280", fontWeight: 600 }}>{p.codigo}</td>
                  <td style={{ padding: "11px 14px", fontWeight: 600, color: "#111827" }}>{p.nombre}</td>
                  <td style={{ padding: "11px 14px", color: "#6b7280" }}>{p.proveedor}</td>
                  <td style={{ padding: "11px 14px", fontWeight: 700, color: p.stock === 0 ? "#ef4444" : "#111827" }}>{p.stock}</td>
                  <td style={{ padding: "11px 14px", color: p.transito > 0 ? "#f97316" : "#d1d5db", fontWeight: p.transito > 0 ? 700 : 400 }}>{p.transito > 0 ? `🚢 ${p.transito}` : "—"}</td>
                  <td style={{ padding: "11px 14px" }}>
                    <span style={{ background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, borderRadius: 20, padding: "3px 10px", fontSize: 12, fontWeight: 700, whiteSpace: "nowrap" }}>
                      {cfg.dot} {cfg.label}
                    </span>
                  </td>
                  <td style={{ padding: "11px 14px", fontWeight: 700, color: p.cantComprar > 0 ? "#059669" : "#d1d5db", textAlign: "right", paddingRight: 20 }}>
                    {p.cantComprar > 0 ? p.cantComprar : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "#bbb" }}>
        Hacé clic en ▾ en cualquier columna para filtrar u ordenar · Saturno Inventario
      </div>
    </div>
  );
}
