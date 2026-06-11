#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extracción de pesos desde packing lists históricos -> Supabase (staging).

USO:
    python extraer_pesos_packing.py "/ruta/a/Importaciones" [--solo-inventario]

Funciona por CONTENIDO, no por nombre de archivo: abre TODOS los Excel/PDF/CSV
legibles, detecta si adentro hay una tabla con columnas de peso (N.W / G.W /
net / gross / 净重 / 毛重) y SOLO de esos extrae las líneas. Catálogos, DUAs,
fletes, etc. quedan afuera solos porque no tienen columnas de peso.

- Recorre la carpeta recursivamente (SOLO LECTURA).
- Matchea contra el catálogo activo de Supabase por MODELO (alta/media) o
  descripción traducida (baja).
- Inserta TODAS las líneas extraídas en pesos_packing_staging (idempotente por
  archivo). NO toca item_pesos.

Credenciales: lee el .env del repo (SUPABASE_SERVICE_ROLE_KEY).
"""

import re
import sys
import json
import math
from pathlib import Path
from collections import Counter

# ── Dependencias externas ──────────────────────────────────────────────────
try:
    import requests
    import pandas as pd
    import pdfplumber
except Exception as e:  # pragma: no cover
    print("Falta una dependencia:", e)
    print("Instalá: pip install pandas openpyxl xlrd pdfplumber requests")
    sys.exit(1)

DEFAULT_URL = "https://xeeieqjqmtoiutfnltqu.supabase.co"
PDF_MAX_PAGES = 80          # tope de páginas por PDF (los catálogos son enormes)
READABLE = {".xlsx", ".xls", ".xlsm", ".csv", ".pdf"}

# ── Proveedores conocidos (substring en ruta o contenido -> nombre canónico) ─
PROVEEDORES = {
    "linyi ansha": "Linyi Ansha", "ansha": "Linyi Ansha",
    "kuhlee": "Kuhlee / Stone Lux", "stone lux": "Kuhlee / Stone Lux", "stonelux": "Kuhlee / Stone Lux",
    "foshan": "Foshan", "barana": "Barana", "shenzhou": "Shenzhou",
    "zhongtong": "Zhongtong", "vicky": "Vicky Linyi", "coco haining": "Coco Haining",
    "tina fung": "Tina Fung Shing", "amazone": "Amazone", "fang fang": "Fang Fang",
    "vento": "Vento", "senco": "Senco", "roma": "Roma",
}

# ── Diccionario mínimo EN->ES para el match por descripción (confianza baja) ─
TRAD = {
    "basin": "lavatorio", "bowl": "bowl", "cabinet": "mueble", "vanity": "mueble",
    "mirror": "espejo", "marble": "marmol", "faucet": "griferia", "mixer": "griferia",
    "sink": "fregadero", "toilet": "inodoro", "shower": "ducha", "tap": "llave",
    "pedestal": "pedestal", "column": "columna", "tile": "azulejo", "door": "puerta",
}

# ── Marcadores de PESO: si el archivo NO contiene ninguno, no es packing list ─
WEIGHT_MARKERS = [
    "n.w", "g.w", "n/w", "g/w", "n.w.", "g.w.",
    "net weight", "gross weight", "net wt", "gross wt", "nett weight",
    "nw(kg", "gw(kg", "peso neto", "peso bruto", "净重", "毛重",
]

# Encabezados de columna (en build_lines). Incluye chino para PL de proveedores CN.
HDR_DESC = ["description", "descripcion", "descripción", "commodity", "product",
            "goods", "name of", "item name", "品名", "名称", "产品"]
HDR_MODEL = ["model", "item no", "item no.", "item code", "art.", "article", "ref",
             "model no", "p/n", "part no", "item#", "no.", "型号", "货号", "item"]
HDR_QTY = ["qty", "quantity", "q'ty", "pcs", "sets", "pieces", "cantidad",
           "unit qty", "数量", "总数"]
HDR_CTN = ["ctn", "ctns", "carton", "cartons", "box", "boxes", "package", "pkgs",
           "cajas", "c/t", "箱数", "件数"]
HDR_NW = ["n.w", "nw", "net weight", "net wt", "net.w", "n/w", "peso neto", "nett", "净重"]
HDR_GW = ["g.w", "gw", "gross weight", "gross wt", "g/w", "peso bruto", "毛重"]


def log(*a):
    print(*a, flush=True)


# ── .env ────────────────────────────────────────────────────────────────────
def load_env():
    here = Path(__file__).resolve()
    for base in [here.parent, *here.parents]:
        envf = base / ".env"
        if envf.exists():
            data = {}
            for line in envf.read_text(encoding="utf-8", errors="ignore").splitlines():
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                data[k.strip()] = v.strip().strip('"').strip("'")
            return data
    return {}


# ── Helpers ───────────────────────────────────────────────────────────────--
def to_num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return None if (isinstance(v, float) and math.isnan(v)) else float(v)
    s = re.sub(r"[^\d.,\-]", "", str(v).strip())
    if not s or s in {"-", ".", ","}:
        return None
    if "," in s and "." in s:
        s = s.replace(",", "")
    elif "," in s:
        s = s.replace(",", "") if re.match(r"^\d{1,3}(,\d{3})+$", s) else s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def norm(s):
    return re.sub(r"[^A-Z0-9]", "", str(s).upper())


def clean_text(s):
    return re.sub(r"\s+", " ", str(s)).strip()


def has_weight_markers(text):
    t = (text or "").lower()
    return any(m in t for m in WEIGHT_MARKERS)


def infer_provider(path: Path, root: Path):
    low = str(path).lower()
    for key, canon in PROVEEDORES.items():
        if key in low:
            return canon
    try:
        parts = path.relative_to(root).parts
        if len(parts) > 1:
            return parts[0]
    except ValueError:
        pass
    return path.parent.name


# ── Detección de encabezado y mapeo de columnas ──────────────────────────────
def col_kind(header_cell):
    h = clean_text(header_cell).lower()
    if not h:
        return None
    is_unit = any(x in h for x in ["/pc", "per pc", "per ", "unit weight", "/set", "u.w", "/ctn", "/箱"])
    if any(x in h for x in HDR_GW):
        return "gw_unit" if is_unit else "gw"
    if any(x in h for x in HDR_NW):
        return "nw_unit" if is_unit else "nw"
    if any(x in h for x in HDR_CTN):
        return "ctn"
    if any(x in h for x in HDR_QTY):
        return "qty"
    if any(x in h for x in HDR_MODEL):
        return "model"
    if any(x in h for x in HDR_DESC):
        return "desc"
    return None


def find_header(rows):
    best = None
    for i, row in enumerate(rows[:25]):
        mapping = {}
        for j, cell in enumerate(row):
            k = col_kind(cell)
            if k and k not in mapping.values():
                mapping[j] = k
        kinds = set(mapping.values())
        has_weight = bool(kinds & {"nw", "gw", "nw_unit", "gw_unit"})
        has_id = bool(kinds & {"model", "desc", "qty"})
        if has_weight and has_id and len(kinds) >= 2:
            if best is None or len(kinds) > best[2]:
                best = (i, mapping, len(kinds))
    return (best[0], best[1]) if best else None


def is_total_row(desc, model):
    blob = (clean_text(desc) + " " + clean_text(model)).lower()
    return bool(re.search(r"\b(total|subtotal|sub total|grand total)\b", blob)) or "合计" in blob or "总计" in blob


def build_lines(rows, header_idx, mapping):
    out = []
    for row in rows[header_idx + 1:]:
        get = lambda kind: next((row[j] for j, k in mapping.items() if k == kind and j < len(row)), None)
        desc, model = get("desc"), get("model")
        qty, ctn = to_num(get("qty")), to_num(get("ctn"))
        nw, gw = to_num(get("nw")), to_num(get("gw"))
        nw_u, gw_u = to_num(get("nw_unit")), to_num(get("gw_unit"))

        if not any([clean_text(desc) if desc else "", clean_text(model) if model else "",
                    qty, ctn, nw, gw, nw_u, gw_u]):
            continue
        if is_total_row(desc, model):
            continue
        if nw is None and nw_u is not None and qty:
            nw = nw_u * qty
        if gw is None and gw_u is not None and qty:
            gw = gw_u * qty
        nw_unit = (nw / qty) if (nw and qty) else nw_u
        gw_unit = (gw / qty) if (gw and qty) else gw_u
        if not any([nw, gw, nw_unit, gw_unit]) and not qty:
            continue

        out.append({
            "descripcion_pl": clean_text(desc) if desc else None,
            "modelo": clean_text(model) if model else None,
            "cantidad": qty, "cajas": ctn,
            "peso_neto_total": round(nw, 4) if nw else None,
            "peso_bruto_total": round(gw, 4) if gw else None,
            "peso_neto_unit": round(nw_unit, 5) if nw_unit else None,
            "peso_bruto_unit": round(gw_unit, 5) if gw_unit else None,
        })
    return out


# ── Procesamiento de un archivo (abre 1 vez; detecta por contenido) ──────────
# Devuelve dict: {status, lines, motivo}
#   status: 'packing' | 'sin_pesos' | 'escaneado' | 'error'
def process_file(path: Path, extract=True):
    ext = path.suffix.lower()
    try:
        if ext in (".xlsx", ".xls", ".xlsm"):
            engine = "xlrd" if ext == ".xls" else None
            sheets = pd.read_excel(path, sheet_name=None, header=None, dtype=str, engine=engine)
            lines, sniff = [], ""
            for _, df in sheets.items():
                rows = df.fillna("").astype(str).values.tolist()
                sniff += " ".join(" ".join(r) for r in rows[:80]) + " "
                if extract:
                    hdr = find_header(rows)
                    if hdr:
                        lines += build_lines(rows, hdr[0], hdr[1])
            if not has_weight_markers(sniff):
                return {"status": "sin_pesos", "lines": [], "motivo": None}
            return {"status": "packing", "lines": lines, "motivo": None}

        if ext == ".csv":
            df = pd.read_csv(path, header=None, dtype=str, sep=None, engine="python", encoding_errors="ignore")
            rows = df.fillna("").astype(str).values.tolist()
            sniff = " ".join(" ".join(r) for r in rows[:80])
            if not has_weight_markers(sniff):
                return {"status": "sin_pesos", "lines": [], "motivo": None}
            hdr = find_header(rows)
            return {"status": "packing", "lines": (build_lines(rows, hdr[0], hdr[1]) if hdr else []), "motivo": None}

        if ext == ".pdf":
            text, tables = "", []
            with pdfplumber.open(path) as pdf:
                pages = pdf.pages[:PDF_MAX_PAGES]
                for page in pages:
                    t = page.extract_text() or ""
                    text += t + " "
                if not text.strip():
                    return {"status": "escaneado", "lines": [], "motivo": "PDF sin texto (escaneado)"}
                if not has_weight_markers(text):
                    return {"status": "sin_pesos", "lines": [], "motivo": None}
                if extract:
                    for page in pages:
                        for table in (page.extract_tables() or []):
                            rows = [[("" if c is None else str(c)) for c in r] for r in table]
                            hdr = find_header(rows)
                            if hdr:
                                tables += build_lines(rows, hdr[0], hdr[1])
            return {"status": "packing", "lines": tables, "motivo": None}

    except Exception as e:
        return {"status": "error", "lines": [], "motivo": str(e)[:200]}
    return {"status": "sin_pesos", "lines": [], "motivo": None}


# ── Catálogo / match ─────────────────────────────────────────────────────────
class Catalogo:
    def __init__(self, productos, pendientes):
        self.productos = productos
        self.pendientes = pendientes

    def match(self, modelo, descripcion, proveedor):
        if modelo:
            m = norm(modelo)
            if len(m) >= 4:
                cands = [(c, it) for (c, it, nn) in self.productos if m in nn]
                if len(cands) == 1:
                    return cands[0][0], "modelo", "alta"
                if len(cands) > 1:
                    toks = set(re.findall(r"[A-Z0-9]{2,}", str(descripcion).upper())) if descripcion else set()
                    toks.discard(m)
                    mejor, score = None, 0
                    for c, it in cands:
                        nn = norm(it)
                        s = sum(1 for t in toks if t in nn)
                        if s > score:
                            mejor, score = c, s
                    return (mejor if mejor else cands[0][0]), "modelo", "media"
        if descripcion:
            d = str(descripcion).lower()
            nouns = [TRAD[w] for w in TRAD if w in d]
            dims = re.findall(r"\d{2,3}\s?cm|\d{2,3}\s?x\s?\d{2,3}|\b\d{2,4}\b", d)
            if nouns:
                exact = []
                for (c, it, nn) in self.productos:
                    itl = it.lower()
                    if any(n in itl for n in nouns):
                        if dims and any(norm(x) in nn for x in dims):
                            exact.append(c)
                if len(exact) == 1:
                    return exact[0], "descripcion", "baja"
        return None, "sin_match", None


def fetch_catalogo(url, key):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def page_all(path, select):
        rows, off, step = [], 0, 1000
        while True:
            r = requests.get(f"{url}/rest/v1/{path}",
                             headers={**headers, "Range-Unit": "items", "Range": f"{off}-{off+step-1}"},
                             params={"select": select}, timeout=60)
            r.raise_for_status()
            batch = r.json()
            rows += batch
            if len(batch) < step:
                break
            off += step
        return rows

    cat = page_all("v_catalogo_activo", "codigo_interno,item")
    pesos = page_all("item_pesos", "codigo_interno,estado")
    productos = [(c["codigo_interno"], c.get("item") or "", norm(c.get("item") or ""))
                 for c in cat if c.get("codigo_interno")]
    pendientes = {p["codigo_interno"] for p in pesos
                  if p.get("estado") in ("Pendiente packing list", "Estimado")}
    return Catalogo(productos, pendientes)


# ── Carga a staging ──────────────────────────────────────────────────────────
def staging_delete_archivos(url, key, archivos):
    h = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "return=minimal"}
    for a in archivos:
        try:
            requests.delete(f"{url}/rest/v1/pesos_packing_staging", headers=h,
                            params={"archivo": f"eq.{a}"}, timeout=60)
        except Exception:
            pass


def staging_insert(url, key, rows):
    h = {"apikey": key, "Authorization": f"Bearer {key}",
         "Content-Type": "application/json", "Prefer": "return=minimal"}
    for i in range(0, len(rows), 500):
        r = requests.post(f"{url}/rest/v1/pesos_packing_staging", headers=h,
                          data=json.dumps(rows[i:i + 500]), timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"Insert falló ({r.status_code}): {r.text[:300]}")


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    raw = sys.argv[1:]
    solo_inv = "--solo-inventario" in raw
    args = [a for a in raw if not a.startswith("--")]
    if not args:
        log('Uso: python extraer_pesos_packing.py "/ruta/a/Importaciones" [--solo-inventario]')
        sys.exit(1)
    root = Path(args[0]).expanduser()
    if not root.exists():
        log(f"No existe la carpeta: {root}")
        sys.exit(1)

    env = load_env()
    url = (env.get("NEXT_PUBLIC_SUPABASE_URL") or DEFAULT_URL).rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key and not solo_inv:
        log("No encontré SUPABASE_SERVICE_ROLE_KEY en el .env del repo. No puedo subir.")
        sys.exit(1)

    # ── Recolectar archivos legibles ──
    todos = [p for p in root.rglob("*") if p.is_file() and not p.name.startswith("~$")]
    legibles = [p for p in todos if p.suffix.lower() in READABLE]
    log("=" * 70)
    log(f"Archivos totales: {len(todos)} · Legibles (xlsx/xls/csv/pdf): {len(legibles)}")
    log("Abriendo cada archivo para detectar tablas con pesos por CONTENIDO…")
    log("(esto tarda: hay que abrir cientos de PDFs/Excels)\n")

    # ── Escaneo por contenido ──
    candidatos = []     # (path, lines)
    por_status = Counter()
    no_proc, errores = [], []
    total = len(legibles)
    for idx, p in enumerate(legibles, 1):
        res = process_file(p, extract=True)
        por_status[res["status"]] += 1
        if res["status"] == "packing":
            candidatos.append((p, res["lines"]))
        elif res["status"] == "escaneado":
            no_proc.append((p, res["motivo"]))
        elif res["status"] == "error":
            errores.append((p, res["motivo"]))
        if idx % 25 == 0 or idx == total:
            log(f"   {idx}/{total} escaneados · {len(candidatos)} con pesos detectados")

    # ── Inventario de packing lists detectados ──
    log("\n" + "=" * 70)
    log("INVENTARIO — archivos que SÍ contienen tablas de peso")
    log("=" * 70)
    log(f"Con pesos (packing list)  : {por_status.get('packing', 0)}")
    log(f"Sin columnas de peso      : {por_status.get('sin_pesos', 0)}")
    log(f"PDF escaneados (sin texto): {por_status.get('escaneado', 0)}")
    log(f"Errores de lectura        : {por_status.get('error', 0)}")

    por_prov = Counter(infer_provider(p, root) for p, _ in candidatos)
    log("\nPacking lists detectados por proveedor:")
    for prov, n in por_prov.most_common():
        log(f"   - {prov}: {n}")
    log("\nArchivos detectados con pesos:")
    for p, lines in candidatos[:80]:
        log(f"   [{len(lines):3d} líneas] {infer_provider(p, root)} :: {p.name}")
    if len(candidatos) > 80:
        log(f"   … y {len(candidatos) - 80} más")

    if solo_inv:
        log("\n(--solo-inventario) No se extrajo ni subió nada. Volvé a correr sin la bandera para procesar.")
        return

    # ── Armar líneas + match ──
    todas = []
    for p, lines in candidatos:
        prov = infer_provider(p, root)
        for ln in lines:
            ln["archivo"] = str(p)
            ln["proveedor"] = prov
            todas.append(ln)
    log(f"\nLíneas extraídas en total: {len(todas)}")

    log("\nBajando catálogo de Supabase para el match…")
    cat = fetch_catalogo(url, key)
    log(f"Catálogo activo: {len(cat.productos)} productos · Pendientes/Estimado: {len(cat.pendientes)}")

    conf = Counter()
    cubiertos = set()
    for ln in todas:
        codigo, metodo, c = cat.match(ln.get("modelo"), ln.get("descripcion_pl"), ln.get("proveedor"))
        ln["codigo_interno"], ln["metodo_match"], ln["confianza"] = codigo, metodo, c
        conf[c or "sin_match"] += 1
        if codigo and c in ("alta", "media") and codigo in cat.pendientes:
            cubiertos.add(codigo)

    # ── Carga a staging ──
    log("\nSubiendo a pesos_packing_staging…")
    archivos_proc = sorted({ln["archivo"] for ln in todas})
    staging_delete_archivos(url, key, archivos_proc)
    cols = ["archivo", "proveedor", "descripcion_pl", "modelo", "cantidad", "cajas",
            "peso_neto_total", "peso_bruto_total", "peso_neto_unit", "peso_bruto_unit",
            "codigo_interno", "metodo_match", "confianza"]
    payload = [{k: ln.get(k) for k in cols} for ln in todas]
    if payload:
        staging_insert(url, key, payload)

    # ── Reporte ──
    log("\n" + "=" * 70)
    log("REPORTE FINAL")
    log("=" * 70)
    log(f"Archivos legibles escaneados : {total}")
    log(f"Packing lists con pesos      : {len(candidatos)}")
    log(f"PDF escaneados (no-procesable): {len(no_proc)}")
    log(f"Errores de lectura           : {len(errores)}")
    log(f"Líneas extraídas/insertadas  : {len(payload)}")
    log(f"  · confianza alta           : {conf.get('alta', 0)}")
    log(f"  · confianza media          : {conf.get('media', 0)}")
    log(f"  · confianza baja           : {conf.get('baja', 0)}")
    log(f"  · sin match                : {conf.get('sin_match', 0)}")
    log(f"Pendientes/Estimado cubiertos (alta/media): {len(cubiertos)} de {len(cat.pendientes)}")
    if errores:
        log("\nErrores:")
        for p, m in errores[:30]:
            log(f"   - {p.name} :: {m}")
    log("\nListo. Nada se tocó en item_pesos. Revisá pesos_packing_staging.")


if __name__ == "__main__":
    main()
