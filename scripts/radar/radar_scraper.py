"""
radar_scraper.py — Scraper de inteligencia de mercado para RADAR.

Fuentes:
  1. Google Trends (pytrends) — interés por keyword/región
  2. MercadoLibre — scraping web de búsquedas
  3. Amazon — scraping web MX + US
  4. Alibaba — scraping web para precios de proveedor
  5. Pinterest — señales de inspiración/demanda temprana
  6. YouTube — búsquedas de tutoriales DIY como proxy de demanda

Cruza datos externos con inventario interno en Supabase.
Genera evaluaciones con score combinado.

Corre en GitHub Actions: lunes 9am + jueves 2pm hora CR.
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

# Se carga dinámicamente desde Supabase
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
        cat = row["categoria"]
        kw_dict.setdefault(cat, []).append(row["keyword"])
    log.info(f"  Cargadas {len(rows)} keywords de {len(kw_dict)} categorías")
    return kw_dict


# ── Helpers ─────────────────────────────────────────────────────────────

def supa_post(table, rows):
    if not rows:
        return 0
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    r = requests.post(url, headers=HEADERS_SUPA, json=rows)
    if r.status_code not in (200, 201):
        log.error(f"Error en {table}: {r.status_code} {r.text[:200]}")
        return 0
    return len(rows)


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


def safe_get(url, headers=None, timeout=15):
    """GET con manejo de errores y headers de browser."""
    h = {"User-Agent": UA, "Accept-Language": "es-419,es;q=0.9"}
    if headers:
        h.update(headers)
    try:
        r = requests.get(url, headers=h, timeout=timeout)
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
        pytrends = TrendReq(hl="es", tz=360)
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
            try:
                pytrends.build_payload(kw_list, cat=0, timeframe="today 3-m", geo=geo)
                df = pytrends.interest_over_time()
                if df.empty:
                    continue

                rows = []
                for kw in kw_list:
                    if kw not in df.columns:
                        continue
                    for idx, row in df.iterrows():
                        rows.append({
                            "keyword": kw,
                            "categoria": cat_map[kw],
                            "region": region,
                            "interes": int(row[kw]),
                            "fecha_dato": idx.strftime("%Y-%m-%d"),
                        })

                inserted = supa_post("radar_tendencias", rows)
                total += inserted
                log.info(f"  {region} batch {i//5+1}: {inserted} registros")

            except Exception as e:
                errores.append(f"{region}/{kw_list[0]}: {e}")
                log.warning(f"  Error batch {region}: {e}")

            time.sleep(2)

    duracion = time.time() - t0
    guardar_log("google_trends", "ok" if not errores else "parcial", total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  Trends: {total} registros en {duracion:.0f}s")


# ── 2. MercadoLibre (scraping web) ────────────────────────────────────

def scrape_mercadolibre():
    log.info("━━ MercadoLibre ━━")
    t0 = time.time()
    total = 0
    errores = []
    hoy = date.today().isoformat()

    # Solo MX tiene ML activo y accesible
    ml_domains = {"MX": "listado.mercadolibre.com.mx"}

    for region, domain in ml_domains.items():
        for cat, keywords in KEYWORDS_RADAR.items():
            for kw in keywords:
                try:
                    url = f"https://{domain}/{quote_plus(kw)}_OrderId_PRICE*DESC"
                    r = safe_get(url)
                    if not r or r.status_code != 200:
                        errores.append(f"{region}/{kw}: HTTP {r.status_code if r else 'timeout'}")
                        continue

                    html = r.text
                    rows = []

                    # Extraer productos del HTML
                    items = re.findall(
                        r'<li class="ui-search-layout__item[^"]*".*?</li>',
                        html, re.DOTALL
                    )[:8]

                    for item_html in items:
                        titulo_m = re.search(r'title="([^"]+)"', item_html)
                        precio_m = re.search(r'class="andes-money-amount__fraction"[^>]*>([0-9,.]+)', item_html)
                        link_m = re.search(r'href="(https://[^"]+)"', item_html)

                        if titulo_m and precio_m:
                            precio_str = precio_m.group(1).replace(",", "").replace(".", "")
                            try:
                                precio = float(precio_str)
                            except:
                                precio = 0

                            rows.append({
                                "keyword": kw, "categoria": cat, "region": region,
                                "titulo": titulo_m.group(1)[:200],
                                "precio": precio, "moneda": "MXN",
                                "vendidos": 0, "vendedor": "",
                                "url": link_m.group(1) if link_m else "",
                                "fecha_scrape": hoy, "fuente": "mercadolibre",
                            })

                    inserted = supa_post("radar_productos", rows)
                    total += inserted

                except Exception as e:
                    errores.append(f"{region}/{kw}: {e}")

                time.sleep(1)

    duracion = time.time() - t0
    guardar_log("mercadolibre", "ok" if not errores else "parcial", total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  ML: {total} registros en {duracion:.0f}s")


# ── 3. Amazon (scraping web) ──────────────────────────────────────────

def scrape_amazon():
    log.info("━━ Amazon ━━")
    t0 = time.time()
    total = 0
    errores = []
    hoy = date.today().isoformat()

    amazon_domains = {
        "MX": "www.amazon.com.mx",
        "US": "www.amazon.com",
    }

    for region, domain in amazon_domains.items():
        for cat, keywords in KEYWORDS_RADAR.items():
            for kw in keywords:
                try:
                    url = f"https://{domain}/s?k={quote_plus(kw)}"
                    r = safe_get(url)
                    if not r or r.status_code != 200:
                        errores.append(f"Amazon {region}/{kw}: HTTP {r.status_code if r else 'timeout'}")
                        continue

                    html = r.text
                    rows = []

                    # Extraer productos
                    items = re.findall(
                        r'data-component-type="s-search-result".*?</div>\s*</div>\s*</div>\s*</div>',
                        html, re.DOTALL
                    )[:6]

                    for item_html in items:
                        titulo_m = re.search(r'<span class="a-text-normal"[^>]*>([^<]+)', item_html) or \
                                   re.search(r'<h2[^>]*>.*?<span[^>]*>([^<]+)', item_html, re.DOTALL)
                        precio_m = re.search(r'<span class="a-price-whole">([0-9,.]+)', item_html)
                        link_m = re.search(r'href="(/[^"]*dp/[^"]+)"', item_html)

                        if titulo_m:
                            precio = 0
                            if precio_m:
                                try:
                                    precio = float(precio_m.group(1).replace(",", ""))
                                except:
                                    pass

                            rows.append({
                                "keyword": kw, "categoria": cat, "region": region,
                                "titulo": titulo_m.group(1).strip()[:200],
                                "precio": precio,
                                "moneda": "MXN" if region == "MX" else "USD",
                                "vendidos": 0, "vendedor": "Amazon",
                                "url": f"https://{domain}{link_m.group(1)}" if link_m else "",
                                "fecha_scrape": hoy, "fuente": "amazon",
                            })

                    inserted = supa_post("radar_productos", rows)
                    total += inserted

                except Exception as e:
                    errores.append(f"Amazon {region}/{kw}: {e}")

                time.sleep(1.5)

    duracion = time.time() - t0
    guardar_log("amazon", "ok" if not errores else "parcial", total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  Amazon: {total} registros en {duracion:.0f}s")


# ── 4. Alibaba (scraping web) ─────────────────────────────────────────

def scrape_alibaba():
    log.info("━━ Alibaba ━━")
    t0 = time.time()
    total = 0
    errores = []
    hoy = date.today().isoformat()

    # Solo keywords principales (no todas para no saturar)
    main_keywords = []
    for cat, kws in KEYWORDS_RADAR.items():
        main_keywords.extend([(cat, kw) for kw in kws[:3]])  # Top 3 por categoría

    for cat, kw in main_keywords:
        try:
            # Alibaba usa inglés, traducimos keywords comunes
            kw_en = kw  # Muchos términos son universales (SPC, PVC, LED, WPC)
            url = f"https://www.alibaba.com/trade/search?SearchText={quote_plus(kw_en)}"
            r = safe_get(url)
            if not r or r.status_code != 200:
                errores.append(f"Alibaba/{kw}: HTTP {r.status_code if r else 'timeout'}")
                continue

            html = r.text
            rows = []

            # Extraer precios de proveedor
            items = re.findall(
                r'<div class="fy23-search-card[^"]*".*?</div>\s*</div>\s*</div>',
                html, re.DOTALL
            )[:5]

            # Buscar precios con patrón más genérico
            precios_encontrados = re.findall(
                r'\$([0-9,.]+)\s*-\s*\$([0-9,.]+)',
                html
            )[:5]

            titulos = re.findall(
                r'title="([^"]{10,200})".*?href="(//[^"]+)"',
                html
            )[:5]

            for i, (titulo, href) in enumerate(titulos):
                precio_min = 0
                precio_max = 0
                if i < len(precios_encontrados):
                    try:
                        precio_min = float(precios_encontrados[i][0].replace(",", ""))
                        precio_max = float(precios_encontrados[i][1].replace(",", ""))
                    except:
                        pass

                rows.append({
                    "keyword": kw, "categoria": cat, "region": "CN",
                    "titulo": titulo[:200],
                    "precio": precio_min,
                    "moneda": "USD",
                    "vendidos": 0, "vendedor": "Alibaba",
                    "url": f"https:{href}" if href.startswith("//") else href,
                    "fecha_scrape": hoy, "fuente": "alibaba",
                })

            inserted = supa_post("radar_productos", rows)
            total += inserted

        except Exception as e:
            errores.append(f"Alibaba/{kw}: {e}")

        time.sleep(2)

    duracion = time.time() - t0
    guardar_log("alibaba", "ok" if not errores else "parcial", total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  Alibaba: {total} registros en {duracion:.0f}s")


# ── 5. Pinterest Trends ───────────────────────────────────────────────

def scrape_pinterest():
    log.info("━━ Pinterest ━━")
    t0 = time.time()
    total = 0
    errores = []
    hoy = date.today().isoformat()

    for cat, keywords in KEYWORDS_RADAR.items():
        for kw in keywords:
            try:
                url = f"https://www.pinterest.com/search/pins/?q={quote_plus(kw)}"
                r = safe_get(url)
                if not r or r.status_code != 200:
                    errores.append(f"Pinterest/{kw}: HTTP {r.status_code if r else 'timeout'}")
                    continue

                html = r.text

                # Contar resultados como proxy de popularidad
                # Pinterest pone metadata con conteo
                count_m = re.search(r'"totalResults":\s*(\d+)', html)
                pin_count = int(count_m.group(1)) if count_m else 0

                # Buscar related searches (tendencias relacionadas)
                related = re.findall(r'"query":"([^"]+)"', html)[:5]

                if pin_count > 0 or related:
                    rows = [{
                        "keyword": kw, "categoria": cat, "region": "GLOBAL",
                        "titulo": f"Pinterest: {pin_count} pins | Related: {', '.join(related[:3])}",
                        "precio": 0, "moneda": "",
                        "vendidos": pin_count,  # Usamos vendidos como proxy de popularidad
                        "vendedor": "Pinterest",
                        "url": url,
                        "fecha_scrape": hoy, "fuente": "pinterest",
                    }]
                    inserted = supa_post("radar_productos", rows)
                    total += inserted

            except Exception as e:
                errores.append(f"Pinterest/{kw}: {e}")

            time.sleep(1)

    duracion = time.time() - t0
    guardar_log("pinterest", "ok" if not errores else "parcial", total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  Pinterest: {total} registros en {duracion:.0f}s")


# ── 6. YouTube Search ─────────────────────────────────────────────────

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
                    errores.append(f"YouTube/{kw}: HTTP {r.status_code if r else 'timeout'}")
                    continue

                html = r.text

                # Contar videos encontrados
                video_ids = re.findall(r'"videoId":"([^"]{11})"', html)
                unique_videos = len(set(video_ids))

                # Extraer vistas de los primeros videos
                views = re.findall(r'"viewCountText":\{"simpleText":"([\d,.]+)', html)[:5]
                total_views = 0
                for v in views:
                    try:
                        total_views += int(v.replace(",", "").replace(".", ""))
                    except:
                        pass

                # Extraer títulos de videos
                titles = re.findall(r'"title":\{"runs":\[\{"text":"([^"]+)"', html)[:3]

                if unique_videos > 0:
                    rows = [{
                        "keyword": kw, "categoria": cat, "region": "GLOBAL",
                        "titulo": f"YouTube: {unique_videos} videos | Top: {titles[0] if titles else 'N/A'}"[:200],
                        "precio": 0, "moneda": "",
                        "vendidos": total_views,  # Vistas como proxy de interés
                        "vendedor": "YouTube",
                        "url": url,
                        "fecha_scrape": hoy, "fuente": "youtube",
                    }]
                    inserted = supa_post("radar_productos", rows)
                    total += inserted

            except Exception as e:
                errores.append(f"YouTube/{kw}: {e}")

            time.sleep(1)

    duracion = time.time() - t0
    guardar_log("youtube", "ok" if not errores else "parcial", total,
                "; ".join(errores[:3]) if errores else "OK", duracion)
    log.info(f"  YouTube: {total} registros en {duracion:.0f}s")


# ── 7. Evaluación (cruza todo) ─────────────────────────────────────────

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

                # Contar fuentes con resultados
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
                # Bonus por presencia en múltiples fuentes
                if fuentes_con_datos >= 3:
                    score_ext = min(100, score_ext * 1.25)
                elif fuentes_con_datos >= 2:
                    score_ext = min(100, score_ext * 1.15)
                elif productos_total > 5:
                    score_ext = min(100, score_ext * 1.10)

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

                # ── Score total ──
                score_total = round(score_ext * 0.6 + score_int * 0.4, 1)

                if score_total >= 70:
                    recomendacion = "🟢 Oportunidad fuerte — evaluar importación"
                elif score_total >= 45:
                    recomendacion = "🟡 Monitorear — tendencia creciente"
                elif score_total >= 25:
                    recomendacion = "🔵 Señal temprana — revisar en 2 semanas"
                else:
                    recomendacion = "⚪ Sin señal relevante"

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
                    "recomendacion": recomendacion,
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

    if fuente in ("todas", "amazon"):
        scrape_amazon()

    if fuente in ("todas", "alibaba"):
        scrape_alibaba()

    if fuente in ("todas", "pinterest"):
        scrape_pinterest()

    if fuente in ("todas", "youtube"):
        scrape_youtube()

    if fuente in ("todas", "evaluacion"):
        evaluar_productos()

    log.info("🛰️  RADAR finalizado")


if __name__ == "__main__":
    main()
