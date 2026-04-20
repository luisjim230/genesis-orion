"""
neo_antiguedad_clientes_downloader.py — Descarga "Antigüedad de saldos — Clientes"
de NEO y sube a Supabase (tabla fin_cuentas_cobrar).
Selectores obtenidos con Playwright Codegen el 2026-03-29.

Cómo correr manualmente:
  cd ~/Documents/GitHub/genesis-orion/scripts
  python3 neo_antiguedad_clientes_downloader.py

Horario automático: definir en LaunchAgent (por configurar).
"""

import os, sys, asyncio, logging, json, urllib.request, urllib.error
import unicodedata
from pathlib import Path
from datetime import datetime

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

TABLA       = "fin_cuentas_cobrar"

DOWNLOAD_DIR = BASE / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)
LOG_FILE     = BASE / "neo-antiguedad-clientes.log"

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
    norm("Vendedor"):                       "vendedor",
    norm("Territorio"):                     "territorio",
    norm("Código"):                         "codigo",
    norm("Cliente"):                        "cliente",
    norm("Tipo"):                           "tipo",
    norm("Número"):                         "numero",
    norm("Fecha de la factura"):            "fecha_factura",
    norm("Fecha de vencimiento"):           "fecha_vencimiento",
    norm("Saldo original"):                 "saldo_original",
    norm("Cobros aplicados"):               "cobros_aplicados",
    norm("Notas de crédito aplicadas"):     "notas_credito",
    norm("Notas de débito aplicadas"):      "notas_debito",
    norm("Saldo actual"):                   "saldo_actual",
    norm("Moneda"):                         "moneda",
    norm("Sin vencer"):                     "sin_vencer",
    norm("1 - 30 Días"):                    "dias_1_30",
    norm("31 - 60 Días"):                   "dias_31_60",
    norm("61 - 90 Días"):                   "dias_61_90",
    norm("91 - 120 Días"):                  "dias_91_120",
    norm("Más de 120 Días"):               "mas_120_dias",
    norm("Notas"):                          "notas",
}


# ─── DESCARGA ─────────────────────────────────────────────────────────────────

async def descargar():
    from playwright.async_api import async_playwright

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

        # ── Navegar: Cuentas por cobrar → Antigüedad de saldos ────────────────
        await page.locator("#mostrar_barra_izquierda").click()
        await page.get_by_role("link", name="Cuentas por cobrar").click()
        await page.wait_for_timeout(2000)

        iframe = page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame
        await iframe.get_by_role("link", name=" Antigüedad de saldos de").click()
        await page.wait_for_load_state("networkidle")
        log.info("✅ Antigüedad de saldos clientes cargado")

        # ── Configurar reporte ─────────────────────────────────────────────────
        await iframe.locator("#cboOrdenar").select_option("1")
        await iframe.locator("#chkResumido").uncheck()
        log.info("  Configuración OK (ordenar=Código, detallado)")

        # ── Generar reporte ────────────────────────────────────────────────────
        await iframe.get_by_role("button", name="Aceptar").click()
        log.info("Generando reporte (NEO es lento)...")

        try:
            reporte_frame = iframe.locator("#ifReporte").content_frame
            await reporte_frame.wait_for_selector(
                "button:has-text('Exportar a excel')", timeout=300_000
            )
            log.info("  Reporte generado, botón de exportar visible")
        except Exception:
            log.warning("Timeout 300s — intentando exportar igual")
            reporte_frame = iframe.locator("#ifReporte").content_frame

        # ── Exportar Excel ─────────────────────────────────────────────────────
        log.info("Descargando Excel...")
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        excel_path = DOWNLOAD_DIR / f"antiguedad_clientes_{ts}.xlsx"

        async with page.expect_download(timeout=300_000) as dl_info:
            await reporte_frame.get_by_role("button", name="Exportar a excel").click()

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

    # Buscar fila de encabezados (primera con "Vendedor" en columna 0)
    raw = pd.read_excel(excel_path, header=None, dtype=str)
    header_row = None
    for i, row in raw.iterrows():
        first_val = norm(str(row.iloc[0])) if pd.notna(row.iloc[0]) else ""
        if first_val == "Vendedor":
            header_row = i
            break

    if header_row is None:
        log.error("❌ No se encontró fila con 'Vendedor' — abortando")
        return False

    df = pd.read_excel(excel_path, header=header_row, dtype=str)
    df.columns = [norm(c) for c in df.columns]
    log.info(f"  Headers en fila {header_row}: {list(df.columns)}")

    df = df.rename(columns=COL_MAP)
    cols = [c for c in COL_MAP.values() if c in df.columns]
    log.info(f"  Columnas mapeadas: {cols}")

    if "cliente" not in cols:
        log.error("❌ No se encontró columna 'Cliente' — abortando")
        return False

    df = df[cols].copy()

    # Filtrar filas vacías, totales y subtotales por cliente (sin fecha_factura)
    df = df.dropna(subset=["cliente"])
    df = df[df["cliente"].astype(str).str.strip() != ""]
    df = df[df["fecha_factura"].notna()]  # excluir subtotales por cliente

    total = len(df)
    if total < 5:
        log.error(f"❌ Solo {total} filas — posible error. Abortando.")
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

    # Actualizar sync_status
    ahora = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    supa_request("PATCH", "sync_status?id=eq.antiguedad_clientes", {
        "ultima_sync": ahora,
        "exitoso": exito,
        "updated_at": ahora,
    })
    log.info("  sync_status actualizado")

    return exito


# ─── MAIN ─────────────────────────────────────────────────────────────────────

async def main():
    log.info("=" * 50)
    log.info(f"NEO → Antigüedad saldos clientes  [{datetime.now():%Y-%m-%d %H:%M}]")
    log.info("=" * 50)

    excel_path = await descargar()
    subir_a_supabase(excel_path)
    log.info("Listo.")


if __name__ == "__main__":
    asyncio.run(main())
