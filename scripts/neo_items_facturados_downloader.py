"""
neo_items_facturados_downloader.py — Descarga "Lista de ítems facturados" de NEO
y sube a Supabase (tabla neo_items_facturados).
Selectores obtenidos con Playwright Codegen el 2026-03-29.

Rango de fechas: 1° del mes actual hasta hoy (dinámico).

Cómo correr manualmente:
  cd ~/Documents/GitHub/genesis-orion/scripts
  python3 neo_items_facturados_downloader.py

Horario automático: definir en LaunchAgent (por configurar).
"""

import os, sys, asyncio, logging, json, urllib.request, urllib.error
import unicodedata
from pathlib import Path
from datetime import datetime, date

BASE = Path(__file__).parent

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

def rango_fechas():
    """Retorna (inicio, fin) en formato DDMMYYYY: 1° del mes actual hasta hoy."""
    hoy = date.today()
    inicio = hoy.replace(day=1)
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

async def descargar():
    from playwright.async_api import async_playwright

    f_inicio, f_fin = rango_fechas()
    log.info(f"  Rango: {f_inicio[:2]}/{f_inicio[2:4]}/{f_inicio[4:]} → {f_fin[:2]}/{f_fin[2:4]}/{f_fin[4:]}")

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

        # ── Navegar: Ventas → Ítems facturados ────────────────────────────────
        await page.locator("#mostrar_barra_izquierda").click()
        await page.get_by_role("link", name="Ventas").click()
        await page.wait_for_timeout(2000)

        iframe = page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame
        await iframe.get_by_role("link", name="Ítems facturados").nth(1).click()
        await page.wait_for_load_state("networkidle")
        log.info("✅ Ítems facturados cargado")

        # ── Fechas: 1° del mes hasta hoy ──────────────────────────────────────
        fecha_ok = False
        # Intentar múltiples selectores para los campos de fecha
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
                    fecha_ok = True
                    break
            except Exception:
                continue
        # Fallback: buscar cualquier input tipo fecha visible en el iframe
        if not fecha_ok:
            try:
                inputs = iframe.locator("input[type='text']")
                count = await inputs.count()
                log.info(f"  Buscando campos de fecha entre {count} inputs...")
                for idx in range(min(count, 10)):
                    val = await inputs.nth(idx).get_attribute("value") or ""
                    el_id = await inputs.nth(idx).get_attribute("id") or ""
                    log.info(f"    input[{idx}] id='{el_id}' value='{val}'")
                    # Si el valor parece una fecha (contiene /) intentar usarlo
                    if "/" in val and len(val) >= 8 and idx + 1 < count:
                        await inputs.nth(idx).click(click_count=3)
                        await inputs.nth(idx).fill(f_inicio)
                        await inputs.nth(idx + 1).click(click_count=3)
                        await inputs.nth(idx + 1).fill(f_fin)
                        log.info(f"  Fechas OK (fallback input[{idx}]): {f_inicio} → {f_fin}")
                        fecha_ok = True
                        break
            except Exception as e:
                log.warning(f"  Error en fallback de fechas: {e}")
        if not fecha_ok:
            log.warning("  No se encontraron campos de fecha — usando valores por defecto")

        # ── Refrescar y esperar datos ──────────────────────────────────────────
        await iframe.get_by_role("button", name="Refrescar").click()
        log.info("Esperando datos (NEO es lento)...")
        try:
            await iframe.locator("text=registros").wait_for(timeout=90_000)
            log.info("  Datos cargados")
        except Exception:
            log.warning("Timeout 90s — exportando igual")

        # ── Exportar Excel ─────────────────────────────────────────────────────
        log.info("Descargando Excel...")
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        excel_path = DOWNLOAD_DIR / f"items_facturados_{ts}.xlsx"

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

    excel_path = await descargar()
    subir_a_supabase(excel_path)
    log.info("Listo.")


if __name__ == "__main__":
    asyncio.run(main())
