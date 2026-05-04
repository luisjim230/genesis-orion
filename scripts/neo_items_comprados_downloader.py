"""
neo_items_comprados_downloader.py — Descarga "Ítems comprados" de NEO y sube a Supabase.
Selectores obtenidos con Playwright Codegen el 2026-03-29.

Cómo correr manualmente:
  cd ~/Documents/GitHub/genesis-orion/scripts
  python3 neo_items_comprados_downloader.py

Horario automático: definir en LaunchAgent (por configurar).
"""

import os, sys, asyncio, logging, json, urllib.request, urllib.error
import unicodedata
from pathlib import Path
from datetime import datetime

BASE = Path(__file__).parent
sys.path.insert(0, str(BASE))
from neo_session import relogin_si_hace_falta

# Cargar .env si existe
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

TABLA       = "neo_items_comprados"

DOWNLOAD_DIR = BASE / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)
LOG_FILE     = BASE / "neo-items-comprados.log"

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


# ─── SUPABASE ─────────────────────────────────────────────────────────────────

def supa_request(method, path, data=None):
    url = f"{SUPA_URL}/rest/v1/{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("apikey", SUPA_KEY)
    req.add_header("Authorization", f"Bearer {SUPA_KEY}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "resolution=merge-duplicates,return=minimal")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        log.error(f"Supabase {method} {path}: {e.code} {e.read().decode()[:300]}")
        return None


# ─── NORMALIZACIÓN ────────────────────────────────────────────────────────────

def norm(s):
    return unicodedata.normalize("NFC", str(s)).strip()


COL_MAP = {
    norm("Compra"):                                     "compra",
    norm("Estado"):                                     "estado",
    norm("Fecha"):                                      "fecha",
    norm("Num. Factura"):                               "num_factura",
    norm("Proveedor"):                                  "proveedor",
    norm("Tipo de ítem"):                               "tipo_item",
    norm("Código interno"):                             "codigo_interno",
    norm("Ítem"):                                       "item",
    norm("Cantidad comprada"):                          "cantidad_comprada",
    norm("Cantidad devuelta"):                          "cantidad_devuelta",
    norm("Costo unitario sin impuesto"):                "costo_unitario_sin_imp",
    norm("Moneda"):                                     "moneda",
    norm("Precio unitario con impuesto"):               "precio_unitario_con_imp",
    norm("Subtotal"):                                   "subtotal",
    norm("Descuento"):                                  "descuento",
    norm("Subtotal con descuento (moneda de contab"):   "subtotal_con_descuento_contab",
    norm("% Impuesto"):                                 "pct_impuesto",
    norm("Impuestos"):                                  "impuestos",
    norm("Total"):                                      "total",
    norm("Total sin impuesto en colones"):              "total_sin_imp_colones",
    norm("Existencias al momento de la compra"):        "existencias_al_comprar",
    norm("Costo unitario actual"):                      "costo_unitario_actual",
    norm("Costo unitario compra"):                      "costo_unitario_compra",
    norm("Costo unitario promedio"):                    "costo_unitario_promedio",
    norm("Precio unitario actual"):                     "precio_unitario_actual",
    norm("Utilidad"):                                   "utilidad",
    norm("Tipo de cambio"):                             "tipo_de_cambio",
    norm("Marca del ítem"):                             "marca",
    norm("Categoría dél ítem"):                         "categoria",
}


# ─── DESCARGA ─────────────────────────────────────────────────────────────────

def rango_30_dias():
    """Últimos 30 días corridos hasta hoy. Devuelve (DDMMYYYY, DDMMYYYY)."""
    from datetime import timedelta, date
    hoy = date.today()
    f_ini = hoy - timedelta(days=30)
    return f_ini.strftime("%d%m%Y"), hoy.strftime("%d%m%Y")


async def dump_inputs(iframe):
    """Imprime los inputs/selects/botones visibles para diagnosticar la UI de NEO."""
    log.info("  ── DEBUG: Inputs en la página ──")
    try:
        inputs = iframe.locator("input")
        count = await inputs.count()
        log.info(f"    Total inputs: {count}")
        for i in range(min(count, 30)):
            try:
                tag_id   = await inputs.nth(i).get_attribute("id") or ""
                tag_name = await inputs.nth(i).get_attribute("name") or ""
                tag_type = await inputs.nth(i).get_attribute("type") or ""
                tag_val  = await inputs.nth(i).get_attribute("value") or ""
                tag_ph   = await inputs.nth(i).get_attribute("placeholder") or ""
                visible  = await inputs.nth(i).is_visible()
                if visible:
                    log.info(f"    [{i}] type={tag_type:<10} id={tag_id:<25} name={tag_name:<25} val='{tag_val[:25]}' ph='{tag_ph[:20]}'")
            except Exception:
                pass
    except Exception as e:
        log.warning(f"    Error listando inputs: {e}")
    try:
        selects = iframe.locator("select")
        sc = await selects.count()
        log.info(f"    Total selects: {sc}")
        for i in range(min(sc, 10)):
            try:
                if await selects.nth(i).is_visible():
                    sid = await selects.nth(i).get_attribute("id") or ""
                    snm = await selects.nth(i).get_attribute("name") or ""
                    log.info(f"    select[{i}] id={sid:<25} name={snm}")
            except Exception:
                pass
    except Exception:
        pass
    log.info("  ── FIN DEBUG ──")


async def setear_fechas(iframe, f_inicio, f_fin):
    selectores = [
        ("#fFechaInicio",          "#fFechaFin"),
        ("#txtFechaInicio",        "#txtFechaFin"),
        ("input[name='fFechaInicio']",   "input[name='fFechaFin']"),
        ("input[name='txtFechaInicio']", "input[name='txtFechaFin']"),
    ]
    for sel_ini, sel_fin in selectores:
        try:
            el = iframe.locator(sel_ini)
            if await el.count() > 0:
                await el.click(click_count=3)
                await el.fill(f_inicio)
                await iframe.locator(sel_fin).click(click_count=3)
                await iframe.locator(sel_fin).fill(f_fin)
                log.info(f"  Fechas OK ({sel_ini}): {f_inicio} → {f_fin}")
                return True
        except Exception:
            continue
    try:
        inputs = iframe.locator("input[type='text']")
        count = await inputs.count()
        for idx in range(min(count, 12)):
            val = await inputs.nth(idx).get_attribute("value") or ""
            if "/" in val and len(val) >= 8 and idx + 1 < count:
                await inputs.nth(idx).click(click_count=3)
                await inputs.nth(idx).fill(f_inicio)
                await inputs.nth(idx + 1).click(click_count=3)
                await inputs.nth(idx + 1).fill(f_fin)
                log.info(f"  Fechas OK (fallback input[{idx}]): {f_inicio} → {f_fin}")
                return True
    except Exception:
        pass
    log.warning("  No pude setear fechas — usando default de NEO")
    await dump_inputs(iframe)
    return False


async def descargar():
    from playwright.async_api import async_playwright

    f_inicio, f_fin = rango_30_dias()
    log.info(f"Últimos 30 días: {f_inicio[:2]}/{f_inicio[2:4]}/{f_inicio[4:]} → {f_fin[:2]}/{f_fin[2:4]}/{f_fin[4:]}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx     = await browser.new_context(accept_downloads=True)
        page    = await ctx.new_page()

        # ── Login ──────────────────────────────────────────────────────────────
        log.info("Abriendo NEO...")
        await page.goto(NEO_URL)
        await page.get_by_role("textbox", name="Usuario o correo electrónico").fill(NEO_USUARIO)
        await page.get_by_role("textbox", name="Contraseña").fill(NEO_CLAVE)
        await page.get_by_role("button", name="Ingresar").click()
        await page.wait_for_load_state("networkidle")
        log.info("Login OK")

        # ── Verificar empresa: Corporación Rojimo (984) ────────────────────────
        await page.get_by_title("Perfil").click()
        await page.locator("#cboEmpresa").select_option(EMPRESA_ID)
        await page.wait_for_load_state("networkidle")
        log.info(f"  Empresa OK ({EMPRESA_ID} = Rojimo)")

        if not await relogin_si_hace_falta(page, NEO_USUARIO, NEO_CLAVE, log):
            raise RuntimeError(f"NEO sigue en Login.aspx — sesión tomada por otro cliente. URL: {page.url}")

        # ── Navegar: Proveeduría → Ítems comprados ─────────────────────────────
        await page.locator("#mostrar_barra_izquierda").click()
        await page.get_by_role("link", name="Proveeduría").click()
        await page.wait_for_timeout(2000)

        iframe = page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame
        await iframe.get_by_role("link", name=" Ítems comprados").click()
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)
        log.info("✅ Ítems comprados cargado")

        # ── Setear rango de fechas (últimos 30 días) ───────────────────────────
        await setear_fechas(iframe, f_inicio, f_fin)

        # ── Refrescar para que NEO cargue el rango nuevo ───────────────────────
        try:
            await iframe.get_by_role("button", name="Refrescar").click()
            log.info("  Click en Refrescar")
        except Exception:
            try:
                await iframe.locator("input[value='Refrescar']").click()
                log.info("  Click en Refrescar (fallback)")
            except Exception:
                log.warning("  No encontré botón Refrescar")

        # NEO es lento — esperar que el reporte termine de cargar
        # Esperamos el footer "X registros" en lugar del botón Exportar (que aparece de inmediato)
        log.info("Esperando datos (puede tardar varios minutos)...")
        try:
            await iframe.locator("text=registros").wait_for(timeout=180_000)
            log.info("  Datos cargados")
            # Pausa extra para que termine el render
            await page.wait_for_timeout(5_000)
        except Exception:
            log.warning("Timeout 180s — esperando 15s extra y exportando igual")
            await page.wait_for_timeout(15_000)

        # ── Exportar Excel ─────────────────────────────────────────────────────
        log.info("Descargando Excel...")
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        excel_path = DOWNLOAD_DIR / f"items_comprados_{ts}.xlsx"

        async with page.expect_download(timeout=120_000) as dl_info:
            await iframe.get_by_role("button", name="Exportar").click()

        dl = await dl_info.value
        await dl.save_as(excel_path)
        await browser.close()

    size = excel_path.stat().st_size
    log.info(f"✅ Descargado: {excel_path} ({size:,} bytes)")
    return excel_path


# ─── SUBIR A SUPABASE ─────────────────────────────────────────────────────────

def subir_a_supabase(excel_path):
    try:
        import pandas as pd
    except ImportError:
        log.error("pandas no instalado: pip3 install pandas openpyxl")
        return False

    log.info("Leyendo Excel...")

    # Buscar la fila de encabezados (la primera que tenga "Compra")
    raw = pd.read_excel(excel_path, header=None, dtype=str)
    header_row = None
    for i, row in raw.iterrows():
        if any(norm(str(v)) == "Compra" for v in row if pd.notna(v)):
            header_row = i
            break

    if header_row is None:
        log.error("❌ No se encontró fila con 'Compra' — abortando para no dañar la BD")
        return False

    df = pd.read_excel(excel_path, header=header_row, dtype=str)
    df.columns = [norm(c) for c in df.columns]
    log.info(f"  Headers en fila {header_row}: {list(df.columns)}")

    df = df.rename(columns=COL_MAP)
    cols = [c for c in COL_MAP.values() if c in df.columns]
    log.info(f"  Columnas mapeadas: {cols}")

    if "compra" not in cols:
        log.error("❌ No se encontró columna 'Compra' — abortando")
        return False

    df = df[cols].copy()

    # Limpiar filas vacías / totales
    df = df.dropna(subset=["compra"])
    df = df[df["compra"].astype(str).str.strip() != ""]
    df = df[~df["compra"].astype(str).str.startswith("Total")]

    total = len(df)
    if total < 10:
        log.error(f"❌ Solo {total} filas — posible error en descarga. Abortando.")
        return False

    # Metadatos
    fecha_carga = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    df["fecha_carga"]     = fecha_carga
    df["periodo_reporte"] = "Sin período"

    registros = json.loads(df.to_json(orient="records", force_ascii=False))

    # ── Borrar snapshot anterior e insertar nuevo ──────────────────────────────
    log.info("Borrando snapshot anterior...")
    supa_request("DELETE", f"{TABLA}?id=gt.0")

    log.info(f"Insertando {total:,} registros...")
    BATCH = 200
    ok = 0
    for i in range(0, total, BATCH):
        lote = registros[i:i + BATCH]
        status = supa_request("POST", TABLA, lote)
        if status and status < 300:
            ok += len(lote)
        else:
            log.warning(f"  Lote {i}–{i+len(lote)} falló (status={status})")

    log.info(f"✅ Supabase: {ok:,}/{total:,} registros cargados")
    exito = ok == total

    # Actualizar sync_status para que el badge en SOL muestre la hora correcta
    ahora = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    supa_request("PATCH", "sync_status?id=eq.items_comprados", {
        "ultima_sync": ahora,
        "exitoso": exito,
        "updated_at": ahora,
    })
    log.info("  sync_status actualizado")

    return exito


# ─── MAIN ─────────────────────────────────────────────────────────────────────

async def main():
    log.info("=" * 50)
    log.info(f"NEO → Ítems comprados  [{datetime.now():%Y-%m-%d %H:%M}]")
    log.info("=" * 50)

    try:
        excel_path = await descargar()
        subir_a_supabase(excel_path)
        log.info("Listo.")
    except Exception as e:
        log.error(f"Error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
