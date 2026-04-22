"""
neo_items_facturados_downloader.py — Descarga "Lista de ítems facturados" de NEO
y sube a Supabase (tabla neo_items_facturados).
Selectores obtenidos con Playwright Codegen el 2026-03-29.

Rango de fechas: últimos 180 días hasta hoy (dinámico). El rango amplio es
necesario porque la UI muestra "última venta" por producto: si solo bajamos
el mes actual, una venta de marzo nunca actualiza la fecha hasta que la venta
de abril aparezca, y productos con rotación baja quedan con fechas viejas.
El upsert por (factura, codigo_interno, bodega) hace que reimportar rango
amplio sea idempotente.

Cómo correr manualmente:
  cd ~/Documents/GitHub/genesis-orion/scripts
  python3 neo_items_facturados_downloader.py

Horario automático: definir en LaunchAgent (por configurar).
"""

import os, sys, asyncio, logging, json, urllib.request, urllib.error
import unicodedata
from pathlib import Path
from datetime import datetime, date, timedelta

BASE = Path(__file__).parent
sys.path.insert(0, str(BASE))
from neo_session import relogin_si_hace_falta

try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass

NEO_URL     = "https://neo.neotecnologias.com/NEOBusiness/"
NEO_USUARIO = os.getenv("NEO_USUARIO", "luisjim230")
NEO_CLAVE   = os.getenv("NEO_CLAVE",   "Miami123")
EMPRESA_ID  = "984"  # Corporación Rojimo S.A.

SUPA_URL    = os.getenv("SUPABASE_URL",      "https://xeeieqjqmtoiutfnltqu.supabase.co")
SUPA_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZWllcWpxbXRvaXV0Zm5sdHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjA2NTMsImV4cCI6MjA4ODI5NjY1M30.SqYdotAkZOyMARsZb1XutfgYiH9Ig2qoHOD8j6oPy00")

TABLA = "neo_items_facturados"

DOWNLOAD_DIR = BASE / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)
LOG_FILE     = BASE / "neo-items-facturados.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.FileHandler(str(LOG_FILE)),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger(__name__)


# ─── FECHAS ───────────────────────────────────────────────────────────────────

DIAS_HISTORIAL = int(os.getenv("NEO_FACTURADOS_DIAS", "180"))


def rango_fechas():
    """Retorna (inicio, fin) en formato DDMMYYYY: últimos DIAS_HISTORIAL hasta hoy."""
    hoy = date.today()
    inicio = hoy - timedelta(days=DIAS_HISTORIAL)
    return inicio.strftime("%d%m%Y"), hoy.strftime("%d%m%Y")


# ─── SUPABASE ─────────────────────────────────────────────────────────────────

def supa_request(method, path, data=None, prefer="resolution=merge-duplicates,return=minimal"):
    import time
    url = f"{SUPA_URL}/rest/v1/{path}"
    body = json.dumps(data).encode() if data else None
    for intento in range(3):
        req = urllib.request.Request(url, data=body, method=method)
        req.add_header("apikey", SUPA_KEY)
        req.add_header("Authorization", f"Bearer {SUPA_KEY}")
        req.add_header("Content-Type", "application/json")
        req.add_header("Prefer", prefer)
        try:
            with urllib.request.urlopen(req, timeout=90) as r:
                return r.status
        except urllib.error.HTTPError as e:
            err = e.read().decode()[:300]
            log.warning(f"Supabase {method} {path}: {e.code} (intento {intento+1}/3) {err}")
            if intento < 2:
                time.sleep(2 * (intento + 1))
        except Exception as e:
            log.warning(f"Supabase {method} {path}: {e} (intento {intento+1}/3)")
            if intento < 2:
                time.sleep(2 * (intento + 1))
    log.error(f"Supabase {method} {path}: falló después de 3 intentos")
    return None


# ─── NORMALIZACIÓN ────────────────────────────────────────────────────────────

def norm(s):
    return unicodedata.normalize("NFC", str(s)).strip()


COL_MAP = {
    norm("Factura"):                          "factura",
    norm("Fecha"):                            "fecha",
    norm("Vendedor"):                         "vendedor",
    norm("Cliente"):                          "cliente",
    norm("Código interno"):                   "codigo_interno",
    norm("Ítem"):                             "item",
    norm("Bodega"):                           "bodega",
    norm("Cantidad facturada"):               "cantidad_facturada",
    norm("Cantidad devuelta"):                "cantidad_devuelta",
    norm("Precio unitario sin impuesto"):     "precio_unitario",
    norm("Costo unitario sin impuesto"):      "costo_unitario",
    norm("Subtotal"):                         "subtotal",
    norm("Descuento"):                        "descuento",
    norm("% Descuento"):                      "pct_descuento",
    norm("Impuesto"):                         "impuesto",
    norm("Impuestos"):                        "impuestos",
    norm("Utilidad/costo"):                   "utilidad_costo",
    norm("Total"):                            "total",
    norm("Tipo de cambio de venta"):          "tipo_cambio",
    norm("Territorio"):                       "territorio",
    norm("Marca"):                            "marca",
}


# ─── DESCARGA ─────────────────────────────────────────────────────────────────

DIAS_POR_CHUNK = int(os.getenv("NEO_FACTURADOS_CHUNK_DIAS", "60"))
TIMEOUT_EXPORT_MS = int(os.getenv("NEO_FACTURADOS_TIMEOUT_MS", "420000"))  # 7 min


def _chunks_de_fechas(dias_total, dias_chunk):
    """Divide el rango total en tramos de `dias_chunk` días, desde el más
    antiguo al más reciente. Devuelve lista de (inicio_str, fin_str) en
    formato DDMMYYYY."""
    hoy = date.today()
    inicio_total = hoy - timedelta(days=dias_total)
    rangos = []
    cur = inicio_total
    while cur <= hoy:
        fin = min(cur + timedelta(days=dias_chunk - 1), hoy)
        rangos.append((cur.strftime("%d%m%Y"), fin.strftime("%d%m%Y")))
        cur = fin + timedelta(days=1)
    return rangos


async def _setear_fechas(iframe, f_inicio, f_fin):
    """Setea el rango en los inputs de fecha del iframe. Devuelve True si tuvo
    éxito, False si no encontró los inputs."""
    selectores_fecha = [
        ("#fFechaInicio", "#fFechaFin"),
        ("#txtFechaInicio", "#txtFechaFin"),
        ("input[name='fFechaInicio']", "input[name='fFechaFin']"),
        ("input[name='txtFechaInicio']", "input[name='txtFechaFin']"),
    ]
    for sel_inicio, sel_fin in selectores_fecha:
        try:
            el_ini = iframe.locator(sel_inicio)
            if await el_ini.count() > 0:
                await el_ini.click(click_count=3)
                await el_ini.fill(f_inicio)
                await iframe.locator(sel_fin).click(click_count=3)
                await iframe.locator(sel_fin).fill(f_fin)
                log.info(f"  Fechas OK ({sel_inicio}): {f_inicio} → {f_fin}")
                return True
        except Exception:
            continue
    # Fallback: buscar por valor tipo fecha
    try:
        inputs = iframe.locator("input[type='text']")
        count = await inputs.count()
        for idx in range(min(count, 10)):
            val = await inputs.nth(idx).get_attribute("value") or ""
            if "/" in val and len(val) >= 8 and idx + 1 < count:
                await inputs.nth(idx).click(click_count=3)
                await inputs.nth(idx).fill(f_inicio)
                await inputs.nth(idx + 1).click(click_count=3)
                await inputs.nth(idx + 1).fill(f_fin)
                log.info(f"  Fechas OK (fallback input[{idx}]): {f_inicio} → {f_fin}")
                return True
    except Exception as e:
        log.warning(f"  Error en fallback de fechas: {e}")
    return False


async def _exportar_excel_actual(page, iframe, sufijo):
    """Click Refrescar → esperar datos → click Exportar → guardar .xlsx."""
    await iframe.get_by_role("button", name="Refrescar").click()
    log.info("  Esperando datos (NEO es lento)...")
    try:
        await iframe.locator("text=registros").wait_for(timeout=120_000)
        log.info("  Datos cargados")
    except Exception:
        log.warning("  Timeout 120s esperando datos — exportando igual")

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    excel_path = DOWNLOAD_DIR / f"items_facturados_{sufijo}_{ts}.xlsx"
    log.info(f"  Descargando Excel (timeout {TIMEOUT_EXPORT_MS // 1000}s)...")
    async with page.expect_download(timeout=TIMEOUT_EXPORT_MS) as dl_info:
        await iframe.get_by_role("button", name="Exportar").click()
    dl = await dl_info.value
    await dl.save_as(excel_path)
    size = excel_path.stat().st_size
    log.info(f"  ✅ {excel_path.name} ({size:,} bytes)")
    return excel_path


async def descargar():
    """Descarga los últimos DIAS_HISTORIAL días en chunks de DIAS_POR_CHUNK
    días, reutilizando la misma sesión de navegador. Devuelve lista de Paths
    de Excel generados (uno por chunk)."""
    from playwright.async_api import async_playwright

    rangos = _chunks_de_fechas(DIAS_HISTORIAL, DIAS_POR_CHUNK)
    log.info(f"  Historial total: {DIAS_HISTORIAL} días en {len(rangos)} chunk(s) de {DIAS_POR_CHUNK} días")
    for i, (ini, fin) in enumerate(rangos, 1):
        log.info(f"    chunk {i}: {ini[:2]}/{ini[2:4]}/{ini[4:]} → {fin[:2]}/{fin[2:4]}/{fin[4:]}")

    excel_paths = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx     = await browser.new_context(accept_downloads=True)
        page    = await ctx.new_page()

        # ── Login (una sola vez para toda la corrida) ────────────────────────
        log.info("Abriendo NEO...")
        await page.goto(NEO_URL)
        await page.get_by_role("textbox", name="Usuario o correo electrónico").fill(NEO_USUARIO)
        await page.get_by_role("textbox", name="Contraseña").fill(NEO_CLAVE)
        await page.get_by_role("button", name="Ingresar").click()
        await page.wait_for_load_state("networkidle")
        log.info("Login OK")

        await page.get_by_title("Perfil").click()
        await page.locator("#cboEmpresa").select_option(EMPRESA_ID)
        await page.wait_for_load_state("networkidle")
        log.info(f"  Empresa OK ({EMPRESA_ID} = Rojimo)")

        if not await relogin_si_hace_falta(page, NEO_USUARIO, NEO_CLAVE, log):
            raise RuntimeError(f"NEO sigue en Login.aspx — sesión tomada por otro cliente. URL: {page.url}")

        # ── Navegar una sola vez: Ventas → Ítems facturados ─────────────────
        await page.locator("#mostrar_barra_izquierda").click()
        await page.get_by_role("link", name="Ventas").click()
        await page.wait_for_timeout(2000)

        iframe = page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame
        await iframe.get_by_role("link", name="Ítems facturados").nth(1).click()
        await page.wait_for_load_state("networkidle")
        log.info("✅ Ítems facturados cargado")

        # ── Iterar chunks ────────────────────────────────────────────────────
        for i, (f_inicio, f_fin) in enumerate(rangos, 1):
            log.info(f"── Chunk {i}/{len(rangos)} ────────────────────────────────────────")
            ok = await _setear_fechas(iframe, f_inicio, f_fin)
            if not ok:
                log.warning(f"  No se pudieron setear fechas — se omite chunk {i}")
                continue
            try:
                path = await _exportar_excel_actual(page, iframe, f"{f_inicio}-{f_fin}")
                excel_paths.append(path)
            except Exception as e:
                log.error(f"  Error exportando chunk {i}: {e}")
                # Seguir con el resto — cada chunk es independiente
                continue

        await browser.close()

    log.info(f"✅ {len(excel_paths)}/{len(rangos)} chunks descargados")
    return excel_paths


# ─── SUBIR A SUPABASE ─────────────────────────────────────────────────────────

def subir_a_supabase(excel_path):
    try:
        import pandas as pd
    except ImportError:
        log.error("pandas no instalado: pip3 install pandas openpyxl")
        return False

    log.info("Leyendo Excel...")

    raw = pd.read_excel(excel_path, header=None, dtype=str)
    header_row = None
    for i, row in raw.iterrows():
        first_val = norm(str(row.iloc[0])) if pd.notna(row.iloc[0]) else ""
        if first_val == "Factura":
            header_row = i
            break

    if header_row is None:
        log.error("❌ No se encontró fila con 'Factura' — abortando")
        return False

    df = pd.read_excel(excel_path, header=header_row, dtype=str)
    df.columns = [norm(c) for c in df.columns]
    log.info(f"  Headers en fila {header_row}: {list(df.columns)}")

    df = df.rename(columns=COL_MAP)
    cols = [c for c in COL_MAP.values() if c in df.columns]
    log.info(f"  Columnas mapeadas: {cols}")

    if "factura" not in cols:
        log.error("❌ No se encontró columna 'Factura' — abortando")
        return False

    df = df[cols].copy()

    # Normalizar fecha a DD/MM/YYYY (pandas la lee como "YYYY-MM-DD HH:MM:SS")
    if "fecha" in df.columns:
        df["fecha"] = pd.to_datetime(df["fecha"], errors="coerce").dt.strftime("%d/%m/%Y")

    # Filtrar filas vacías y totales
    df = df.dropna(subset=["factura"])
    df = df[df["factura"].astype(str).str.strip() != ""]
    df = df[~df["factura"].astype(str).str.startswith("Total")]
    # Deduplicar por el constraint único (factura, codigo_interno, bodega)
    df = df.drop_duplicates(subset=["factura", "codigo_interno", "bodega"], keep="last")

    total = len(df)
    if total < 5:
        log.error(f"❌ Solo {total} filas — posible error. Abortando.")
        return False

    # Metadatos
    hoy = date.today()
    fecha_carga = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    periodo = f"{hoy.year}-{str(hoy.month).zfill(2)}"
    df["fecha_carga"]     = fecha_carga
    df["periodo_reporte"] = periodo
    df["mes"]             = periodo  # requerido por mv_items_por_vend_mes y RPCs

    registros = json.loads(df.to_json(orient="records", force_ascii=False))

    # ── Upsert: insertar o actualizar por (factura, codigo_interno, bodega) ───
    log.info(f"Insertando/actualizando {total:,} registros...")
    BATCH = 80
    ok = 0
    for i in range(0, total, BATCH):
        lote = registros[i:i + BATCH]
        status = supa_request(
            "POST",
            f"{TABLA}?on_conflict=factura,codigo_interno,bodega",
            lote,
            prefer="resolution=merge-duplicates,return=minimal"
        )
        if status and status < 300:
            ok += len(lote)
        else:
            log.warning(f"  Lote {i}–{i+len(lote)} falló (status={status})")

    log.info(f"✅ Supabase: {ok:,}/{total:,} registros cargados")
    exito = ok == total

    # Refrescar la vista materializada que alimenta comercial_top_productos/tendencias.
    # Sin esto, los reportes quedan congelados en datos viejos.
    refresh_status = supa_request("POST", "rpc/refresh_mv_items_por_vend_mes", {},
                                   prefer="return=minimal")
    if refresh_status and refresh_status < 300:
        log.info("  ↻ vista materializada refrescada")
    else:
        log.warning(f"  ⚠ refresh de vista materializada falló (status={refresh_status})")

    # Actualizar sync_status
    ahora = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    supa_request("PATCH", "sync_status?id=eq.items_facturados", {
        "ultima_sync": ahora, "exitoso": exito, "updated_at": ahora,
    })
    log.info("  sync_status actualizado")

    return exito


# ─── MAIN ─────────────────────────────────────────────────────────────────────

async def main():
    log.info("=" * 50)
    log.info(f"NEO → Ítems facturados  [{datetime.now():%Y-%m-%d %H:%M}]")
    log.info("=" * 50)

    try:
        excel_paths = await descargar()
        if not excel_paths:
            log.error("No se descargó ningún chunk — abortando upload")
            sys.exit(1)
        fallos = 0
        for i, excel_path in enumerate(excel_paths, 1):
            log.info(f"── Subida {i}/{len(excel_paths)}: {excel_path.name} ──")
            if not subir_a_supabase(excel_path):
                fallos += 1
        if fallos:
            log.warning(f"Listo con {fallos}/{len(excel_paths)} chunks fallados en upload")
        else:
            log.info(f"Listo. {len(excel_paths)} chunk(s) sincronizados.")
    except Exception as e:
        log.error(f"Error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
