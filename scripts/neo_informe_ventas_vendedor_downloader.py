"""
neo_informe_ventas_vendedor_downloader.py — Descarga "Informe de ventas" agrupado
por vendedor de NEO y sube a Supabase (tabla neo_informe_ventas_vendedor).
Selectores obtenidos con Playwright Codegen el 2026-03-29.

Rango de fechas: 1° del mes actual hasta hoy (dinámico).

Cómo correr manualmente:
  cd ~/Documents/GitHub/genesis-orion/scripts
  python3 neo_informe_ventas_vendedor_downloader.py

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

TABLA = "neo_informe_ventas_vendedor"

DOWNLOAD_DIR = BASE / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)
LOG_FILE     = BASE / "neo-informe-ventas-vendedor.log"

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
    norm("Vendedor"):                               "vendedor",
    norm("Unidades vendidas"):                      "unidades_vendidas",
    norm("Ventas sin impuestos"):                   "ventas_sin_imp",
    norm("Ventas con impuestos"):                   "ventas_con_imp",
    norm("Notas a clientes sin impuestos"):         "notas_sin_imp",
    norm("Notas a clientes con impuestos"):         "notas_con_imp",
    norm("Impuestos ventas"):                       "imp_ventas",
    norm("Impuestos notas"):                        "imp_notas",
    norm("Ventas / Otros cargos"):                  "ventas_otros_cargos",
    norm("Notas a clientes / Otros cargos"):        "notas_otros_cargos",
    norm("Ventas totales"):                         "ventas_totales",
    norm("Notas a clientes totales"):               "notas_totales",
    norm("Ventas netas"):                           "ventas_netas",
    norm("Costo"):                                  "costo",
    norm("Utilidad"):                               "utilidad",
    norm("% Utilidad"):                             "pct_utilidad",
    norm("Utilidad/Costo"):                         "util_costo",
    norm("Transacciones"):                          "transacciones",
    norm("Tiquete promedio"):                       "tiquete_promedio",
}

NUMERIC_COLS = [
    "unidades_vendidas", "ventas_sin_imp", "ventas_con_imp", "notas_sin_imp",
    "notas_con_imp", "imp_ventas", "imp_notas", "ventas_otros_cargos",
    "notas_otros_cargos", "ventas_totales", "notas_totales", "ventas_netas",
    "costo", "utilidad", "pct_utilidad", "util_costo", "transacciones", "tiquete_promedio",
]


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

        # ── Navegar: Ventas → Informe de ventas ───────────────────────────────
        await page.locator("#mostrar_barra_izquierda").click()
        await page.get_by_role("link", name="Ventas").click()
        await page.wait_for_timeout(2000)

        iframe = page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame
        await iframe.get_by_role("link", name=" Informe de ventas").click()
        await page.wait_for_load_state("networkidle")
        log.info("✅ Informe de ventas cargado")

        # ── Agrupar por Vendedor ───────────────────────────────────────────────
        await iframe.locator("#cboAgrupar").select_option("13")
        log.info("  Agrupado por Vendedor (13)")

        # ── Fechas: 1° del mes hasta hoy ──────────────────────────────────────
        fecha_ok = False
        for sel_inicio, sel_fin in [
            ("#fFechaInicio", "#fFechaFin"),
            ("#txtFechaInicio", "#txtFechaFin"),
            ("#fInicio", "#fFin"),
            ("input[name='fFechaInicio']", "input[name='fFechaFin']"),
        ]:
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
        # Fallback: buscar inputs con valor tipo fecha
        if not fecha_ok:
            try:
                inputs = iframe.locator("input[type='text']")
                count = await inputs.count()
                log.info(f"  Buscando campos de fecha entre {count} inputs...")
                for idx in range(min(count, 15)):
                    val = await inputs.nth(idx).get_attribute("value") or ""
                    el_id = await inputs.nth(idx).get_attribute("id") or ""
                    log.info(f"    input[{idx}] id='{el_id}' value='{val}'")
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

        # ── Generar reporte ────────────────────────────────────────────────────
        await iframe.get_by_role("button", name="Aceptar").click()
        log.info("Generando reporte (NEO es lento)...")

        try:
            reporte_frame = iframe.locator("#ifReporte").content_frame
            await reporte_frame.wait_for_selector(
                "button:has-text('Exportar a excel')", timeout=120_000
            )
            log.info("  Reporte generado, botón de exportar visible")
        except Exception:
            log.warning("Timeout 120s — intentando exportar igual")
            reporte_frame = iframe.locator("#ifReporte").content_frame

        # ── Exportar Excel ─────────────────────────────────────────────────────
        log.info("Descargando Excel...")
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        excel_path = DOWNLOAD_DIR / f"informe_ventas_vendedor_{ts}.xlsx"

        async with page.expect_download(timeout=120_000) as dl_info:
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

    if "vendedor" not in cols:
        log.error("❌ No se encontró columna 'Vendedor' — abortando")
        return False

    df = df[cols].copy()

    # Limpiar columnas numéricas (quitar " %", comas, espacios)
    for col in NUMERIC_COLS:
        if col in df.columns:
            df[col] = df[col].astype(str).str.replace(r'[%,\s]', '', regex=True)
            df[col] = df[col].replace({'nan': None, '': None})

    # Filtrar filas vacías y totales
    df = df.dropna(subset=["vendedor"])
    df = df[df["vendedor"].astype(str).str.strip() != ""]
    df = df[~df["vendedor"].astype(str).str.upper().str.startswith("TOTAL")]
    df = df[~df["vendedor"].astype(str).str.upper().str.startswith("GRAN TOTAL")]

    total = len(df)
    if total < 1:
        log.error(f"❌ Solo {total} filas — posible error. Abortando.")
        return False

    # Metadatos
    hoy = date.today()
    fecha_carga = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    mes = f"{hoy.year}-{str(hoy.month).zfill(2)}"
    df["fecha_carga"]     = fecha_carga
    df["periodo_reporte"] = mes
    df["mes"]             = mes

    registros = json.loads(df.to_json(orient="records", force_ascii=False))

    # ── Borrar solo el mes actual e insertar nuevo (preserva meses anteriores) ─
    log.info(f"Borrando mes {mes} para re-insertar...")
    supa_request("DELETE", f"{TABLA}?mes=eq.{mes}")

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
    supa_request("PATCH", "sync_status?id=eq.informe_ventas_vendedor", {
        "ultima_sync": ahora, "exitoso": exito, "updated_at": ahora,
    })
    log.info("  sync_status actualizado")

    return exito


# ─── MAIN ─────────────────────────────────────────────────────────────────────

async def main():
    log.info("=" * 50)
    log.info(f"NEO → Informe de ventas por vendedor  [{datetime.now():%Y-%m-%d %H:%M}]")
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
