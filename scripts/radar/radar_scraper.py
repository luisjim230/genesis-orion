"""
radar_scraper.py — Scraper de inteligencia de mercado para RADAR.

Fuentes verificadas que funcionan desde GitHub Actions:
  1. Google Trends (pytrends) — interés por keyword/región
  2. MercadoLibre MX — scraping web (poly-card structure)
  3. YouTube — scraping de búsquedas (videos + vistas)
  4. Google Related Queries — búsquedas relacionadas como señal de demanda

Cruza datos externos con inventario interno en Supabase.
Genera evaluaciones con score combinado.
"""

import os, re, json, time, logging
from datetime import date, timedelta
from urllib.parse import quote_plus

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
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS_SUPA = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

REGIONES = ["CR", "GT", "MX", "US"]
GEO_MAP = {"CR": "CR", "GT": "GT", "MX": "MX", "US": "US"}

KEYWORDS_RADAR = {}


def cargar_keywords_desde_supabase():
    url = f"{SUPABASE_URL}/rest/v1/radar_keywords"
    headers = {**HEADERS_SUPA, "Prefer": ""}
    params = {"activa": "eq.true", "select": "keyword,categoria"}
    r = requests.get(url, headers=headers, params=params)
    if r.status_code != 200:
        log.error(f"Error cargando keywords: {r.status_code}")
        return {}
    rows = r.json()
    kw_dict = {}
    for row in rows:
        kw_dict.setdefault(row["categoria"], []).append(row["keyword"])
    log.info(f"  Cargadas {len(rows)} keywords de {len(kw_dict)} categorías")
    return kw_dict


# ── Helpers ─────────────────────────────────────────────────────────────

def supa_post(table, rows):
    if not rows:
        return 0
    # Insertar en lotes de 50 para evitar payloads enormes
    total = 0
    for i in range(0, len(rows), 50):
        batch = rows[i:i+50]
        url = f"{SUPABASE_URL}/rest/v1/{table}"
        r = requests.post(url, headers=HEADERS_SUPA, json=batch)
        if r.status_code in (200, 201):
            total += len(batch)
        else:
            log.error(f"Error en {table}: {r.status_code} {r.text[:200]}")
    return total


def supa_get(table, params):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    headers = {**HEADERS_SUPA, "Prefer": ""}
    r = requests.get(url, headers=headers, params=params)
    return r.json() if r.status_code == 200 else []


def guardar_log(fuente, estado, registros, mensaje, duracion):
    supa_post("radar_logs", [{
        "fuente": fuente, "estado": estado,
        "registros_guardados": registros,
        "mensaje": (mensaje or "")[:500],
        "duracion_segundos": round(duracion, 1),
    }])


def safe_get(url, timeout=15):
    headers = {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "es-419,es;q=0.9,en;q=0.5",
        "Accept-Encoding": "gzip, deflate",
        "Connection": "keep-alive",
    }
    try:
        r = requests.get(url, headers=headers, timeout=timeout)
        return r
    except Exception as e:
        log.warning(f"  Request falló: {e}")
        return None


# ── 1. Google Trends ───────────────────────────────────────────────────

def scrape_google_trends():
    log.info("━━ Google Trends ━━")
    t0 = time.time()
    total = 0
    errores = []

    try:
        pytrends = TrendReq(hl="es", tz=360, retries=3, backoff_factor=2)
    except Exception as e:
        guardar_log("google_trends", "error", 0, str(e), time.time() - t0)
        return

    all_keywords = [(cat, kw) for cat, kws in KEYWORDS_RADAR.items() for kw in kws]

    for region in REGIONES:
        geo = GEO_MAP[region]
        for i in range(0, len(all_keywords), 5):
            batch = all_keywords[i:i+5]
            kw_list = [kw for _, kw in batch]
            cat_map = {kw: cat for cat, kw in batch}

            # Retry con backoff
            for attempt in range(3):
                try:
                    pytrends.build_payload(kw_list, cat=0, timeframe="today 3-m", geo=geo)
                    df = pytrends.interest_over_time()
                    if df.empty:
                        break

                    rows = []
                    for kw in kw_list:
                        if kw not in df.columns:
                            continue
                        for idx, row in df.iterrows():
                            rows.append({
                                "keyword": kw, "categoria": cat_map[kw],
                                "region": region, "interes": int(row[kw]),
                                "fecha_dato": idx.strftime("%Y-%m-%d"),
                            })

                    inserted = supa_post("radar_tendencias", rows)
                    total += inserted
                    log.info(f"  {region} batch {i//5+1}: {inserted} registros")
                    break  # Éxito, salir del retry

                except Exception as e:
                    if "429" in str(e) and attempt < 2:
                        wait = (attempt + 1) * 15
                        log.warning(f"  Rate limit {region}, esperando {wait}s...")
                        time.sleep(wait)
                    else:
                        errores.append(f"{region}/{kw_list[0]}: {e}")
                        log.warning(f"  Error batch {region}: {e}")
                        break

            time.sleep(4)  # Más conservador para evitar 429

    duracion = time.time() - t0
    guardar_log("google_trends", "ok" if not errores else "parcial", total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  Trends: {total} registros en {duracion:.0f}s")


# ── 2. MercadoLibre MX (scraping web) ─────────────────────────────────

def scrape_mercadolibre():
    log.info("━━ MercadoLibre MX ━━")
    t0 = time.time()
    total = 0
    errores = []
    hoy = date.today().isoformat()

    for cat, keywords in KEYWORDS_RADAR.items():
        for kw in keywords:
            try:
                # URL de búsqueda de ML México
                kw_url = kw.replace(" ", "-")
                url = f"https://listado.mercadolibre.com.mx/{kw_url}"
                r = safe_get(url)
                if not r or r.status_code != 200:
                    errores.append(f"ML/{kw}: HTTP {r.status_code if r else 'timeout'}")
                    continue

                html = r.text
                rows = []

                # Extraer títulos con poly-component__title
                titles = re.findall(
                    r'class="poly-component__title[^"]*"[^>]*>([^<]+)', html
                )
                # Extraer precios
                precios = re.findall(
                    r'andes-money-amount__fraction[^>]*>([0-9,]+)', html
                )
                # Extraer links
                links = re.findall(
                    r'href="(https://www\.mercadolibre\.com\.mx/[^"]+)"', html
                )

                for j in range(min(len(titles), 8)):
                    precio = 0
                    if j < len(precios):
                        try:
                            precio = float(precios[j].replace(",", ""))
                        except:
                            pass

                    rows.append({
                        "keyword": kw, "categoria": cat, "region": "MX",
                        "titulo": titles[j].strip()[:200],
                        "precio": precio, "moneda": "MXN",
                        "vendidos": 0, "vendedor": "",
                        "url": links[j] if j < len(links) else "",
                        "fecha_scrape": hoy, "fuente": "mercadolibre",
                    })

                inserted = supa_post("radar_productos", rows)
                total += inserted
                if rows:
                    log.info(f"  ML {kw}: {len(rows)} productos")

            except Exception as e:
                errores.append(f"ML/{kw}: {e}")

            time.sleep(1.5)

    duracion = time.time() - t0
    guardar_log("mercadolibre", "ok" if not errores else "parcial", total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  ML: {total} registros en {duracion:.0f}s")


# ── 3. YouTube Search ─────────────────────────────────────────────────

def scrape_youtube():
    log.info("━━ YouTube ━━")
    t0 = time.time()
    total = 0
    errores = []
    hoy = date.today().isoformat()

    for cat, keywords in KEYWORDS_RADAR.items():
        for kw in keywords:
            try:
                url = f"https://www.youtube.com/results?search_query={quote_plus(kw)}"
                r = safe_get(url)
                if not r or r.status_code != 200:
                    errores.append(f"YT/{kw}: HTTP {r.status_code if r else 'timeout'}")
                    continue

                html = r.text

                # Videos únicos
                video_ids = list(set(re.findall(r'"videoId":"([^"]{11})"', html)))
                num_videos = len(video_ids)

                # Vistas de los primeros videos
                views_raw = re.findall(
                    r'"viewCountText":\{"simpleText":"([\d,.\s]+)', html
                )[:5]
                total_views = 0
                for v in views_raw:
                    try:
                        total_views += int(re.sub(r'[^\d]', '', v))
                    except:
                        pass

                # Títulos
                titles = re.findall(
                    r'"title":\{"runs":\[\{"text":"([^"]+)"', html
                )[:3]

                if num_videos > 0:
                    top_title = titles[0] if titles else "N/A"
                    rows = [{
                        "keyword": kw, "categoria": cat, "region": "GLOBAL",
                        "titulo": f"{num_videos} videos · Top: {top_title}"[:200],
                        "precio": 0, "moneda": "",
                        "vendidos": total_views,
                        "vendedor": "YouTube",
                        "url": url,
                        "fecha_scrape": hoy, "fuente": "youtube",
                    }]
                    inserted = supa_post("radar_productos", rows)
                    total += inserted
                    log.info(f"  YT {kw}: {num_videos} videos, {total_views:,} vistas")

            except Exception as e:
                errores.append(f"YT/{kw}: {e}")

            time.sleep(1.5)

    duracion = time.time() - t0
    guardar_log("youtube", "ok" if not errores else "parcial", total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  YouTube: {total} registros en {duracion:.0f}s")


# ── 4. Google Related Queries (via pytrends) ──────────────────────────

def scrape_related_queries():
    """Usa pytrends para sacar búsquedas relacionadas — señal de demanda lateral."""
    log.info("━━ Google Related Queries ━━")
    t0 = time.time()
    total = 0
    errores = []
    hoy = date.today().isoformat()

    try:
        pytrends = TrendReq(hl="es", tz=360, retries=2, backoff_factor=2)
    except Exception as e:
        guardar_log("related_queries", "error", 0, str(e), time.time() - t0)
        return

    # Solo top 2 keywords por categoría para no saturar
    main_keywords = []
    for cat, kws in KEYWORDS_RADAR.items():
        main_keywords.extend([(cat, kw) for kw in kws[:2]])

    for cat, kw in main_keywords:
        try:
            pytrends.build_payload([kw], cat=0, timeframe="today 3-m", geo="MX")
            related = pytrends.related_queries()

            if kw in related and related[kw].get("rising") is not None:
                rising = related[kw]["rising"]
                if not rising.empty:
                    rows = []
                    for _, row in rising.head(5).iterrows():
                        rows.append({
                            "keyword": kw, "categoria": cat, "region": "MX",
                            "titulo": f"Rising: {row['query']} (+{row['value']}%)"[:200],
                            "precio": 0, "moneda": "",
                            "vendidos": int(row["value"]) if row["value"] != "Breakout" else 5000,
                            "vendedor": "Google Related",
                            "url": f"https://trends.google.com/trends/explore?q={quote_plus(row['query'])}&geo=MX",
                            "fecha_scrape": hoy, "fuente": "google_related",
                        })
                    inserted = supa_post("radar_productos", rows)
                    total += inserted
                    log.info(f"  Related {kw}: {len(rows)} queries rising")

        except Exception as e:
            if "429" not in str(e):
                errores.append(f"Related/{kw}: {e}")

        time.sleep(5)  # Muy conservador

    duracion = time.time() - t0
    guardar_log("related_queries", "ok" if not errores else "parcial", total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  Related: {total} registros en {duracion:.0f}s")


# ── 5. Evaluación (cruza todo) ─────────────────────────────────────────

def evaluar_productos():
    log.info("━━ Evaluación de productos ━━")
    t0 = time.time()
    hoy = date.today().isoformat()
    hace_3_meses = (date.today() - timedelta(days=90)).isoformat()
    total = 0

    for cat, keywords in KEYWORDS_RADAR.items():
        for kw in keywords:
            try:
                # ── Señal Google Trends ──
                tendencia = {}
                for region in ["CR", "MX", "US"]:
                    datos = supa_get("radar_tendencias", {
                        "keyword": f"eq.{kw}", "region": f"eq.{region}",
                        "fecha_dato": f"gte.{hace_3_meses}",
                        "select": "interes", "order": "fecha_dato.desc", "limit": "1",
                    })
                    tendencia[region] = datos[0]["interes"] if datos else 0

                # ── Señal productos (todas las fuentes) ──
                productos_data = supa_get("radar_productos", {
                    "keyword": f"eq.{kw}", "fecha_scrape": f"eq.{hoy}",
                    "select": "precio,vendidos,fuente",
                })
                productos_total = len(productos_data)
                precio_promedio = 0
                if productos_data:
                    precios = [p["precio"] for p in productos_data if p.get("precio") and p["precio"] > 0]
                    precio_promedio = sum(precios) / len(precios) if precios else 0

                fuentes_con_datos = len(set(p.get("fuente", "") for p in productos_data))

                # ── Señal interna NEO ──
                catalogo = supa_get("neo_lista_items", {
                    "nombre": f"ilike.*{kw.split()[0]}*",
                    "select": "id", "limit": "1",
                })
                ya_en_catalogo = len(catalogo) > 0

                items_facturados = supa_get("neo_items_facturados", {
                    "descripcion": f"ilike.*{kw.split()[0]}*",
                    "select": "id", "limit": "50",
                })
                velocidad = len(items_facturados)

                # ── Score externo (0-100) ──
                score_ext = (
                    tendencia.get("CR", 0) * 0.40 +
                    tendencia.get("MX", 0) * 0.35 +
                    tendencia.get("US", 0) * 0.25
                )
                if fuentes_con_datos >= 3:
                    score_ext = min(100, score_ext * 1.25)
                elif fuentes_con_datos >= 2:
                    score_ext = min(100, score_ext * 1.15)

                # ── Score interno (0-100) ──
                score_int = 0
                if ya_en_catalogo:
                    score_int += 30
                if velocidad > 20:
                    score_int += 40
                elif velocidad > 5:
                    score_int += 20

                complementarios = supa_get("neo_lista_items", {
                    "nombre": f"ilike.*{cat.split('_')[0]}*",
                    "select": "id", "limit": "20",
                })
                n_complementarios = len(complementarios)
                if n_complementarios > 3:
                    score_int += 30
                elif n_complementarios > 0:
                    score_int += 15
                score_int = min(100, score_int)

                score_total = round(score_ext * 0.6 + score_int * 0.4, 1)

                if score_total >= 70:
                    rec = "🟢 Oportunidad fuerte — evaluar importación"
                elif score_total >= 45:
                    rec = "🟡 Monitorear — tendencia creciente"
                elif score_total >= 25:
                    rec = "🔵 Señal temprana — revisar en 2 semanas"
                else:
                    rec = "⚪ Sin señal relevante"

                row = {
                    "keyword": kw, "categoria": cat,
                    "score_externo": round(score_ext, 1),
                    "score_interno": round(score_int, 1),
                    "score_total": score_total,
                    "tendencia_cr": tendencia.get("CR", 0),
                    "tendencia_mx": tendencia.get("MX", 0),
                    "tendencia_us": tendencia.get("US", 0),
                    "productos_ml": productos_total,
                    "precio_promedio_ml": round(precio_promedio, 2),
                    "ya_en_catalogo": ya_en_catalogo,
                    "complementarios_disponibles": n_complementarios,
                    "velocidad_categoria": velocidad,
                    "aparece_en_combos": False,
                    "recomendacion": rec,
                    "fecha_evaluacion": hoy,
                }
                inserted = supa_post("radar_evaluaciones", [row])
                total += inserted

            except Exception as e:
                log.warning(f"  Error evaluando {kw}: {e}")

    duracion = time.time() - t0
    guardar_log("evaluacion", "ok", total, "OK", duracion)
    log.info(f"  Evaluación: {total} registros en {duracion:.0f}s")


# ── Main ────────────────────────────────────────────────────────────────

def main():
    global KEYWORDS_RADAR
    fuente = os.environ.get("RADAR_FUENTE", "todas")
    log.info(f"🛰️  RADAR iniciando — fuente: {fuente}")

    KEYWORDS_RADAR = cargar_keywords_desde_supabase()
    if not KEYWORDS_RADAR:
        log.error("Sin keywords activas. Abortando.")
        guardar_log("general", "error", 0, "Sin keywords activas", 0)
        return

    if fuente in ("todas", "google_trends"):
        scrape_google_trends()

    if fuente in ("todas", "mercadolibre"):
        scrape_mercadolibre()

    if fuente in ("todas", "youtube"):
        scrape_youtube()

    if fuente in ("todas", "related_queries"):
        scrape_related_queries()

    if fuente in ("todas", "evaluacion"):
        evaluar_productos()

    log.info("🛰️  RADAR finalizado")


if __name__ == "__main__":
    main()
