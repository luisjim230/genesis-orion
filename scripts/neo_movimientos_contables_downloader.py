"""
neo_movimientos_contables_downloader.py — Descarga "Movimientos de cuentas"
de NEO y sube a Supabase (tabla neo_movimientos_contables).
Selectores obtenidos con Playwright Codegen el 2026-03-29.

Rango de fechas: 1° del mes actual hasta hoy (dinámico).

Cómo correr manualmente:
  cd ~/Documents/GitHub/genesis-orion/scripts
  python3 neo_movimientos_contables_downloader.py

Horario automático: definir en LaunchAgent.
"""

import os, sys, asyncio, logging, json, urllib.request, urllib.error
import unicodedata
from pathlib import Path
from datetime import datetime, date

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

TABLA = "neo_movimientos_contables"

DOWNLOAD_DIR = BASE / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)
LOG_FILE     = BASE / "neo-movimientos-contables.log"

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
    """Retorna (inicio, fin) en formato DDMMYYYY: 1° hasta el último día del mes."""
    hoy = date.today()
    inicio = hoy.replace(day=1)
    # Último día del mes: día 1 del mes siguiente menos 1
    if hoy.month == 12:
        fin = hoy.replace(day=31)
    else:
        fin = hoy.replace(month=hoy.month + 1, day=1).replace(day=1)
        from datetime import timedelta
        fin = fin - timedelta(days=1)
    return inicio.strftime("%d%m%Y"), fin.strftime("%d%m%Y")


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
    norm("Asiento contable"):               "asiento",
    norm("Fecha"):                          "fecha",
    norm("Tipo"):                           "tipo",
    norm("Cuenta contable"):                "cuenta_contable",
    norm("Centro de costo"):                "centro_costo",
    norm("Debe (Moneda del asiento)"):      "debe_moneda_asiento",
    norm("Moneda"):                         "moneda_debe",
    norm("Haber (Moneda del asiento)"):     "haber_moneda_asiento",
    norm("Moneda1"):                        "moneda_haber",
    norm("Debe (Moneda de contabilidad)"): "debe_contabilidad",
    norm("Moneda2"):                        "moneda_debe_cont",
    norm("Haber (Moneda de contabilidad)"):"haber_contabilidad",
    norm("Moneda3"):                        "moneda_haber_cont",
    norm("Observaciones del asiento"):      "observaciones_asiento",
    norm("Observaciones del movimiento"):   "observaciones_movimiento",
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

        if not await relogin_si_hace_falta(page, NEO_USUARIO, NEO_CLAVE, log):
            raise RuntimeError(f"NEO sigue en Login.aspx — sesión tomada por otro cliente. URL: {page.url}")

        # ── Navegar: Contabilidad → Movimientos de cuentas ────────────────────
        await page.locator("#mostrar_barra_izquierda").click()
        await page.get_by_role("link", name="Contabilidad").click()
        await page.wait_for_timeout(2000)

        iframe = page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame
        await iframe.get_by_role("link", name=" Movimientos de cuentas").click()
        await page.wait_for_load_state("networkidle")
        log.info("✅ Movimientos de cuentas cargado")

        # ── Fechas: 1° del mes hasta el último día del mes ────────────────────
        await iframe.locator("#fFechaInicio").click(click_count=3)
        await iframe.locator("#fFechaInicio").fill(f_inicio)
        log.info(f"  Fecha inicio OK: {f_inicio}")
        try:
            await iframe.locator("#fFechaFin").wait_for(timeout=10000)
            await iframe.locator("#fFechaFin").click(click_count=3)
            await iframe.locator("#fFechaFin").fill(f_fin)
            log.info(f"  Fecha fin OK: {f_fin}")
        except Exception:
            log.warning(f"  No se encontró #fFechaFin — continuando con inicio={f_inicio}")

        # ── Refrescar y esperar datos ──────────────────────────────────────────
        await iframe.get_by_role("button", name="Refrescar").click()
        log.info("Esperando datos (NEO es lento)...")
        try:
            await iframe.locator("text=registros").wait_for(timeout=120_000)
            log.info("  Datos cargados")
        except Exception:
            log.warning("Timeout 120s — exportando igual")

        # ── Exportar Excel ─────────────────────────────────────────────────────
        log.info("Descargando Excel...")
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        excel_path = DOWNLOAD_DIR / f"movimientos_contables_{ts}.xlsx"

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

    # Buscar fila de encabezados (primera con "Asiento contable" en columna 0)
    raw = pd.read_excel(excel_path, header=None, dtype=str)
    header_row = None
    for i, row in raw.iterrows():
        first_val = norm(str(row.iloc[0])) if pd.notna(row.iloc[0]) else ""
        if first_val == "Asiento contable":
            header_row = i
            break

    if header_row is None:
        log.error("❌ No se encontró fila con 'Asiento contable' — abortando")
        return False

    df = pd.read_excel(excel_path, header=header_row, dtype=str)
    df.columns = [norm(c) for c in df.columns]
    log.info(f"  Headers en fila {header_row}: {list(df.columns)}")

    df = df.rename(columns=COL_MAP)
    cols = [c for c in COL_MAP.values() if c in df.columns]
    log.info(f"  Columnas mapeadas: {cols}")

    if "asiento" not in cols:
        log.error("❌ No se encontró columna 'Asiento contable' — abortando")
        return False

    df = df[cols].copy()

    # Filtrar filas vacías y totales
    df = df.dropna(subset=["asiento"])
    df = df[df["asiento"].astype(str).str.strip() != ""]
    df = df[~df["asiento"].astype(str).str.upper().str.startswith("TOTAL")]

    # Deduplicar por el constraint único
    df = df.drop_duplicates(subset=["asiento", "cuenta_contable", "debe_contabilidad", "haber_contabilidad"], keep="last")

    total = len(df)
    if total < 1:
        log.error(f"❌ Solo {total} filas — posible error. Abortando.")
        return False

    # Metadatos
    hoy = date.today()
    fecha_carga = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    periodo = f"{hoy.year}-{str(hoy.month).zfill(2)}"
    df["fecha_carga"]     = fecha_carga
    df["periodo_reporte"] = periodo

    registros = json.loads(df.to_json(orient="records", force_ascii=False))

    log.info(f"Insertando/actualizando {total:,} registros...")
    BATCH = 200
    ok = 0
    for i in range(0, total, BATCH):
        lote = registros[i:i + BATCH]
        status = supa_request(
            "POST",
            f"{TABLA}?on_conflict=asiento,cuenta_contable,debe_contabilidad,haber_contabilidad",
            lote,
        )
        if status and status < 300:
            ok += len(lote)
        else:
            log.warning(f"  Lote {i}–{i+len(lote)} falló (status={status})")

    log.info(f"✅ Supabase: {ok:,}/{total:,} registros cargados")
    exito = ok == total

    # Actualizar sync_status
    ahora = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    supa_request("PATCH", "sync_status?id=eq.movimientos_contables", {
        "ultima_sync": ahora, "exitoso": exito, "updated_at": ahora,
    })
    log.info("  sync_status actualizado")

    return exito


# ─── MAIN ─────────────────────────────────────────────────────────────────────

async def main():
    log.info("=" * 50)
    log.info(f"NEO → Movimientos contables  [{datetime.now():%Y-%m-%d %H:%M}]")
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
