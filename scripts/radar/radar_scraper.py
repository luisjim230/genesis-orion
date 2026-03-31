"""
radar_scraper.py — Scraper de inteligencia de mercado para RADAR.

Fuentes:
  1. Google Trends (pytrends) — interés por keyword/región
  2. MercadoLibre API pública — productos, precios, vendidos

Cruza datos externos con inventario interno en Supabase.
Genera evaluaciones con score combinado.

Corre en GitHub Actions: lunes 9am + jueves 2pm hora CR.
También se puede disparar manualmente desde SOL via workflow_dispatch.
"""

import os, sys, json, time, logging
from datetime import datetime, date, timedelta
from typing import Optional

import requests
from pytrends.request import TrendReq

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("radar")

# ── Config ──────────────────────────────────────────────────────────────

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]  # service_role para insert

HEADERS_SUPA = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

KEYWORDS_RADAR = {
    "pisos": [
        "piso SPC", "piso vinílico", "piso laminado", "piso flotante",
        "porcelanato", "cerámica para piso", "piso de madera"
    ],
    "paredes_revestimiento": [
        "panel WPC", "panel de pared", "láminas PVC pared",
        "fachaleta flexible", "piedra flexible exterior",
        "revestimiento exterior casa", "láminas WPC"
    ],
    "bano": [
        "loza sanitaria", "losa sanitaria negra", "mueble de baño",
        "lavatorio empotrado", "grifería baño", "mampara de baño",
        "ducha de vidrio", "sanitario color"
    ],
    "ventanas_puertas": [
        "ventana UPVC", "ventana PVC", "ventana de aluminio",
        "puerta PVC", "puerta corrediza"
    ],
    "iluminacion": [
        "perfil LED", "tira LED", "iluminación LED cocina",
        "perfil aluminio LED"
    ],
    "cielos_techos": [
        "cielo raso PVC", "cielo desmontable", "techo UPVC"
    ],
    "remodelacion_general": [
        "remodelación fácil", "remodelación baño", "remodelación sala",
        "acabados de construcción", "materiales de construcción baratos",
        "herramienta para remodelación"
    ],
    "griferia_accesorios": [
        "grifería cocina", "grifería negra", "grifería dorada",
        "fregadero acero inox", "lavaplatos empotrado"
    ]
}

REGIONES = ["CR", "GT", "MX", "US"]

# Mapeo de código de región a geo de Google Trends
GEO_MAP = {"CR": "CR", "GT": "GT", "MX": "MX", "US": "US"}

# Mapeo de región a site de MercadoLibre
ML_SITE_MAP = {"CR": "MCR", "GT": "MGT", "MX": "MLM", "US": None}


# ── Helpers Supabase ────────────────────────────────────────────────────

def supa_post(table: str, rows: list) -> int:
    """Inserta filas en Supabase. Retorna cantidad insertada."""
    if not rows:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    r = requests.post(url, headers=HEADERS_SUPA, json=rows)
    if r.status_code not in (200, 201):
        log.error(f"Error insertando en {table}: {r.status_code} {r.text[:300]}")
        return 0
    return len(rows)


def supa_get(table: str, params: dict) -> list:
    """Query GET a Supabase."""
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**HEADERS_SUPA, "Prefer": ""}
    r = requests.get(url, headers=headers, params=params)
    if r.status_code == 200:
        return r.json()
    return []


def guardar_log(fuente: str, estado: str, registros: int, mensaje: str, duracion: float):
    supa_post("radar_logs", [{
        "fuente": fuente,
        "estado": estado,
        "registros_guardados": registros,
        "mensaje": mensaje[:500] if mensaje else None,
        "duracion_segundos": round(duracion, 1),
    }])


# ── 1. Google Trends ───────────────────────────────────────────────────

def scrape_google_trends():
    log.info("━━ Google Trends ━━")
    t0 = time.time()
    total = 0
    errores = []

    try:
        pytrends = TrendReq(hl="es", tz=360)
    except Exception as e:
        guardar_log("google_trends", "error", 0, str(e), time.time() - t0)
        return

    all_keywords = []
    for cat, kws in KEYWORDS_RADAR.items():
        for kw in kws:
            all_keywords.append((cat, kw))

    for region in REGIONES:
        geo = GEO_MAP[region]
        # Procesar en lotes de 5 (límite de pytrends)
        for i in range(0, len(all_keywords), 5):
            batch = all_keywords[i:i+5]
            kw_list = [kw for _, kw in batch]
            try:
                pytrends.build_payload(kw_list, cat=0, timeframe="today 3-m", geo=geo)
                df = pytrends.interest_over_time()
                if df.empty:
                    continue

                rows = []
                for _, kw in batch:
                    if kw not in df.columns:
                        continue
                    for idx, row in df.iterrows():
                        rows.append({
                            "keyword": kw,
                            "categoria": dict(batch)[kw] if kw in dict(batch) else batch[0][0],
                            "region": region,
                            "interes": int(row[kw]),
                            "fecha_dato": idx.strftime("%Y-%m-%d"),
                        })

                # Buscar categoría correcta
                cat_map = {kw: cat for cat, kw in batch}
                for r in rows:
                    r["categoria"] = cat_map.get(r["keyword"], r["categoria"])

                inserted = supa_post("radar_tendencias", rows)
                total += inserted
                log.info(f"  {region} batch {i//5+1}: {inserted} registros")

            except Exception as e:
                errores.append(f"{region}/{kw_list[0]}: {e}")
                log.warning(f"  Error en batch {region}: {e}")

            time.sleep(2)  # Rate limiting

    duracion = time.time() - t0
    estado = "ok" if not errores else "parcial"
    guardar_log("google_trends", estado, total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  Trends terminado: {total} registros en {duracion:.0f}s")


# ── 2. MercadoLibre ───────────────────────────────────────────────────

def scrape_mercadolibre():
    log.info("━━ MercadoLibre ━━")
    t0 = time.time()
    total = 0
    errores = []
    hoy = date.today().isoformat()

    for region in REGIONES:
        site = ML_SITE_MAP.get(region)
        if not site:
            continue

        for cat, keywords in KEYWORDS_RADAR.items():
            for kw in keywords:
                try:
                    url = f"https://api.mercadolibre.com/sites/{site}/search"
                    params = {"q": kw, "limit": 10, "sort": "sold_quantity_desc"}
                    r = requests.get(url, params=params, timeout=15)
                    if r.status_code != 200:
                        errores.append(f"{region}/{kw}: HTTP {r.status_code}")
                        continue

                    data = r.json()
                    results = data.get("results", [])
                    rows = []
                    for item in results[:10]:
                        rows.append({
                            "keyword": kw,
                            "categoria": cat,
                            "region": region,
                            "titulo": (item.get("title") or "")[:200],
                            "precio": item.get("price"),
                            "moneda": item.get("currency_id", "USD"),
                            "vendidos": item.get("sold_quantity", 0),
                            "vendedor": (item.get("seller", {}).get("nickname") or "")[:100],
                            "url": item.get("permalink", ""),
                            "fecha_scrape": hoy,
                        })

                    inserted = supa_post("radar_productos_ml", rows)
                    total += inserted

                except Exception as e:
                    errores.append(f"{region}/{kw}: {e}")
                    log.warning(f"  Error ML {region}/{kw}: {e}")

                time.sleep(0.5)  # Rate limiting ML API

    duracion = time.time() - t0
    estado = "ok" if not errores else "parcial"
    guardar_log("mercadolibre", estado, total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  ML terminado: {total} registros en {duracion:.0f}s")


# ── 3. Datos internos + Evaluación ─────────────────────────────────────

def evaluar_productos():
    """Cruza señales externas con datos internos y genera score."""
    log.info("━━ Evaluación de productos ━━")
    t0 = time.time()
    hoy = date.today().isoformat()
    hace_3_meses = (date.today() - timedelta(days=90)).isoformat()
    total = 0

    for cat, keywords in KEYWORDS_RADAR.items():
        for kw in keywords:
            try:
                # ── Señal externa: Google Trends ──
                tendencia = {}
                for region in ["CR", "MX", "US"]:
                    datos = supa_get("radar_tendencias", {
                        "keyword": f"eq.{kw}",
                        "region": f"eq.{region}",
                        "fecha_dato": f"gte.{hace_3_meses}",
                        "select": "interes",
                        "order": "fecha_dato.desc",
                        "limit": "1",
                    })
                    tendencia[region] = datos[0]["interes"] if datos else 0

                # ── Señal externa: MercadoLibre ──
                ml_data = supa_get("radar_productos_ml", {
                    "keyword": f"eq.{kw}",
                    "fecha_scrape": f"eq.{hoy}",
                    "select": "precio,vendidos",
                })
                productos_ml = len(ml_data)
                precio_promedio = 0
                if ml_data:
                    precios = [p["precio"] for p in ml_data if p.get("precio")]
                    precio_promedio = sum(precios) / len(precios) if precios else 0

                # ── Señal interna: catálogo NEO ──
                # Buscar si ya vendemos algo similar
                catalogo = supa_get("neo_lista_items", {
                    "nombre": f"ilike.*{kw.split()[0]}*",
                    "select": "id",
                    "limit": "1",
                })
                ya_en_catalogo = len(catalogo) > 0

                # Buscar velocidad de categoría similar
                # Usamos items facturados de los últimos 3 meses
                items_facturados = supa_get("neo_items_facturados", {
                    "descripcion": f"ilike.*{kw.split()[0]}*",
                    "select": "id",
                    "limit": "50",
                })
                velocidad = len(items_facturados)

                # ── Calcular scores ──
                # Score externo (0-100): peso CR 40%, MX 35%, US 25%
                score_ext = (
                    tendencia.get("CR", 0) * 0.40 +
                    tendencia.get("MX", 0) * 0.35 +
                    tendencia.get("US", 0) * 0.25
                )
                # Bonus por demanda ML
                if productos_ml > 5:
                    score_ext = min(100, score_ext * 1.15)

                # Score interno (0-100)
                score_int = 0
                if ya_en_catalogo:
                    score_int += 30  # Ya lo vendemos, señal fuerte
                if velocidad > 20:
                    score_int += 40
                elif velocidad > 5:
                    score_int += 20
                # Sinergia con catálogo
                complementarios = supa_get("neo_lista_items", {
                    "nombre": f"ilike.*{cat.split('_')[0]}*",
                    "select": "id",
                    "limit": "20",
                })
                n_complementarios = len(complementarios)
                if n_complementarios > 3:
                    score_int += 30
                elif n_complementarios > 0:
                    score_int += 15

                score_int = min(100, score_int)

                # Score total: 60% externo + 40% interno
                score_total = round(score_ext * 0.6 + score_int * 0.4, 1)

                # Recomendación
                if score_total >= 70:
                    recomendacion = "🟢 Oportunidad fuerte — evaluar importación"
                elif score_total >= 45:
                    recomendacion = "🟡 Monitorear — tendencia creciente"
                elif score_total >= 25:
                    recomendacion = "🔵 Señal temprana — revisar en 2 semanas"
                else:
                    recomendacion = "⚪ Sin señal relevante"

                row = {
                    "keyword": kw,
                    "categoria": cat,
                    "score_externo": round(score_ext, 1),
                    "score_interno": round(score_int, 1),
                    "score_total": score_total,
                    "tendencia_cr": tendencia.get("CR", 0),
                    "tendencia_mx": tendencia.get("MX", 0),
                    "tendencia_us": tendencia.get("US", 0),
                    "productos_ml": productos_ml,
                    "precio_promedio_ml": round(precio_promedio, 2),
                    "ya_en_catalogo": ya_en_catalogo,
                    "complementarios_disponibles": n_complementarios,
                    "velocidad_categoria": velocidad,
                    "aparece_en_combos": False,
                    "recomendacion": recomendacion,
                    "fecha_evaluacion": hoy,
                }
                inserted = supa_post("radar_evaluaciones", [row])
                total += inserted

            except Exception as e:
                log.warning(f"  Error evaluando {kw}: {e}")

    duracion = time.time() - t0
    guardar_log("evaluacion", "ok", total, "OK", duracion)
    log.info(f"  Evaluación terminada: {total} registros en {duracion:.0f}s")


# ── Main ────────────────────────────────────────────────────────────────

def main():
    fuente = os.environ.get("RADAR_FUENTE", "todas")
    log.info(f"🛰️  RADAR iniciando — fuente: {fuente}")

    if fuente in ("todas", "google_trends"):
        scrape_google_trends()

    if fuente in ("todas", "mercadolibre"):
        scrape_mercadolibre()

    if fuente in ("todas", "evaluacion"):
        evaluar_productos()

    log.info("🛰️  RADAR finalizado")


if __name__ == "__main__":
    main()
