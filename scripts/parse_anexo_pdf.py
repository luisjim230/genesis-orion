#!/usr/bin/env python3
"""
parse_anexo_pdf.py

Parsea el PDF del Anexo 2 del TLC China-CR y extrae todas las partidas
arancelables (8-10 dígitos) a un JSON con la estructura esperada por
scripts/seed-tlc-partidas.mjs.

Las descripciones se enriquecen con el contexto jerárquico del Sistema
Armonizado (capítulo → partida → subpartida → ítem) para que la búsqueda
por texto encuentre términos relevantes.

Uso:  python3 scripts/parse_anexo_pdf.py
Input:  data/anexo-02-cr-china.pdf
Output: data/tlc-china-cr-partidas.json
"""

import fitz
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

PDF_PATH = Path("data/anexo-02-cr-china.pdf")
OUT_PATH = Path("data/tlc-china-cr-partidas.json")

SKIP_LINES = {
    "Código arancelario",
    "Descripción",
    "Arancel base",
    "Categoría de desgravación",
    "Lista de la República de Costa Rica",
}
SKIP_PREFIXES = (
    "Código",
    "Arancel",
    "Categoría",
    "Lista de",
)

RE_CODIGO_FULL = re.compile(r"^\d{8}$|^\d{10}$")
RE_CODIGO_PART = re.compile(r"^\d{2,7}$")
RE_ARANCEL = re.compile(r"^(\d+(?:[.,]\d+)?)\s*%?$")
RE_CATEGORIA = re.compile(r"^(A|B|C|D|E|F)$")


def extract_lines(pdf_path: Path):
    doc = fitz.open(pdf_path)
    all_lines = []
    for page in doc:
        for ln in page.get_text().splitlines():
            s = ln.strip()
            if not s:
                continue
            if s in SKIP_LINES:
                continue
            if any(s.startswith(p) and len(s) < 50 for p in SKIP_PREFIXES):
                continue
            all_lines.append(s)
    return all_lines


def collect_desc(lines, start, stop_pred):
    """Acumula líneas como descripción hasta que stop_pred(linea) sea True.
    Devuelve (descripcion, indice_de_parada)."""
    parts = []
    j = start
    while j < len(lines):
        t = lines[j]
        if stop_pred(t):
            break
        parts.append(t)
        j += 1
    desc = " ".join(parts).strip()
    desc = re.sub(r"\s+", " ", desc)
    desc = re.sub(r"^[-\s]+", "", desc)  # quitar guiones de prefijo
    return desc, j


def is_code_or_keyword(t):
    return bool(RE_CODIGO_FULL.match(t)
                or RE_CODIGO_PART.match(t)
                or RE_ARANCEL.match(t)
                or t.upper() == "MFN"
                or RE_CATEGORIA.match(t))


def parse(lines):
    """
    Mantiene un stack de contextos jerárquicos para enriquecer descripciones.
    Cada partida arancelable termina como:
       <descripción ítem> · <subpartida(s)> · <partida 4 dígitos> · <capítulo>
    """
    out = []
    contexto = {}  # nivel (longitud código) → descripción
    i = 0
    n = len(lines)

    while i < n:
        s = lines[i]

        # Código (cualquier longitud)
        if RE_CODIGO_FULL.match(s) or RE_CODIGO_PART.match(s):
            codigo = s
            largo = len(codigo)
            desc, idx = collect_desc(lines, i + 1, is_code_or_keyword)

            if largo in (8, 10):
                # Partida arancelable: ahora viene arancel + categoría
                arancel_raw = lines[idx] if idx < n else ""
                categoria_raw = lines[idx + 1] if idx + 1 < n else ""

                if (RE_ARANCEL.match(arancel_raw) or arancel_raw.upper() == "MFN") \
                        and RE_CATEGORIA.match(categoria_raw):
                    if arancel_raw.upper() == "MFN":
                        categoria_final = f"MFN {categoria_raw}"
                        arancel_final = "n/a"
                    else:
                        categoria_final = categoria_raw
                        arancel_final = arancel_raw.replace(",", ".").rstrip("%").strip()

                    # Construir descripción enriquecida
                    partes = []
                    if desc:
                        partes.append(desc)
                    # Agregar contextos en orden ascendente de generalidad:
                    # subpartidas (6-7 dígitos), partida (4), capítulo (2)
                    for nivel in sorted(contexto.keys(), reverse=True):
                        if nivel < largo and contexto[nivel]:
                            partes.append(contexto[nivel])
                    desc_full = " · ".join(partes)

                    out.append({
                        "codigo": codigo,
                        "descripcion": desc_full,
                        "arancel_base": arancel_final,
                        "categoria": categoria_final,
                    })
                    i = idx + 2
                    continue
                else:
                    # No se pudo parsear, saltar
                    i = idx
                    continue
            else:
                # Es header (capítulo / partida / subpartida)
                # Guardar en contexto y limpiar contextos más específicos
                contexto[largo] = desc
                # Limpiar niveles más profundos
                for k in list(contexto.keys()):
                    if k > largo:
                        del contexto[k]
                i = idx
                continue
        i += 1
    return out


def main():
    if not PDF_PATH.exists():
        print(f"❌ No existe {PDF_PATH}", file=sys.stderr)
        sys.exit(1)

    print(f"📥 Leyendo {PDF_PATH}…")
    lines = extract_lines(PDF_PATH)
    print(f"   {len(lines):,} líneas extraídas")

    print("🔍 Parseando partidas con contexto jerárquico…")
    partidas = parse(lines)
    print(f"   {len(partidas):,} partidas encontradas")

    cnt = Counter(p["categoria"] for p in partidas)
    print("\n   Por categoría:")
    for cat, c in cnt.most_common():
        print(f"     {cat:<8} {c}")

    sin_desc = sum(1 for p in partidas if not p["descripcion"])
    print(f"\n   Sin descripción: {sin_desc}")

    dups = defaultdict(int)
    for p in partidas:
        dups[p["codigo"]] += 1
    duplicados = {k: v for k, v in dups.items() if v > 1}
    print(f"   Códigos duplicados: {len(duplicados)}")

    # Dedupe
    seen = set()
    deduped = []
    for p in partidas:
        if p["codigo"] not in seen:
            deduped.append(p)
            seen.add(p["codigo"])
    print(f"\n   Tras deduplicar: {len(deduped):,} partidas únicas")

    OUT_PATH.write_text(json.dumps(deduped, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n✅ Guardado en {OUT_PATH}")
    print(f"   Tamaño: {OUT_PATH.stat().st_size / 1024:.1f} KB")

    print("\n📋 Muestras (con contexto enriquecido):")
    for codigo_buscar in ["01011010", "39172310", "69101000", "76101000", "84151000"]:
        for p in deduped:
            if p["codigo"] == codigo_buscar:
                print(f"\n   {p['codigo']} [{p['categoria']}, base={p['arancel_base']}]")
                print(f"   {p['descripcion'][:200]}")
                break

    print("\n📋 Primeras 3 partidas:")
    for p in deduped[:3]:
        print(f"   {p['codigo']}  cat={p['categoria']}  base={p['arancel_base']}")
        print(f"   {p['descripcion'][:150]}")


if __name__ == "__main__":
    main()
