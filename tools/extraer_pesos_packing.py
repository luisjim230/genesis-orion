#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Extracción de pesos desde packing lists históricos -> Supabase (staging).

USO:
    python extraer_pesos_packing.py "/ruta/a/Importaciones" [--solo-inventario]

- Recorre la carpeta recursivamente (SOLO LECTURA).
- Clasifica archivos (packing list / factura / costeo / otro).
- Extrae líneas de los packing lists (.xlsx/.xls/.csv/.pdf).
- Matchea contra el catálogo activo de Supabase por MODELO.
- Inserta TODAS las líneas en pesos_packing_staging (también las sin match).
- NO toca item_pesos.

Credenciales: lee el .env del repo (SUPABASE_SERVICE_ROLE_KEY).
"""

import os
import re
import sys
import json
import math
import urllib.parse
from pathlib import Path
from collections import defaultdict, Counter

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

# ── Proveedores conocidos (substring en ruta o contenido -> nombre canónico) ─
PROVEEDORES = {
    "linyi ansha": "Linyi Ansha",
    "ansha": "Linyi Ansha",
    "kuhlee": "Kuhlee / Stone Lux",
    "stone lux": "Kuhlee / Stone Lux",
    "stonelux": "Kuhlee / Stone Lux",
    "foshan": "Foshan",
    "barana": "Barana",
    "shenzhou": "Shenzhou",
}

# ── Diccionario mínimo EN->ES para el match por descripción (confianza baja) ─
TRAD = {
    "basin": "lavatorio", "bowl": "bowl", "cabinet": "mueble", "vanity": "mueble",
    "mirror": "espejo", "marble": "marmol", "faucet": "griferia", "mixer": "griferia",
    "sink": "fregadero", "toilet": "inodoro", "shower": "ducha", "tap": "llave",
    "pedestal": "pedestal", "column": "columna", "tile": "azulejo",
}

# Palabras clave para clasificar e identificar columnas
KW_PACKING = ["packing", "p/l", "pl-", "n.w", "g.w", "ctns", "ctn", "gross weight",
              "net weight", "q'ty", "qty"]
KW_FACTURA = ["invoice", "commercial invoice", "factura", "ci-", "inv-", "proforma invoice"]
KW_COSTEO = ["costeo", "costing", "cost", "dai", "cif", "fob", "póliza", "poliza", "liquidacion", "liquidación"]

HDR_DESC = ["description", "descripcion", "descripción", "commodity", "product", "goods", "name of", "item name"]
HDR_MODEL = ["model", "item no", "item no.", "item code", "art", "article", "ref", "model no", "p/n", "part no", "item#", "no."]
HDR_QTY = ["qty", "quantity", "q'ty", "pcs", "sets", "pieces", "cantidad", "unit qty"]
HDR_CTN = ["ctn", "ctns", "carton", "cartons", "box", "boxes", "package", "pkgs", "cajas", "c/t"]
HDR_NW = ["n.w", "nw", "net weight", "net wt", "net.w", "n/w", "peso neto", "net"]
HDR_GW = ["g.w", "gw", "gross weight", "gross wt", "g/w", "peso bruto", "gross"]


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


# ── Helpers numéricos ────────────────────────────────────────────────────────
def to_num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        if isinstance(v, float) and math.isnan(v):
            return None
        return float(v)
    s = str(v).strip()
    if not s:
        return None
    s = re.sub(r"[^\d.,\-]", "", s)
    if not s or s in {"-", ".", ","}:
        return None
    if "," in s and "." in s:
        # la coma es separador de miles
        s = s.replace(",", "")
    elif "," in s:
        # una sola coma: si parece decimal (<=2 decimales) la convierto, si no, miles
        if re.match(r"^\d{1,3}(,\d{3})+$", s):
            s = s.replace(",", "")
        else:
            s = s.replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return None


def norm(s):
    """Mayúsculas, solo alfanumérico (para comparar modelos contra nombres)."""
    return re.sub(r"[^A-Z0-9]", "", str(s).upper())


def clean_text(s):
    return re.sub(r"\s+", " ", str(s)).strip()


# ── Clasificación e inferencia de proveedor ──────────────────────────────────
def infer_provider(path: Path, importaciones_root: Path):
    low = str(path).lower()
    for key, canon in PROVEEDORES.items():
        if key in low:
            return canon
    # Fallback: primera subcarpeta debajo de Importaciones
    try:
        rel = path.relative_to(importaciones_root)
        parts = rel.parts
        if len(parts) > 1:
            return parts[0]
    except ValueError:
        pass
    return path.parent.name


def classify(path: Path):
    name = path.name.lower()
    ext = path.suffix.lower()
    if ext not in {".xlsx", ".xls", ".xlsm", ".csv", ".pdf"}:
        return "otro"
    if any(k in name for k in ["packing", "p_l", "pl_", "p-l", "pl-", " pl", "packinglist"]):
        return "packing"
    if any(k in name for k in KW_FACTURA):
        return "factura"
    if any(k in name for k in KW_COSTEO):
        return "costeo"
    return "indef"  # se decide al abrir (puede ser packing por contenido)


# ── Detección de fila de encabezado y mapeo de columnas ──────────────────────
def col_kind(header_cell):
    h = clean_text(header_cell).lower()
    if not h:
        return None
    is_unit = any(x in h for x in ["/pc", "per pc", "per ", "unit weight", "/set", "u.w", "/ctn"])
    if any(x in h for x in HDR_GW):
        return ("gw_unit" if is_unit else "gw")
    if any(x in h for x in HDR_NW):
        return ("nw_unit" if is_unit else "nw")
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
    """rows: lista de listas (strings). Devuelve (idx, mapping col->kind) o None."""
    best = None
    for i, row in enumerate(rows[:25]):
        mapping = {}
        for j, cell in enumerate(row):
            k = col_kind(cell)
            if k and k not in mapping.values():
                mapping[j] = k
        kinds = set(mapping.values())
        score = len(kinds)
        # necesitamos al menos peso + (qty o model o desc)
        has_weight = bool(kinds & {"nw", "gw", "nw_unit", "gw_unit"})
        has_id = bool(kinds & {"model", "desc", "qty"})
        if has_weight and has_id and score >= 2:
            if best is None or score > best[2]:
                best = (i, mapping, score)
    if best:
        return best[0], best[1]
    return None


def is_total_row(desc, model):
    blob = (clean_text(desc) + " " + clean_text(model)).lower()
    return bool(re.search(r"\b(total|subtotal|sub total|grand total|合计|总计)\b", blob))


def build_lines(rows, header_idx, mapping):
    """Devuelve lista de dicts de línea cruda."""
    out = []
    for row in rows[header_idx + 1:]:
        get = lambda kind: next((row[j] for j, k in mapping.items() if k == kind and j < len(row)), None)
        desc = get("desc")
        model = get("model")
        qty = to_num(get("qty"))
        ctn = to_num(get("ctn"))
        nw = to_num(get("nw"))
        gw = to_num(get("gw"))
        nw_u = to_num(get("nw_unit"))
        gw_u = to_num(get("gw_unit"))

        # fila vacía
        if not any([clean_text(desc) if desc else "", clean_text(model) if model else "",
                    qty, ctn, nw, gw, nw_u, gw_u]):
            continue
        if is_total_row(desc, model):
            continue

        # Resolver totales vs unitarios
        if nw is None and nw_u is not None and qty:
            nw = nw_u * qty
        if gw is None and gw_u is not None and qty:
            gw = gw_u * qty
        nw_unit = (nw / qty) if (nw and qty) else nw_u
        gw_unit = (gw / qty) if (gw and qty) else gw_u

        # descartar si no hay nada útil (ni peso ni cantidad)
        if not any([nw, gw, nw_unit, gw_unit]) and not qty:
            continue

        out.append({
            "descripcion_pl": clean_text(desc) if desc else None,
            "modelo": clean_text(model) if model else None,
            "cantidad": qty,
            "cajas": ctn,
            "peso_neto_total": round(nw, 4) if nw else None,
            "peso_bruto_total": round(gw, 4) if gw else None,
            "peso_neto_unit": round(nw_unit, 5) if nw_unit else None,
            "peso_bruto_unit": round(gw_unit, 5) if gw_unit else None,
        })
    return out


# ── Lectores por tipo de archivo ─────────────────────────────────────────────
def read_excel(path: Path):
    out_lines, sniff = [], ""
    try:
        engine = "xlrd" if path.suffix.lower() == ".xls" else None
        xls = pd.read_excel(path, sheet_name=None, header=None, dtype=str, engine=engine)
    except Exception as e:
        return None, f"excel ilegible: {e}"
    for _, df in xls.items():
        rows = df.fillna("").astype(str).values.tolist()
        sniff += " ".join(" ".join(r) for r in rows[:30]).lower()
        hdr = find_header(rows)
        if hdr:
            out_lines += build_lines(rows, hdr[0], hdr[1])
    return out_lines, sniff


def read_csv(path: Path):
    try:
        df = pd.read_csv(path, header=None, dtype=str, sep=None, engine="python", encoding_errors="ignore")
    except Exception as e:
        return None, f"csv ilegible: {e}"
    rows = df.fillna("").astype(str).values.tolist()
    sniff = " ".join(" ".join(r) for r in rows[:30]).lower()
    hdr = find_header(rows)
    return (build_lines(rows, hdr[0], hdr[1]) if hdr else []), sniff


def read_pdf(path: Path):
    out_lines, sniff, hubo_texto = [], "", False
    try:
        with pdfplumber.open(path) as pdf:
            for page in pdf.pages:
                txt = page.extract_text() or ""
                if txt.strip():
                    hubo_texto = True
                    sniff += txt.lower() + " "
                for table in (page.extract_tables() or []):
                    rows = [[("" if c is None else str(c)) for c in r] for r in table]
                    hdr = find_header(rows)
                    if hdr:
                        out_lines += build_lines(rows, hdr[0], hdr[1])
    except Exception as e:
        return None, f"pdf ilegible: {e}", False
    if not hubo_texto:
        return None, "pdf escaneado (sin texto)", False
    return out_lines, sniff, True


# ── Catálogo / match ─────────────────────────────────────────────────────────
class Catalogo:
    def __init__(self, productos, pendientes):
        self.productos = productos  # list de (codigo, item, norm_name)
        self.pendientes = pendientes  # set de codigos en estado Pendiente/Estimado

    def match(self, modelo, descripcion, proveedor):
        # 1) por modelo
        if modelo:
            m = norm(modelo)
            if len(m) >= 4:
                cands = [(c, it) for (c, it, nn) in self.productos if m in nn]
                if len(cands) == 1:
                    return cands[0][0], "modelo", "alta"
                if len(cands) > 1:
                    # desambiguar por tokens (dimensiones/color) de la descripción
                    desc_tokens = set(re.findall(r"[A-Z0-9]{2,}", str(descripcion).upper())) if descripcion else set()
                    desc_tokens.discard(m)
                    mejor, mejor_score = None, 0
                    for c, it in cands:
                        nn = norm(it)
                        score = sum(1 for t in desc_tokens if t in nn)
                        if score > mejor_score:
                            mejor, mejor_score = c, score
                    if mejor and mejor_score > 0:
                        return mejor, "modelo", "media"
                    return cands[0][0], "modelo", "media"
        # 2) por descripción traducida + proveedor (confianza baja)
        if descripcion:
            d = str(descripcion).lower()
            nouns = [TRAD[w] for w in TRAD if w in d]
            dims = re.findall(r"\d{2,3}\s?cm|\d{2,3}\s?x\s?\d{2,3}|\b\d{2,4}\b", d)
            if nouns:
                cands = []
                for (c, it, nn) in self.productos:
                    itl = it.lower()
                    if any(n in itl for n in nouns):
                        dim_ok = any(norm(x) in nn for x in dims) if dims else False
                        cands.append((c, dim_ok))
                exact = [c for c, ok in cands if ok]
                if len(exact) == 1:
                    return exact[0], "descripcion", "baja"
        return None, "sin_match", None


def fetch_catalogo(url, key):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    def page_all(path, select):
        rows, offset, step = [], 0, 1000
        while True:
            r = requests.get(f"{url}/rest/v1/{path}",
                             headers={**headers, "Range-Unit": "items",
                                      "Range": f"{offset}-{offset+step-1}"},
                             params={"select": select}, timeout=60)
            r.raise_for_status()
            batch = r.json()
            rows += batch
            if len(batch) < step:
                break
            offset += step
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
    headers = {"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "return=minimal"}
    for a in archivos:
        try:
            requests.delete(f"{url}/rest/v1/pesos_packing_staging",
                            headers=headers, params={"archivo": f"eq.{a}"}, timeout=60)
        except Exception:
            pass


def staging_insert(url, key, rows):
    headers = {"apikey": key, "Authorization": f"Bearer {key}",
               "Content-Type": "application/json", "Prefer": "return=minimal"}
    for i in range(0, len(rows), 500):
        chunk = rows[i:i + 500]
        r = requests.post(f"{url}/rest/v1/pesos_packing_staging",
                          headers=headers, data=json.dumps(chunk), timeout=120)
        if r.status_code >= 300:
            raise RuntimeError(f"Insert falló ({r.status_code}): {r.text[:300]}")


# ── Main ─────────────────────────────────────────────────────────────────────
def main():
    args = [a for a in sys.argv[1:]]
    solo_inv = "--solo-inventario" in args
    args = [a for a in args if not a.startswith("--")]
    if not args:
        log("Uso: python extraer_pesos_packing.py \"/ruta/a/Importaciones\" [--solo-inventario]")
        sys.exit(1)
    root = Path(args[0]).expanduser()
    if not root.exists():
        log(f"No existe la carpeta: {root}")
        sys.exit(1)

    env = load_env()
    url = (env.get("NEXT_PUBLIC_SUPABASE_URL") or DEFAULT_URL).rstrip("/")
    key = env.get("SUPABASE_SERVICE_ROLE_KEY")
    if not key and not solo_inv:
        log("No encontré SUPABASE_SERVICE_ROLE_KEY en el .env del repo. No puedo subir a Supabase.")
        sys.exit(1)

    # ── 1) INVENTARIO ──
    log("=" * 70)
    log("PASO 1 · INVENTARIO")
    log("=" * 70)
    archivos = [p for p in root.rglob("*") if p.is_file() and not p.name.startswith("~$")]
    inventario = []
    por_tipo = Counter()
    por_prov = Counter()
    for p in archivos:
        tipo = classify(p)
        if tipo == "otro":
            por_tipo["otro"] += 1
            continue
        prov = infer_provider(p, root)
        inventario.append((p, tipo, prov))
        por_tipo[tipo] += 1
        por_prov[prov] += 1

    log(f"Archivos totales en la carpeta: {len(archivos)}")
    log("Por tipo (candidatos a procesar):")
    for t, n in por_tipo.most_common():
        log(f"   - {t:10s}: {n}")
    log("Por proveedor inferido:")
    for prov, n in por_prov.most_common():
        log(f"   - {prov}: {n}")

    candidatos = [x for x in inventario if x[1] in ("packing", "indef")]
    log(f"\nArchivos que se intentarán parsear como packing list: {len(candidatos)}")
    for p, t, prov in candidatos[:60]:
        log(f"   [{t:7s}] {prov} :: {p.name}")
    if len(candidatos) > 60:
        log(f"   … y {len(candidatos) - 60} más")

    if solo_inv:
        log("\n(--solo-inventario) No se procesa ni se sube nada.")
        return

    # ── 2) EXTRACCIÓN ──
    log("\n" + "=" * 70)
    log("PASO 2 · EXTRACCIÓN")
    log("=" * 70)
    todas = []           # filas para staging
    procesados, fallidos, no_procesables = [], [], []
    total = len(candidatos)
    for idx, (p, tipo, prov) in enumerate(candidatos, 1):
        ext = p.suffix.lower()
        try:
            if ext in (".xlsx", ".xls", ".xlsm"):
                lines, sniff = read_excel(p)
            elif ext == ".csv":
                lines, sniff = read_csv(p)
            elif ext == ".pdf":
                lines, sniff, _ = read_pdf(p)
            else:
                continue
        except Exception as e:
            fallidos.append((p, str(e)))
            continue

        if lines is None:
            no_procesables.append((p, sniff))
            continue

        # Si era 'indef', confirmamos que parece packing list por contenido
        if tipo == "indef":
            es_pl = any(k in (sniff or "") for k in ["n.w", "g.w", "net weight", "gross weight", "ctns", "packing"])
            if not es_pl or not lines:
                continue

        for ln in lines:
            ln["archivo"] = str(p)
            ln["proveedor"] = prov
            todas.append(ln)
        procesados.append(p)
        if idx % 10 == 0 or idx == total:
            log(f"   {idx}/{total} archivos · {len(todas)} líneas extraídas")

    log(f"\nProcesados OK: {len(procesados)} · No procesables: {len(no_procesables)} · Fallidos: {len(fallidos)}")
    log(f"Líneas extraídas: {len(todas)}")

    # ── 3) MATCH ──
    log("\n" + "=" * 70)
    log("PASO 3 · MATCH CONTRA CATÁLOGO")
    log("=" * 70)
    cat = fetch_catalogo(url, key)
    log(f"Catálogo activo: {len(cat.productos)} productos · Pendientes/Estimado: {len(cat.pendientes)}")

    conf_count = Counter()
    cubiertos = set()
    for ln in todas:
        codigo, metodo, conf = cat.match(ln.get("modelo"), ln.get("descripcion_pl"), ln.get("proveedor"))
        ln["codigo_interno"] = codigo
        ln["metodo_match"] = metodo
        ln["confianza"] = conf
        conf_count[conf or "sin_match"] += 1
        if codigo and conf in ("alta", "media") and codigo in cat.pendientes:
            cubiertos.add(codigo)

    log("Matches por confianza:")
    for c in ["alta", "media", "baja", "sin_match"]:
        log(f"   - {c:9s}: {conf_count.get(c, 0)}")

    # ── 4) CARGA ──
    log("\n" + "=" * 70)
    log("PASO 4 · CARGA A pesos_packing_staging")
    log("=" * 70)
    archivos_proc = sorted({ln["archivo"] for ln in todas})
    log(f"Limpiando staging previo de {len(archivos_proc)} archivos (re-run idempotente)…")
    staging_delete_archivos(url, key, archivos_proc)
    cols = ["archivo", "proveedor", "descripcion_pl", "modelo", "cantidad", "cajas",
            "peso_neto_total", "peso_bruto_total", "peso_neto_unit", "peso_bruto_unit",
            "codigo_interno", "metodo_match", "confianza"]
    payload = [{k: ln.get(k) for k in cols} for ln in todas]
    if payload:
        staging_insert(url, key, payload)
    log(f"Insertadas {len(payload)} líneas en staging.")

    # ── 5) REPORTE ──
    log("\n" + "=" * 70)
    log("REPORTE FINAL")
    log("=" * 70)
    log(f"Archivos candidatos          : {total}")
    log(f"Procesados OK                : {len(procesados)}")
    log(f"No procesables (escaneados…) : {len(no_procesables)}")
    log(f"Fallidos (error de lectura)  : {len(fallidos)}")
    log(f"Líneas extraídas/insertadas  : {len(payload)}")
    log(f"  · confianza alta           : {conf_count.get('alta', 0)}")
    log(f"  · confianza media          : {conf_count.get('media', 0)}")
    log(f"  · confianza baja           : {conf_count.get('baja', 0)}")
    log(f"  · sin match                : {conf_count.get('sin_match', 0)}")
    log(f"Pendientes/Estimado cubiertos por match alta/media: {len(cubiertos)} de {len(cat.pendientes)}")
    if no_procesables:
        log("\nNo procesables:")
        for p, motivo in no_procesables[:40]:
            log(f"   - {p.name} :: {motivo}")
    if fallidos:
        log("\nFallidos:")
        for p, motivo in fallidos[:40]:
            log(f"   - {p.name} :: {motivo}")
    log("\nListo. Nada se tocó en item_pesos. Revisá pesos_packing_staging.")


if __name__ == "__main__":
    main()
